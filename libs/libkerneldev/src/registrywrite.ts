import {
	addContextToErr,
	blake2b,
	bufToHex,
	defaultPortalList,
	ed25519Sign,
	encodePrefixedBytes,
	encodeU64,
} from "libkernel"
import { readRegistryEntry } from "./registryread.js"
import { progressiveFetch } from "./progressivefetch.js"

// verifyRegistryWrite checks that a response from the portal matches the write
// we attempted to perform.
function verifyRegistryWrite(response: Response): Promise<string | null> {
	return new Promise((resolve) => {
		if (!("status" in response)) {
			resolve("response did not contain a status")
			return
		}
		if (response.status === 204) {
			resolve(null)
			return
		}
		resolve("unrecognized status")
	})
}

// overwriteRegistryEntry will obliterate an existing registry entry with a new
// value. This function does not have any data safety, and is only recommended
// for uses where the caller is not concerned about wiping existing data.
// Improper use of this function has caused a large number of developers to
// accidentally wipe critical user data, please avoid using this function for
// any sort of incremental data.
function overwriteRegistryEntry(keypair: any, datakey: Uint8Array, data: Uint8Array): Promise<null> {
	return new Promise((resolve, reject) => {
		// Check that the data is small enough to fit in a registry
		// entry. The actual limit for a type 2 entry is 90 bytes, but
		// we are leaving 4 bytes of room for potential extensions
		// later.
		if (data.length > 86) {
			reject("provided data is too large to fit in a registry entry")
			return
		}

		// Fetch the current registry entry so that we know the
		// revision number.
		//
		// TODO: Need special error handling for max revision number,
		// which probably also means we need to use bignums as the
		// return type.
		readRegistryEntry(keypair.publicKey, datakey)
			.then((result) => {
				let revisionNumber: bigint
				if (!result.exists) {
					revisionNumber = 0n
				} else {
					revisionNumber = result.revision + 1n
				}
				let [encodedRevision, errU64] = encodeU64(revisionNumber)
				if (errU64 !== null) {
					reject(addContextToErr(errU64, "unable to encode revision number"))
					return
				}
				// Compute the signature of the new registry entry.
				let datakeyHex = bufToHex(datakey)
				let [encodedData, errEPB] = encodePrefixedBytes(data)
				if (errEPB !== null) {
					reject(addContextToErr(errEPB, "unable to encode the registry data"))
					return
				}
				let dataToSign = new Uint8Array(32 + 8 + data.length + 8)
				dataToSign.set(datakey, 0)
				dataToSign.set(encodedData, 32)
				dataToSign.set(encodedRevision, 32 + 8 + data.length)
				let sigHash = blake2b(dataToSign)
				let [sig, errS] = ed25519Sign(sigHash, keypair.secretKey)
				if (errS !== null) {
					reject(addContextToErr(errS, "unable to produce signature"))
					return
				}

				// Compose the registry entry query.
				let postBody = {
					publickey: {
						algorithm: "ed25519",
						key: Array.from(keypair.publicKey),
					},
					datakey: datakeyHex,
					revision: Number(revisionNumber),
					data: Array.from(data),
					signature: Array.from(sig),
				}
				let fetchOpts = {
					method: "post",
					body: JSON.stringify(postBody),
				}
				let endpoint = "/skynet/registry"

				// Perform the fetch call.
				progressiveFetch(endpoint, fetchOpts, defaultPortalList, verifyRegistryWrite).then((result) => {
					if (result.success === true) {
						resolve(null)
						return
					}
					reject("unable to write registry entry\n" + JSON.stringify(result))
				})
			})
			.catch((err) => {
				reject(addContextToErr(err, "unable to read registry entry"))
				return
			})
	})
}

export { overwriteRegistryEntry }
