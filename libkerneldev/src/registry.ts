import { ed25519Keypair, ed25519KeypairFromEntropy } from "./ed25519.js"
import { SEED_BYTES } from "./seed.js"
import { blake2b } from "./blake2b.js"
import { sha512 } from "./sha512.js"
import { addContextToErr } from "./err.js"
import { encodeNumber } from "./encoding.js"

/*
// registryEntry defines fields that are important to processing a registry
// entry.
interface registryEntry {
	data: Uint8Array
	revision: number
}

// readRegistryEntryResult defines the fields that get returned when making a
// call to readRegistryEntryResult.
interface readRegistryEntryResult {
	response: Response
	result: registryEntry
}
*/

// Define some empty values to make our return statements more concise.
const nu8 = new Uint8Array(0)
const nkp = { publicKey: nu8, secretKey: nu8 }

// registryEntryKeys will use the user's seed to derive a keypair and a datakey
// using the provided seed and tags. The keypairTag is a tag which salts the
// keypair. If you change the input keypairTag, the resulting public key and
// secret key will be different. The dataKey tag is the salt for the datakey,
// if you provide a different datakey tag, the resulting datakey will be
// different.
//
// Note that changing the keypair tag will also change the resulting datakey.
// The purpose of the keypair tag is to obfuscate the fact that two registry
// entries are owned by the same identity. This obfuscation would break if two
// different public keys were using the same datakey. Changing the datakey does
// not change the public key.
function taggedRegistryEntryKeys(
	seed: Uint8Array,
	keypairTagStr: string,
	datakeyTagStr: string
): [ed25519Keypair, Uint8Array, string | null] {
	if (seed.length !== SEED_BYTES) {
		return [nkp, nu8, "seed has the wrong length"]
	}
	if (keypairTagStr.length > 255) {
		return [nkp, nu8, "keypairTag must be less than 256 characters"]
	}

	// Generate a unique set of entropy using the seed and keypairTag.
	let keypairTag = new TextEncoder().encode(keypairTagStr)
	let entropyInput = new Uint8Array(keypairTag.length + seed.length)
	entropyInput.set(seed)
	entropyInput.set(keypairTag, seed.length)
	let keypairEntropy = sha512(entropyInput)

	// Use the seed to dervie the datakey for the registry entry. We use
	// a different tag to ensure that the datakey is independently random, such
	// that the registry entry looks like it could be any other registry entry.
	let datakeyTag = new TextEncoder().encode(datakeyTagStr)
	let datakeyInput = new Uint8Array(seed.length + 1 + keypairTag.length + datakeyTag.length)
	let keypairLen = new Uint8Array(1)
	keypairLen[0] = keypairTag.length
	datakeyInput.set(seed)
	datakeyInput.set(keypairLen, seed.length)
	datakeyInput.set(keypairTag, seed.length+1)
	datakeyInput.set(datakeyTag, seed.length+1+keypairTag.length)
	let datakeyEntropy = sha512(datakeyInput)

	// Create the private key for the registry entry.
	let [keypair, errKPFE] = ed25519KeypairFromEntropy(keypairEntropy.slice(0, 32))
	if (errKPFE !== null) {
		return [nkp, nu8, addContextToErr(errKPFE, "unable to derive keypair")]
	}
	let datakey = datakeyEntropy.slice(0, 32)
	return [keypair, datakey, null]
}

// deriveRegistryEntryID derives a registry entry ID from a provided pubkey and
// datakey.
function deriveRegistryEntryID(pubkey: Uint8Array, datakey: Uint8Array): [Uint8Array, string | null] {
	// Check the lengths of the inputs.
	if (pubkey.length !== 32) {
		return [nu8, "pubkey is invalid, length is wrong"];
	}
	if (datakey.length !== 32) {
		return [nu8, "datakey is not a valid hash, length is wrong"];
	}

	// Establish the encoding. First 16 bytes is a specifier, second 8
	// bytes declares the length of the pubkey, the next 32 bytes is the
	// pubkey and the final 32 bytes is the datakey. This encoding is
	// determined by the Sia protocol.
	let encoding = new Uint8Array(16 + 8 + 32 + 32)
	// Set the specifier.
	encoding[0] = "e".charCodeAt(0);
	encoding[1] = "d".charCodeAt(0);
	encoding[2] = "2".charCodeAt(0);
	encoding[3] = "5".charCodeAt(0);
	encoding[4] = "5".charCodeAt(0);
	encoding[5] = "1".charCodeAt(0);
	encoding[6] = "9".charCodeAt(0);
	// Set the pubkey.
	let encodedLen = encodeNumber(32);
	encoding.set(encodedLen, 16);
	encoding.set(pubkey, 16+8);
	encoding.set(datakey, 16+8+32);

	// Get the final ID by hashing the encoded data.
	let id = blake2b(encoding);
	return [id, null];
}

/*
// deriveResolverLink will derive the resolver link from the tags that
// determine the pubkey and datakey.
var deriveResolverLink = function(keypairTagStr: string, datakeyTagStr: string): [string, Error] {
	// Compute the ID of the registry entry for the user's
	// preferences.
	let [keypair, datakey, errOREK] = ownRegistryEntryKeys(keypairTagStr, datakeyTagStr)
	if (errOREK !== null) {
		return [null, addContextToErr(errOREK, "unable to derive portal pref registry entry")]
	}
	let [entryID, errDREI] = deriveRegistryEntryID(keypair.publicKey, datakey)
	if (errDREI !== null) {
		return [null, addContextToErr(errDREI, "unable to derive portal entry id")]
	}
	// Build a v2 skylink from the entryID.
	let v2Skylink = new Uint8Array(34)
	v2Skylink.set(entryID, 2)
	v2Skylink[0] = 1
	let skylink = bufToB64(v2Skylink)
	return [skylink, null]
}

// verifyRegistrySignature will verify the signature of a registry entry.
var verifyRegistrySignature = function(pubkey: Uint8Array, datakey: Uint8Array, data: Uint8Array, revision: number, sig: Uint8Array): boolean {
	let [encodedData, errEPB] = encodePrefixedBytes(data);
	if (errEPB !== null) {
		return false;
	}
	let encodedRevision = encodeNumber(revision);
	let dataToVerify = new Uint8Array(32 + 8 + data.length + 8);
	dataToVerify.set(datakey, 0);
	dataToVerify.set(encodedData, 32);
	dataToVerify.set(encodedRevision, 32+8+data.length);
	let sigHash = blake2b(dataToVerify);
	return verify(sigHash, sig, pubkey);
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
var verifyRegReadResp = function(response: Response, result: any, pubkey: Uint8Array, datakey: Uint8Array): [boolean, Error] {
	// A 404 is accepted as a non-malicious response and not an error.
	//
	// TODO: If we get a 404 we should keep checking with other portals
	// just to be certain, but also be ready to return a response to the
	// caller that says 404.
	if (response.status == 404) {
		return [false, null];
	}

	// Perform basic verification. If the portal returns the response as
	// successful, check the signature.
	if (response.status === 200) {
		// Verify the reponse has all required fields.
		if (!("data" in result) || !("revision" in result) || !("signature" in result)) {
			return [true, new Error("response is missing fields")];
		}
		// Verify the signature on the registry entry.
		if (!(typeof(result.data) === "string") || !(typeof(result.revision) === "number") || !(typeof(result.signature) === "string")) {
			return [true, new Error("portal response has invalid format")]
		}
		let revision = <number>result.revision;

		// Attempt to decode the hex values of the results.
		let [data, err1] = hex2buf(result.data);
		if (err1 !== null) {
			return [true, new Error("portal result data did not decode from hex")];
		}
		let [sig, err3] = hex2buf(result.signature);
		if (err3 !== null) {
			return [true, new Error("portal result signature did not decode from hex")];
		}

		// Data is clean, check signature.
		if (!verifyRegistrySignature(pubkey, datakey, data, revision, sig)) {
			return [true, new Error("portal response has a signature mismatch")];
		}

		// TODO: If the registry entry has type 2, the signature here
		// will fail even if the portal is being honest, and we will
		// mistakenly assume that the portal is malicious. We need to
		// add a check that verifies the signature of a type 2 registry
		// entry correctly.

		// Verfifcation is complete!
		return [false, null];
	}

	// NOTE: 429's (request denied due to ratelimit) aren't handled by the
	// bootloader because the bootloader only makes five requests total in
	// the worst case (registry entry to get portal list, download for
	// portal list, registry entry for user's preferred portal, registry
	// entry resolving the user's preferred portal, download the user's
	// preferred portal) and those requests are split across two endpoints.
	//
	// The full kernel may overwrite this function to handle ratelimiting,
	// though premium portals may be able to eventually switch to a
	// pay-per-request model using ephemeral accounts that eliminates the
	// need for ratelimiting.

	return [true, new Error("portal response not recognized")];
}

// readOwnRegistryEntryHandleFetch will handle a resolved call to
// progressiveFetch.
var readOwnRegistryEntryHandleFetch = function(output: progressiveFetchResult, endpoint: string, pubkey: Uint8Array, datakey: Uint8Array): Promise<readOwnRegistryEntryResult> {
	return new Promise((resolve, reject) => {
		// Build a helper function that will continue attempting the
		// fetch call on other portals.
		let continueFetch = function() {
			progressiveFetch(endpoint, null, output.remainingPortals, output.first4XX)
			.then(output => {
				readOwnRegistryEntryHandleFetch(output, endpoint, pubkey, datakey)
				.then(output => {
					resolve(output);
				})
				.catch(err => {
					reject(addContextToErr(err, "registry read failed"));
				})
			})
			.catch(err => {
				reject(addContextToErr(err, "registry read failed"));
			})
		}

		// Read the response body.
		let response = output.response;
		response.json()
		.then(untrustedResult => {
			// Check whether the response is valid. The response
			// may be invalid in a way that indicates a
			// disfunctional or malicious portal, which means that
			// we should try another portal. Or the response may be
			// invalid in a way that indicates a more fundamental
			// error (portal is honest but the entry itself is
			// corrupt), and we can't make progress.
			let [portalIssue, errVRRR] = verifyRegReadResp(response, untrustedResult, pubkey, datakey);
			if (errVRRR !== null && portalIssue === true) {
				// The error is with the portal, so we want to keep
				// trying more portals.
				log("portal", "portal returned an invalid regread response\n", output.portal, "\n", errVRRR, "\n", response, "\n", untrustedResult);
				continueFetch();
				return;
			}
			if (errVRRR !== null && portalIssue === false) {
				log("lifecycle", "registry entry is corrupt or browser extension is out of date\n", errVRRR, "\n", response, "\n", untrustedResult);
				reject(addContextToErr(errVRRR, "registry entry appears corrupt"));
				return;
			}
			// Create a result with the correct typing.
			let result = <registryEntry>untrustedResult;

			// The err is null, call the resolve callback.
			resolve({
				response,
				result,
			});
		})
		.catch(err => {
			log("portal", "unable to parse response body\n", output.portal, "\n", response, "\n", err);
			continueFetch();
			return;
		})
	})
}

// readOwnRegistryEntry will read and verify a registry entry that is owned by
// the user. The tag strings will be hashed with the user's seed to produce the
// correct entropy.
var readOwnRegistryEntry = function(keypairTagStr: string, datakeyTagStr: string): Promise<readOwnRegistryEntryResult> {
	return new Promise((resolve, reject) => {
		// Fetch the keys and encode them to hex, then build the desired endpoint.
		let [keypair, datakey, errREK] = ownRegistryEntryKeys(keypairTagStr, datakeyTagStr);
		if (errREK !== null) {
			reject(addContextToErr(errREK, "unable to get user's registry keys"))
		}
		let pubkeyHex = buf2hex(keypair.publicKey);
		let datakeyHex = buf2hex(datakey);
		let endpoint = "/skynet/registry?publickey=ed25519%3A"+pubkeyHex+"&datakey="+datakeyHex;

		// Fetch the list of portals and call progressiveFetch.
		let portalList = preferredPortals();
		progressiveFetch(endpoint, null, portalList, null)
		.then(output => {
			readOwnRegistryEntryHandleFetch(output, endpoint, keypair.publicKey, datakey)
			.then(output => {
				resolve(output);
			})
			.catch(err => {
				reject(addContextToErr(err, "unable to read registry entry"));
			})
		})
		.catch(err => {
			reject(addContextToErr(err, "unable to read registry entry"));
		})
	})
}

// writeNewOwnRegistryEntryHandleFetch is a recursive helper for
// writeNewOwnRegistryEntry that will repeat the call on successive portals if
// there are failures.
var writeNewOwnRegistryEntryHandleFetch = function(output: progressiveFetchResult, endpoint: string, fetchOpts: any): Promise<Response> {
	return new Promise((resolve, reject) => {
		let response = output.response;
		if ("status" in response && response.status === 204) {
			log("writeRegistryAll", "successful registry write", response);
			resolve(response);
		} else {
			log("error", "unexpected response from server upon regwrite\n", response, "\n", fetchOpts)
			progressiveFetch(endpoint, fetchOpts, output.remainingPortals, output.first4XX)
			.then(fetchOutput => {
				writeNewOwnRegistryEntryHandleFetch(output, endpoint, fetchOpts)
				.then(writeOutput => resolve(writeOutput))
				.catch(err => reject(addContextToErr(err, "unable to perform registry write")))
			})
			.catch(err => {
				reject(addContextToErr(err, "unable to perform registry write"))
			})
		}
	})
}

// writeNewOwnRegistryEntry will write the provided data to a new registry
// entry. A revision number of 0 will be used, because this function is
// assuming that no data yet exists at that registry entry location.
var writeNewOwnRegistryEntry = function(keypairTagStr: string, datakeyTagStr: string, data: Uint8Array): Promise<Response> {
	return new Promise((resolve, reject) => {
		// Check that the data is small enough to fit in a registry
		// entry. The actual limit for a type 2 entry is 90 bytes, but
		// we are leaving 4 bytes of room for potential extensions
		// later.
		if (data.length > 86) {
			reject("provided data is too large to fit in a registry entry");
			return;
		}

		// Fetch the keys.
		let [keypair, datakey, errREK] = ownRegistryEntryKeys(keypairTagStr, datakeyTagStr);
		if (errREK !== null) {
			reject(addContextToErr(errREK, "unable to get user's registry keys"))
			return;
		}
		let pubkeyHex = buf2hex(keypair.publicKey);
		let datakeyHex = buf2hex(datakey);

		// Compute the signature of the new registry entry.
		let [encodedData, errEPB] = encodePrefixedBytes(data);
		if (errEPB !== null) {
			reject(addContextToErr(errEPB, "unable to encode the registry data"));
			return;
		}
		let encodedRevision = encodeNumber(0);
		let dataToSign = new Uint8Array(32 + 8 + data.length + 8);
		dataToSign.set(datakey, 0);
		dataToSign.set(encodedData, 32);
		dataToSign.set(encodedRevision, 32+8+data.length);
		let sigHash = blake2b(dataToSign);
		let [sig, errS] = sign(sigHash, keypair.secretKey);
		if (errS !== null) {
			reject(addContextToErr(errS, "unable to produce signature"));
			return;
		}

		// Compose the registry entry query.
		let postBody = {
			publickey: {
				algorithm: "ed25519",
				key: Array.from(keypair.publicKey),
			},
			datakey: datakeyHex,
			revision: 0,
			data: Array.from(data),
			signature: Array.from(sig),
		}
		let fetchOpts = {
			method: 'post',
			body: JSON.stringify(postBody)
		};
		let endpoint = "/skynet/registry";

		// Perform the fetch call.
		let portalList = preferredPortals();
		progressiveFetch(endpoint, fetchOpts, portalList, null)
		.then(output => {
			writeNewOwnRegistryEntryHandleFetch(output, endpoint, fetchOpts)
			.then(output => {
				resolve(output);
			})
			.catch(errC => {
				reject(addContextToErr(errC, "unable to create new registry entry"));
			})
		})
		.catch(errC => {
			reject(addContextToErr(errC, "unable to create new registry entry"));
		})
	})
}
*/

export { taggedRegistryEntryKeys }
