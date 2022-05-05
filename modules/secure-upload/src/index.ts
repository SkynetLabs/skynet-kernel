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
} from "libskynet"

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
//
// The declaration of 'onmessage' is ignored by eslint because it doesn't like
// that onmessage is never called but since it's a function and not a variable
// I couldn't get the regexes to ignore the 'onmessage' declaration.
onmessage = function (event: MessageEvent) {
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

	// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
	// Note: Properties of non-array objects are not guaranteed to be stringified in any particular order.
	// Do not rely on ordering of properties within the same object within the stringification.
	let metadataBytes = new TextEncoder().encode(JSON.stringify(metadata))

	// Build the layout of the skyfile.
	let layoutBytes = new Uint8Array(99)
	let offset = 0
	layoutBytes[offset] = 1 // Set the Version
	offset += 1

	// that's a very go way to deal with errors, in javascript it's common to throw an error and let
	// the consumer use try-catch instead of returning a response and error pair, also you wouldn't
	// need to resort to naming the errors like errU641, errU642 errU643
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

	// this should never be the case, is this just a message used in development ?
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
	
	// assign "1 << 22" to a variable like "sectorSize" or sth
	let baseSector = new Uint8Array(1 << 22)

	// use new variable instead, changing purpose of the variable just to reuse it
	// should be avoided to avoid potential bugs; in fact, I would set layoutBytesOffset,
	// metadataBytesOffset and fileDataOffset instead of incrementing the offset each time
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

	// some of those numbers (example but not limited to 7, 92 or 15 below) are not explained
	// it would benefit readability to either assign them to a variable with verbose name or add comments

	// Build the header for the upload call.
	let header = new Uint8Array(92)
	let [headerMetadataPrefix, errU644] = encodeU64(15n)
	if (errU644 !== null) {
		respondErr(event, addContextToErr(errU644, "unable to encode header metadata length"))
		return
	}

	// is "Skyfile Backup" text part of the header metadata? maybe create a separate function
	// for that logic below ie. createHeaderMetadata - would help with readability

	let headerMetadata = new TextEncoder().encode("Skyfile Backup\n")
	let [versionPrefix, errU645] = encodeU64(7n)
	if (errU645 !== null) {
		respondErr(event, addContextToErr(errU645, "unable to encode version prefix length"))
		return
	}

	// should that 1.5.5 be hardcoded? doesn't seem right

	let version = new TextEncoder().encode("v1.5.5\n")
	let [skylinkPrefix, errU646] = encodeU64(46n)
	if (errU646 !== null) {
		respondErr(event, addContextToErr(errU646, "unable to encode skylink length"))
		return
	}
	let skylink = bufToB64(skylinkBytes)

	// use new variable instead, changing purpose of the variable just to reuse it

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
		if (result.success !== true) {
			let err = JSON.stringify(result.messagesFailed)
			respondErr(event, addContextToErr(err, "unable to complete upload"))
			return
		}
		result.response
			.json()

			// use meaningful variable names like data or responseData instead of j

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

			// err is an "Error" instance

			.catch((err: string) => {
				respondErr(
					event,
					addContextToErr(err, "unable to read response body, despite verification of response succeeding")
				)
			})
	})
}
