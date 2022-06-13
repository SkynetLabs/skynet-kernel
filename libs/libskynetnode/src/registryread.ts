import {
	addContextToErr,
	bufToHex,
	defaultPortalList,
	error,
	hexToBuf,
	verifyRegistryReadResponse,
	verifyRegistrySignature,
} from "libskynet"
import { progressiveFetch } from "./progressivefetch.js"

// readRegistryEntryResult defines fields that are important to processing a registry
// entry.
interface readRegistryEntryResult {
	exists: boolean
	data: Uint8Array
	revision: bigint
}

// readRegistryEntry will read and verify a registry entry. The tag strings
// will be hashed with the user's seed to produce the correct entropy.
function readRegistryEntry(pubkey: Uint8Array, datakey: Uint8Array): Promise<readRegistryEntryResult> {
	return new Promise((resolve, reject) => {
		let pubkeyHex = bufToHex(pubkey)
		let datakeyHex = bufToHex(datakey)
		let endpoint = "/skynet/registry?publickey=ed25519%3A" + pubkeyHex + "&datakey=" + datakeyHex
		let verifyFunc = function (response: Response): Promise<error> {
			return verifyRegistryReadResponse(response, pubkey, datakey)
		}
		progressiveFetch(endpoint, {}, defaultPortalList, verifyFunc).then((result: any) => {
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
						data: new Uint8Array(0),
						revision: 0n,
					})
					return
				}
			}
			reject("unable to read registry entry\n" + JSON.stringify(result))
		})
	})
}

export { readRegistryEntry }
