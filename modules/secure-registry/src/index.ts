import { activeQuery, addContextToErr, addHandler, handleMessage } from "libkmodule"
import {
	blake2b,
	bufToHex,
	defaultPortalList,
	deriveRegistryEntryID,
	ed25519Sign,
	encodePrefixedBytes,
	encodeU64,
	error,
	hexToBuf,
	progressiveFetch,
	progressiveFetchResult,
	jsonStringify,
	tryStringify,
	verifyRegReadResp,
} from "libskynet"

// Let libkmodule handle the message processing.
onmessage = handleMessage

// Establish the handlers for the methods.
addHandler("readEntry", handleReadEntry)
addHandler("writeEntry", handleWriteEntry)

// handleReadEntry will process a call to 'readEntry'.
function handleReadEntry(aq: activeQuery) {
	// Perform the input validation.
	let data = aq.callerInput
	if (!("publicKey" in data)) {
		aq.reject("input should contain a publicKey field")
		return
	}
	if (!(data.publicKey instanceof Uint8Array)) {
		aq.reject("publicKey input should be a Uint8Array")
		return
	}
	if (!("dataKey" in data)) {
		aq.reject("input should contain a dataKey field")
		return
	}
	if (!(data.dataKey instanceof Uint8Array)) {
		aq.reject("dataKey input should be a Uint8Array")
		return
	}

	// Compose the endpoint.
	let pubkeyHex = bufToHex(data.publicKey)
	let datakeyHex = bufToHex(data.dataKey)
	let endpoint = "/skynet/registry?publickey=ed25519%3A" + pubkeyHex + "&datakey=" + datakeyHex

	// Establish the verification function.
	let verifyFunc = function (response: Response): Promise<error> {
		return verifyRegReadResp(response, data.publicKey, data.dataKey)
	}

	// Perform the fetch.
	progressiveFetch(endpoint, {}, defaultPortalList, verifyFunc).then((result: progressiveFetchResult) => {
		if (result.success === true) {
			// TODO: response.json() is not fully correct because it doesn't
			// properly parse  large revision numbers. We need to use a custom
			// json library here that will pull the numbers in to bigints.
			result.response
				.json()
				.then((j: any) => {
					let [entryData, errBTH] = hexToBuf(j.data)
					if (errBTH !== null) {
						aq.reject(addContextToErr(errBTH, "unable to decode entry data"))
						return
					}
					aq.respond({
						exists: true,
						entryData,
						revision: BigInt(j.revision),
					})
				})
				.catch((err: any) => {
					let errStr = tryStringify(err)
					aq.reject(addContextToErr(errStr, "unable to parse final response despite passing verification"))
				})
			return
		}

		// Check for a 404.
		for (let i = 0; i < result.responsesFailed.length; i++) {
			if (result.responsesFailed[i].status === 404) {
				aq.respond({
					exists: false,
				})
				return
			}
		}

		aq.reject("unable to read registry entry\n" + tryStringify(result))
	})
}

// verifyRegistryWrite will check that the response from the portal matches the
// write we attempted to perform.
function verifyRegistryWrite(resp: Response): Promise<error> {
	return new Promise((resolve) => {
		if (!("status" in resp)) {
			resolve("response did not contain a status")
			return
		}
		if (resp.status === 204) {
			resolve(null)
			return
		}
		resolve("unrecognized status")
	})
}

// handleWriteEntry is the handler for a writeEntry call, see the README for further
// documentation.
function handleWriteEntry(aq: activeQuery) {
	// Perform input validation.
	let data = aq.callerInput
	if (!("publicKey" in data)) {
		aq.reject("input should contain a publicKey field")
		return
	}
	if (!(data.publicKey instanceof Uint8Array)) {
		aq.reject("publicKey input should be a Uint8Array")
		return
	}
	if (data.publicKey.length !== 32) {
		aq.reject("publicKey should have a length of 32")
		return
	}
	if (!("secretKey" in data)) {
		aq.reject("input should contain a secretKey field")
		return
	}
	if (!(data.secretKey instanceof Uint8Array)) {
		aq.reject("secretKey input should be a Uint8Array")
		return
	}
	if (data.secretKey.length !== 64) {
		aq.reject("secretKey should have a length of 64")
		return
	}
	if (!("dataKey" in data)) {
		aq.reject("input should contain a dataKey field")
		return
	}
	if (!(data.dataKey instanceof Uint8Array)) {
		aq.reject("dataKey input should be a Uint8Array")
		return
	}
	if (!("entryData" in data)) {
		aq.reject("input should contain an entryData field")
		return
	}
	if (!(data.entryData instanceof Uint8Array)) {
		aq.reject("data input should be a Uint8Array")
		return
	}
	if (data.entryData.length > 86) {
		aq.reject("provided data is too large to fit in a registry entry")
		return
	}
	if (!("revision" in data)) {
		aq.reject("input should contain a revision field")
		return
	}
	if (typeof data.revision !== "bigint") {
		aq.reject("revision should be a BigInt")
		return
	}
	let [entryID, errDREID] = deriveRegistryEntryID(data.publicKey, data.dataKey)
	if (errDREID !== null) {
		aq.reject(addContextToErr(errDREID, "unable to derive entry ID from pubkey and datakey"))
		return
	}

	// Compute the signature of the new registry entry.
	let [encodedRevision, errU64] = encodeU64(data.revision)
	if (errU64 !== null) {
		aq.reject(addContextToErr(errU64, "unable to encode revisionNumber"))
		return
	}
	let [encodedData, errEPB] = encodePrefixedBytes(data.entryData)
	if (errEPB !== null) {
		aq.reject(addContextToErr(errEPB, "unable to encode data"))
		return
	}
	let dataToSign = new Uint8Array(32 + 8 + data.entryData.length + 8)
	dataToSign.set(data.dataKey, 0)
	dataToSign.set(encodedData, 32)
	dataToSign.set(encodedRevision, 32 + 8 + data.entryData.length)
	let sigHash = blake2b(dataToSign)
	let [sig, errS] = ed25519Sign(sigHash, data.secretKey)
	if (errS !== null) {
		aq.reject(addContextToErr(errS, "unable to create signature"))
		return
	}

	// Compose the fetch query.
	let dataKeyHex = bufToHex(data.dataKey)
	let postBody = {
		publickey: {
			algorithm: "ed25519",
			key: Array.from(data.publicKey),
		},
		datakey: dataKeyHex,
		revision: Number(data.revision), // TODO: Need to encode this to be full precision
		data: Array.from(data.entryData),
		signature: Array.from(sig),
	}
	let [postJSON, errJS] = jsonStringify(postBody)
	if (errJS !== null) {
		aq.reject(addContextToErr(errJS, "unable to stringify post body"))
		return
	}
	let fetchOpts = {
		method: "post",
		body: postJSON,
	}
	let endpoint = "/skynet/registry"
	progressiveFetch(endpoint, fetchOpts, defaultPortalList, verifyRegistryWrite)
		.then((result) => {
			if (result.success === true) {
				aq.respond({
					entryID,
				})
				return
			}
			aq.reject("unable to write registry entry: " + tryStringify(result))
		})
		.catch((err) => {
			aq.reject(addContextToErr(err, "unable to write registry entry"))
		})
}
