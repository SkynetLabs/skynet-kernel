// secure-download is a module which will download a file from Skynet. The hash
// of the file is computed locally after the data is received to ensure that
// the data matches the skylink.

import {
	addContextToErr,
	b64ToBuf,
	defaultPortalList,
	parseJSON,
	parseSkylinkBitfield,
	progressiveFetch,
	validSkylink,
	verifyResolverLinkProofs,
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

// parseJSON is a wrapper for JSON.parse that returns an error rather than
// throwing an error.
function parseJSON(json: string): [any, string | null] {
	try {
		let obj = JSON.parse(json)
		return [obj, null]
	} catch (err) {
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

// Establish the function that verifies the result is correct.
function verifyDownloadResponse(response: Response, u8Link: Uint8Array): Promise<string | null> {
	return new Promise((resolve) => {
		if (response.status !== 200) {
			resolve("unrecognized response status, expecting 200")
			return
		}

		// Technically we already checked this error, but we check it again
		// here anyway for good hygiene.
		let [version, offset, fetchSize, errBF] = praseSkylinkBitfield(u8Link)
		if (errBF !== null) {
			resolve(addContextToErr(errBF, "skylink bitfield could not be parsed"))
			return
		}

		// If this is a resolver skylink, we need to verify the resolver
		// proofs. This conditional will update the value of 'u8Link' to be the
		// value of the fully resolved link.
		if (version === 2) {
			// Verify the resolver proofs and update the link to the correct
			// link.
			let proofJSON = response.headers.get("skynet-proof")
			if (proofJSON === null || proofJSON === undefined) {
				resolve("response did not include resolver proofs")
				return
			}
			let [proof, errPJ] = parseJSON(proofJSON)
			if (errPH !== null) {
				resolve(addContextToErr(errPJ, "unable to parse resolver link proofs"))
				return
			}
			// We need to update the u8Link in-place so that the rest of the
			// function doesn't need special handling.
			let errVRLP: string | null
			[u8Link, errVRLP] = verifyResolverLinkProofs(u8Link, proof)
			if (errVRLP !== null) {
				resolve(addContextToErr(errVRLP, "unable to verify resolver link proofs"))
				return
			}

			// We also need to update the prased bitfield, because the link has
			// changed.
			[version, offset, fetchSize, errBF] = parseSkylinkBitfield(u8Link)
			if (errBF !== null) {
				resolve(addContextToErr(errBF, "fully resolved link has invalid bitfield"))
				return
			}
			if (version !== 1) {
				resolve("fully resolved link does not have version 1")
				return
			}
		}

		response.arrayBuffer()
		.then((buf) => {
			let [, portalAtFault, errVD] = verifyDownload(u8Link.slice(2, 34), offset, fetchSize, buf)
			if (errVD !== null && portalAtFault) {
				resolve("received invalid download from portal")
				return
			}
			// If the portal is not at fault, we tell progressiveFetch that the
			// download was a success.
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
	let [u8Link, err64] = b64ToBuf(skylink)
	if (err64 !== null) {
		repondErr(event, addContextToErr(err64, "unable to decode skylink"))
		return
	}

	// Verfiy the skylink and get the bitfield elements.
	if (u8Link.length !== 34) {
		respondErr(event, "provided skylink is not the correct length")
		return
	}
	let [version, offset, fetchSize, errBF] = parseSkylinkBitfield(u8Link)
	if (errBF !== null) {
		respondErr(event, addContextToErr(errBF, "unable to decode skylink"))
		return
	}

	// Call progressiveFetch to perform the upload.
	let endpoint = "/skynet/trustless/basesector/" + skylink
	let verifyFunction = function (response: Response): Promise<string | null> {
		return verifyDownloadResponse(response, u8Link)
	}
	progressiveFetch(endpoint, null, defaultPortalList, verifyFunction).then((result: any) => {
		result.response
			.arrayBuffer()
			.then((buf: any) => {
				let [resonseData, errPSR] = parseSkylinkResponse(buf) // TODO: We don't actually know the resolved link.
				if (errPSR !== null) {
					respondErr(event, addContextToErr(errPSR, "unable to parse data from sector"))
					return
				}
				postMessage({
					nonce: event.data.nonce,
					method: "response",
					err: null,
					data: {
						fileData: responseData,
					},
				})
			})
			.catch((err: string) => {
				respondErr(
					event,
					addContextToErr(err, "unable to read response body, despite verification success")
				)
			})
	})
}
