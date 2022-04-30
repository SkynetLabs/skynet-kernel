import { addContextToErr, blake2b, bufToHex, ed25519Verify, encodePrefixedBytes, encodeU64, hexToBuf } from "libkernel"
import { defaultPortalList } from "./defaultportals.js"
import { progressiveFetch } from "./progressivefetch.js"

// readRegistryEntryResult defines fields that are important to processing a registry
// entry.
interface readRegistryEntryResult {
	exists: boolean
	data: Uint8Array
	revision: bigint
}

// Some helper consts to make returning empty values alongside an error easier.
const nu8 = new Uint8Array(0)

// verifyRegistrySignature will verify the signature of a registry entry.
function verifyRegistrySignature(
	pubkey: Uint8Array,
	datakey: Uint8Array,
	data: Uint8Array,
	revision: bigint,
	sig: Uint8Array
): boolean {
	let [encodedData, errEPB] = encodePrefixedBytes(data)
	if (errEPB !== null) {
		return false
	}
	let [encodedRevision, errU64] = encodeU64(revision)
	if (errU64 !== null) {
		return false
	}
	let dataToVerify = new Uint8Array(32 + 8 + data.length + 8)
	dataToVerify.set(datakey, 0)
	dataToVerify.set(encodedData, 32)
	dataToVerify.set(encodedRevision, 32 + 8 + data.length)
	let sigHash = blake2b(dataToVerify)
	return ed25519Verify(sigHash, sig, pubkey)
}

// verifyRegReadResp will check the response body of a registry read on a
// portal. The first return value indicates whether the error that gets
// returned is a problem with the portal, or a problem with the underlying
// registry entry. If the problem is with the portal, the caller should try the
// next portal. If the problem is with the underyling registry entry, the
// caller should handle the error and not try any more portals.
//
// The result has type 'any' because it the object was built from an untrusted
// blob of json.
function verifyRegReadResp(response: Response, result: any, pubkey: Uint8Array, datakey: Uint8Array): string | null {
	// Check that the response status is a 200.
	if (response.status !== 200) {
		return "unexpected response status, expecting 200"
	}

	// Verify the reponse has all required fields.
	if (!("data" in result) || !("revision" in result) || !("signature" in result)) {
		return "response is missing fields"
	}
	if (
		!(typeof result.data === "string") ||
		!(typeof result.revision === "number") ||
		!(typeof result.signature === "string")
	) {
		return "portal response has an invalid format"
	}
	let revision = BigInt(result.revision)

	// Attempt to decode the hex values of the results.
	let [data, err1] = hexToBuf(result.data)
	if (err1 !== null) {
		return "could not decode registry data from result"
	}
	let [sig, err3] = hexToBuf(result.signature)
	if (err3 !== null) {
		return "could not decode signature from result"
	}

	// Verify the signature.
	if (!verifyRegistrySignature(pubkey, datakey, data, revision, sig)) {
		return "signature mismatch"
	}

	// TODO: If the registry entry has type 2, the signature here
	// will fail even if the portal is being honest, and we will
	// mistakenly assume that the portal is malicious. We need to
	// add a check that verifies the signature of a type 2 registry
	// entry correctly.

	// Verfifcation is complete!
	return null
}

// verifyRegistryReadResponse will verify a response from a portal to a query
// to read a registry entry.
function verifyRegistryReadResponse(
	response: Response,
	pubkey: Uint8Array,
	datakey: Uint8Array
): Promise<string | null> {
	return new Promise((resolve) => {
		response
			.json()
			.then((j: any) => {
				// Check whether the response is valid. The response
				// may be invalid in a way that indicates a
				// disfunctional or malicious portal, which means that
				// we should try another portal. Or the response may be
				// invalid in a way that indicates a more fundamental
				// error (portal is honest but the entry itself is
				// corrupt), and we can't make progress.
				let errVRRR = verifyRegReadResp(response, j, pubkey, datakey)
				if (errVRRR !== null) {
					resolve(addContextToErr(errVRRR, "registry response verification failed"))
					return
				}
				resolve(null)
			})
			.catch((err: any) => {
				resolve(addContextToErr(err, "unable to decode response body"))
			})
	})
}

// readRegistryEntry will read and verify a registry entry. The tag strings
// will be hashed with the user's seed to produce the correct entropy.
function readRegistryEntry(pubkey: Uint8Array, datakey: Uint8Array): Promise<readRegistryEntryResult> {
	return new Promise((resolve, reject) => {
		let pubkeyHex = bufToHex(pubkey)
		let datakeyHex = bufToHex(datakey)
		let endpoint = "/skynet/registry?publickey=ed25519%3A" + pubkeyHex + "&datakey=" + datakeyHex
		let portals = defaultPortalList
		let verifyFunc = function (response: Response): Promise<string | null> {
			return verifyRegistryReadResponse(response, pubkey, datakey)
		}
		progressiveFetch(endpoint, {}, portals, verifyFunc).then((result: any) => {
			// Check for a success.
			if (result.success === true) {
				result.response
					.json()
					.then((j: any) => {
						resolve({
							exists: true,
							data: j.data,
							revision: BigInt(j.revision),
						})
					})
					.catch((err: any) => {
						reject(addContextToErr(err, "unable to parse response despite passing verification"))
					})
				return
			}

			// Check for 404.
			for (let i = 0; i < result.responsesFailed.length; i++) {
				if (result.responsesFailed[i].status === 404) {
					resolve({
						exists: false,
						data: nu8,
						revision: 0n,
					})
					return
				}
			}
			reject("unable to read registry entry\n" + JSON.stringify(result))
			return
		})
	})
}

export { readRegistryEntry }
