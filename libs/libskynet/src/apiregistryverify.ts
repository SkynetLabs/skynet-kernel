import { hexToBuf } from "./encoding.js"
import { addContextToErr } from "./err.js"
import { objAsString } from "./objAsString.js"
import { parseJSON } from "./parse.js"
import { verifyRegistrySignature } from "./registry.js"
import { error } from "./types.js"

// verifyDecodedResp will verify the decoded response from a portal for a
// regRead call.
function verifyDecodedResp(resp: Response, data: any, pubkey: Uint8Array, datakey: Uint8Array): error {
	// Status is expected to be 200.
	if (resp.status !== 200) {
		return "expected 200 response status, got: " + objAsString(resp.status)
	}

	// Verify that all required fields were provided.
	if (!("data" in data)) {
		return "expected data field in response"
	}
	if (typeof data.data !== "string") {
		return "expected data field to be a string"
	}
	if (!("revision" in data)) {
		return "expected revision in response"
	}
	if (typeof data.revision !== "bigint") {
		return "expected revision to be a number"
	}
	if (!("signature" in data)) {
		return "expected signature in response"
	}
	if (typeof data.signature !== "string") {
		return "expected signature to be a string"
	}

	// Parse out the fields we need.
	let [entryData, errHTB] = hexToBuf(data.data)
	if (errHTB !== null) {
		return "could not decode registry data from response"
	}
	let [sig, errHTB2] = hexToBuf(data.signature)
	if (errHTB2 !== null) {
		return "could not decode signature from response"
	}

	// Verify the signature.
	if (!verifyRegistrySignature(pubkey, datakey, entryData, data.revision, sig)) {
		return "signature mismatch"
	}

	// TODO: Need to be handling type 2 registry entries here otherwise we will
	// be flagging non malicious portals as malicious.

	return null
}

// verifyRegistryReadResponse will verify that the registry read response from
// the portal was correct.
function verifyRegistryReadResponse(resp: Response, pubkey: Uint8Array, datakey: Uint8Array): Promise<error> {
	return new Promise((resolve) => {
		resp
			.text()
			.then((str: string) => {
				let [obj, errPJ] = parseJSON(str)
				if (errPJ !== null) {
					resolve(addContextToErr(errPJ, "unable to parse registry response"))
					return
				}
				let errVDR = verifyDecodedResp(resp, obj, pubkey, datakey)
				if (errVDR !== null) {
					resolve(addContextToErr(errVDR, "regRead response failed verification"))
					return
				}
				resolve(null)
			})
			.catch((err: any) => {
				resolve(addContextToErr(objAsString(err), "unable to decode response"))
			})
	})
}

// verifyRegistryWriteResponse will verify that the response from a
// registryWrite call is valid. There's not much to verify beyond looking for
// the right response code, as the portal is not providing us with data, just
// confirming that a write succeeded.
function verifyRegistryWriteResponse(resp: Response): Promise<error> {
	return new Promise((resolve) => {
		if (resp.status === 204) {
			resolve(null)
		}
		resolve("expecting 200 status code for registry write, got:" + resp.status.toString())
	})
}

export { verifyRegistryReadResponse, verifyRegistryWriteResponse }
