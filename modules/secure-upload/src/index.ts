// secure-upload is a module which will upload a file to Skynet. The skylink is
// computed locally before uploading to ensure that the portal cannot modify
// the data in the middle of the upload.

import {
	addContextToErr,
	blake2bMerkleRoot,
	bufToB64,
	defaultPortalList,
	encodeU64,
	progressiveFetch,
	skylinkV1Bitfield,
	validateSkyfileMetadata,
} from "libkernel"

// Create helper function for responding to a query with an error.
function respondErr(event: MessageEvent, err: string | null) {
	postMessage({
		nonce: event.data.nonce,
		method: "response",
		err,
		data: null,
	})
}

// onmessage receives messages from the kernel. The kernel will ensure the
// standard fields are all included.
function onmessage(event) {
	// Check for known methods.
	if (event.data.method === "secureUpload") {
		handleSecureUpload(event)
		return
	}

	// Check for 'presentSeed', which we currently ignore but it's not an
	// unrecognized method.
	if (event.data.method === "presentSeed") {
		return
	}

	// The kernelMethod was not recognized.
	respondErr(event, "unrecognized method: " + event.data.method)
	return
}

// handleSecureUpload will handle a call to secureUpload.
function handleSecureUpload(event: MessageEvent) {
	// Check for the two required fields: filename and fileData.
	if (!("filename" in event.data.data)) {
		respondErr(event, "missing filename from module data")
		return
	}
	if (typeof event.data.data.filename !== "string") {
		respondErr(event, "filename is expected to be a string")
		return
	}
	if (!("fileData" in event.data.data)) {
		respondErr(event, "missing fileData from module data")
		return
	}
	if (!(event.data.data.fileData instanceof Uint8Array)) {
		respondErr(event, "fileData is not a Uint8Array")
		return
	}

	// Convert the postmessage inputs into more usable variables.
	let fileData = event.data.data.fileData
	let metadata = {
		Filename: event.data.data.filename,
		Length: event.data.data.fileData.length,
	}

	// Check that this is a small file.
	if (fileData.length > 4 * 1000 * 1000) {
		respondErr(event, "currently only small uploads are supported, please use less than 4 MB")
		return
	}

	// Encode the metadata after checking that it is valid.
	let errVSM = validateSkyfileMetadata(metadata)
	if (errVSM !== null) {
		respondErr(event, addContextToErr(errVSM, "upload is using invalid metadata"))
		return
	}
	let metadataBytes = new TextEncoder().encode(JSON.stringify(metadata))

	// Build the layout of the skyfile.
	let layoutBytes = new Uint8Array(99)
	let offset = 0
	layoutBytes[offset] = 1 // Set the Version
	offset += 1
	let [filesizeBytes, errU641] = encodeU64(BigInt(fileData.length))
	if (errU641 !== null) {
		respondErr(event, addContextToErr(errU641, "unable to encode fileData length"))
		return
	}
	layoutBytes.set(filesizeBytes, offset)
	offset += 8
	let [mdSizeBytes, errU642] = encodeU64(BigInt(metadataBytes.length))
	if (errU642 !== null) {
		respondErr(event, addContextToErr(errU642, "unable to encode metadata bytes length"))
		return
	}
	layoutBytes.set(mdSizeBytes, offset)
	offset += 8
	let [fanoutSizeBytes, errU643] = encodeU64(0n)
	if (errU643 !== null) {
		respondErr(event, addContextToErr(errU643, "unable to encode fanout bytes length"))
		return
	}
	layoutBytes.set(fanoutSizeBytes, offset)
	offset += 8
	layoutBytes[offset] = 0 // Set the fanout data pieces
	offset += 1
	layoutBytes[offset] = 0 // Set the fanout parity pieces
	offset += 1
	layoutBytes[offset + 7] = 1 // Set the cipher type
	offset += 8
	if (offset + 64 !== 99) {
		respondErr(event, "error when building the layout bytes, got wrong final offset")
		return
	}

	// Build the base sector.
	let totalSize = layoutBytes.length + metadataBytes.length + fileData.length
	if (totalSize > 1 << 22) {
		respondErr(event, "error when building the base sector: total sector is too large")
		return
	}
	let baseSector = new Uint8Array(1 << 22)
	offset = 0
	baseSector.set(layoutBytes, offset)
	offset += layoutBytes.length
	baseSector.set(metadataBytes, offset)
	offset += metadataBytes.length
	baseSector.set(fileData, offset)

	// Compute the Skylink of this file.
	let [sectorRoot, errBMR] = blake2bMerkleRoot(baseSector)
	if (errBMR !== null) {
		respondErr(event, addContextToErr(errBMR, "unable to create bitfield for skylink"))
		return
	}
	let skylinkBytes = new Uint8Array(34)
	let [bitfield, errSV1B] = skylinkV1Bitfield(totalSize)
	if (errSV1B !== null) {
		respondErr(event, addContextToErr(errSV1B, "unable to create bitfield for skylink"))
		return
	}
	skylinkBytes.set(bitfield, 0)
	skylinkBytes.set(sectorRoot, 2)

	// Build the header for the upload call.
	let header = new Uint8Array(92)
	let [headerMetadataPrefix, errU644] = encodeU64(15n)
	if (errU644 !== null) {
		respondErr(event, addContextToErr(errU644, "unable to encode header metadata length"))
		return
	}
	let headerMetadata = new TextEncoder().encode("Skyfile Backup\n")
	let [versionPrefix, errU645] = encodeU64(7n)
	if (errU645 !== null) {
		respondErr(event, addContextToErr(errU645, "unable to encode version prefix length"))
		return
	}
	let version = new TextEncoder().encode("v1.5.5\n")
	let [skylinkPrefix, errU646] = encodeU64(46n)
	if (errU646 !== null) {
		respondErr(event, addContextToErr(errU646, "unable to encode skylink length"))
		return
	}
	let skylink = bufToB64(skylinkBytes)
	offset = 0
	header.set(headerMetadataPrefix, offset)
	offset += 8
	header.set(headerMetadata, offset)
	offset += 15
	header.set(versionPrefix, offset)
	offset += 8
	header.set(version, offset)
	offset += 7
	header.set(skylinkPrefix, offset)
	offset += 8
	header.set(new TextEncoder().encode(skylink), offset)

	// Build the full request body.
	let reqBody = new Uint8Array((1 << 22) + 92)
	reqBody.set(header, 0)
	reqBody.set(baseSector, 92)

	// Call progressiveFetch to perform the upload.
	let endpoint = "/skynet/restore"
	let fetchOpts = {
		method: "post",
		body: reqBody,
	}
	// Establish the function that verifies the result is correct.
	let verifyFunction = function (response: Response): Promise<string | null> {
		return new Promise((resolve) => {
			response
				.json()
				.then((j) => {
					if (!("skylink" in j)) {
						resolve("response is missing the skylink field\n" + JSON.stringify(j))
						return
					}
					if (j.skylink !== skylink) {
						resolve("wrong skylink was returned, expecting " + skylink + " but got " + j.skylink)
						return
					}
					resolve(null)
				})
				.catch((err) => {
					resolve(addContextToErr(err, "unable to read response body"))
				})
		})
	}
	progressiveFetch(endpoint, fetchOpts, defaultPortalList, verifyFunction).then((result: any) => {
		result.response
			.json()
			.then((j: any) => {
				postMessage({
					nonce: event.data.nonce,
					method: "response",
					err: null,
					data: {
						skylink: j.skylink,
					},
				})
			})
			.catch((err: string) => {
				respondErr(
					event,
					addContextToErr(err, "unable to read response body, despite verification of response succeeding")
				)
			})
	})
}
