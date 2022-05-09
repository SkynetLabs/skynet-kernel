// secure-download is a module which will download a file from Skynet. The hash
// of the file is computed locally after the data is received to ensure that
// the data matches the skylink.

import {
	addContextToErr,
	b64ToBuf,
	defaultPortalList,
	parseSkylinkBitfield,
	progressiveFetch,
	validSkylink,
	verifyDownload,
	verifyResolverLinkProofs,
} from "libskynet"

// nu8: objects are passed as reference so create a new one each time
// otherwise something might overwrite the data

// Helper consts to make it easier to return empty values alongside errors.
const nu8 = new Uint8Array(0)

// Create helper function for responding to a query with an error.
function respondErr(event: MessageEvent, err: string | null) {
	postMessage({
		nonce: event.data.nonce,
		method: "response",
		err,
		data: null,
	})
}

// parseJSON is a wrapper for JSON.parse that returns an error rather than
// throwing an error.
function parseJSON(json: string): [any, string | null] {
	try {
		let obj = JSON.parse(json)
		return [obj, null]
	} catch (err: any) {
		return [{}, err.toString()]
	}
}

// onmessage receives messages from the kernel. The kernel will ensure the
// standard fields are all included.
onmessage = function (event) {
	// Check for known methods.
	if (event.data.method === "secureDownload") {
		handleSecureDownload(event)
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

// fileDataObj defines the fileData object that we use in
// verifyDownloadResponse to return the fileData back to the caller.
interface fileDataObj {
	fileData: Uint8Array
	err: string | null
}

// Establish the function that verifies the result is correct.
//
// The fileDataPtr input is an empty object that verifyDownloadResponse will
// fill with the fileData. It basically allows the verify function to
// communicate back to the caller. Note that the verify function might be
// called multiple times in a row if early portals fail to retrieve the data,
// but the verify function doesn't write to the fileDataPtr until it knows that
// the download is final.
function verifyDownloadResponse(
	response: Response,
	u8Link: Uint8Array,
	fileDataPtr: fileDataObj
): Promise<string | null> {
	return new Promise((resolve) => {
		if (response.status !== 200) {
			resolve("unrecognized response status " + response.status.toString() + ", expecting 200")
			return
		}

		// Technically we already checked this error, but we check it again
		// here anyway for good hygiene.
		let [version, offset, fetchSize, errBF] = parseSkylinkBitfield(u8Link)
		if (errBF !== null) {
			resolve(addContextToErr(errBF, "skylink bitfield could not be parsed"))
			return
		}

		// If this is a resolver skylink, we need to verify the resolver
		// proofs. This conditional will update the value of 'u8Link' to be the
		// value of the fully resolved link.
		if (version === 2n) {
			// Verify the resolver proofs and update the link to the correct
			// link.
			let proofJSON = response.headers.get("skynet-proof")
			if (proofJSON === null || proofJSON === undefined) {
				resolve("response did not include resolver proofs")
				return
			}
			let [proof, errPJ] = parseJSON(proofJSON)
			if (errPJ !== null) {
				resolve(addContextToErr(errPJ, "unable to parse resolver link proofs"))
				return
			}
			// We need to update the u8Link in-place so that the rest of the
			// function doesn't need special handling.
			let errVRLP: string | null

			// do not reuse function arguments by overwriting them, create new variables

			;[u8Link, errVRLP] = verifyResolverLinkProofs(u8Link, proof)
			if (errVRLP !== null) {
				resolve(addContextToErr(errVRLP, "unable to verify resolver link proofs"))
				return
			}

			// We also need to update the parsed bitfield, because the link has
			// changed.
			[version, offset, fetchSize, errBF] = parseSkylinkBitfield(u8Link)
			if (errBF !== null) {
				resolve(addContextToErr(errBF, "fully resolved link has invalid bitfield"))
				return
			}
			if (version !== 1n) {
				resolve("fully resolved link does not have version 1")
				return
			}
		}

		response
			.arrayBuffer()
			.then((buf) => {
				let [fileData, portalAtFault, errVD] = verifyDownload(u8Link.slice(2, 34), offset, fetchSize, buf)
				if (errVD !== null && portalAtFault) {
					// you probably want to display what portal was at fault too

					resolve("received invalid download from portal")
					return
				}
				if (errVD !== null) {
					fileDataPtr.fileData = nu8
					fileDataPtr.err = addContextToErr(errVD, "file is corrupt")
				} else {
					fileDataPtr.fileData = fileData
					fileDataPtr.err = null
				}
				// If the portal is not at fault, we tell progressiveFetch that
				// the download was a success. The caller will have to check
				// the fileDataPtr
				resolve(null)
			})
			.catch((err) => {
				resolve(addContextToErr(err, "unable to read response body"))
			})
	})
}

// handleSecureDownload will handle a call to secureDownload.
function handleSecureDownload(event: MessageEvent) {
	// Parse the skylink.
	if (!("skylink" in event.data.data)) {
		respondErr(event, "missing skylink from method data")
		return
	}
	if (typeof event.data.data.skylink !== "string") {
		respondErr(event, "filename is expected to be a string")
		return
	}
	let [u8Link, err64] = b64ToBuf(event.data.data.skylink)
	if (err64 !== null) {
		respondErr(event, addContextToErr(err64, "unable to decode skylink"))
		return
	}
	if (!validSkylink(u8Link)) {
		respondErr(event, "skylink " + event.data.data.skylink + " is not valid")
		return
	}

	// Call progressiveFetch to perform the upload.
	let endpoint = "/skynet/trustless/basesector/" + event.data.data.skylink
	let fileDataPtr = { fileData: nu8, err: null }
	let verifyFunction = function (response: Response): Promise<string | null> {
		return verifyDownloadResponse(response, u8Link, fileDataPtr)
	}
	progressiveFetch(endpoint, null, defaultPortalList, verifyFunction).then((result: any) => {
		if (result.success !== true) {
			let err = JSON.stringify(result.messagesFailed)
			respondErr(event, addContextToErr(err, "unable to download file"))
			return
		}

		// relying on the reference to be changed is hard to debug, you should return the error
		// from the function / reject promise

		if (fileDataPtr.err !== null) {
			respondErr(event, addContextToErr(fileDataPtr.err, "file appears to be corrupt"))
			return
		}
		postMessage({
			nonce: event.data.nonce,
			method: "response",
			err: null,
			data: {
				fileData: fileDataPtr.fileData,
			},
		})
	})
}
