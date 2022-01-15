// ownRegistryEntryKeys will use the user's seed to derive a keypair and a
// datakey using the provided tags.
var ownRegistryEntryKeys = function(keyPairTagStr: string, datakeyTagStr: string): [Ed25519KeyPair, Uint8Array] {
	// Use the user's seed to derive the registry entry that is going to contain
	// the user's portal list.
	let keyPairEntropy = new Uint8Array(HASH_SIZE);
	let keyPairTag = new TextEncoder().encode(keyPairTagStr);
	let entropyInput = new Uint8Array(keyPairTag.length+userSeed.length);
	entropyInput.set(keyPairTag);
	entropyInput.set(userSeed, keyPairTag.length);
	sha512(keyPairEntropy, entropyInput, entropyInput.length);
	// Use the user's seed to dervie the datakey for the registry entry. We use
	// a different tag to ensure that the datakey is independently random, such
	// that the registry entry looks like it could be any other registry entry.
	let datakeyEntropy = new Uint8Array(HASH_SIZE);
	let datakeyTag = new TextEncoder().encode(datakeyTagStr);
	let datakeyInput = new Uint8Array(datakeyTag.length+userSeed.length);
	datakeyInput.set(datakeyTag);
	datakeyInput.set(userSeed, datakeyTag.length);
	sha512(datakeyEntropy, datakeyInput, datakeyInput.length);

	// Create the private key for the registry entry.
	let keyPair = keyPairFromSeed(keyPairEntropy.slice(0, 32));
	let datakey = datakeyEntropy.slice(0, 32);
	return [keyPair, datakey];
}

// verifyRegistrySignature will verify the signature of a registry entry.
var verifyRegistrySignature = function(pubkey: Uint8Array, datakey: Uint8Array, data: Uint8Array, revision: number, sig: Uint8Array): boolean {
	let encodedData = encodePrefixedBytes(data);
	let encodedRevision = encodeNumber(revision);
	let dataToVerify = new Uint8Array(32 + 8 + data.length + 8);
	dataToVerify.set(datakey, 0);
	dataToVerify.set(encodedData, 32);
	dataToVerify.set(encodedRevision, 32+8+data.length);
	let sigHash = blake2b(dataToVerify);
	return verify(sigHash, sig, pubkey)
}

// verifyRegReadResp will check the response body of a registry read on a
// portal. The first return value indicates whether the error that gets
// returned is a problem with the portal, or a problem with the underlying
// registry entry. If the problem is with the portal, the caller should try the
// next portal. If the problem is with the underyling registry entry, the
// caller should handle the error and not try any more portals.
var verifyRegReadResp = function(response, result, pubkey, datakey): [boolean, Error] {
	// If the portal reports that it's having trouble filling the request,
	// try the next portal. The portals are set up so that a 5XX error
	// indicates that other portals may have better luck.
	if (response.status >= 500 && response.status < 600) {
		return [true, new Error("received 5XX from portal")];
	}

	// A 404 is considered a successful response.
	//
	// TODO: We should verify the 404 by having the portal provide some
	// host signatures where the hosts are asserting that they did not have
	// the response.
	if (response.status == 404) {
		return [false, null];
	}

	// Perform basic verification. If the portal returns the response as
	// successful, check the signature.
	if (response.status === 200) {
		// Check that the result has type '1', this code hasn't been
		// programmed to verify registry entries with any other type.
		//
		// TODO: We need to verify the signature _first_ then determine
		// that the type is invalid.
		if (result.type !== 1) {
			return [false, new Error("registry entry is not of type 1")];
		}

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

interface RegistryEntry {
	data: Uint8Array;
	revision: number;
}

interface ReadOwnRegistryEntryResult {
	response: Response;
	result: RegistryEntry;
}

// readOwnRegistryEntryHandleFetch will handle a resolved call to
// progressiveFetch.
var readOwnRegistryEntryHandleFetch = function(output: ProgressiveFetchResult, endpoint: string, pubkey: Uint8Array, datakey: Uint8Array): Promise<ReadOwnRegistryEntryResult> {
	return new Promise((resolve, reject) => {
		// Build a helper function that will continue attempting the
		// fetch call on other portals.
		let continueFetch = function() {
			progressiveFetch(endpoint, null, output.remainingPortals)
			.then(output => {
				readOwnRegistryEntryHandleFetch(output, endpoint, pubkey, datakey)
				.then(output => {
					resolve(output);
				})
				.catch(err => {
					reject(err);
				})
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
			let [portalIssue, err] = verifyRegReadResp(response, untrustedResult, pubkey, datakey);
			if (err !== null && portalIssue === true) {
				// The error is with the portal, so we want to keep
				// trying more portals.
				log("portal", "portal returned an invalid regread response\n", output.portal, "\n", err, "\n", response, "\n", untrustedResult);
				continueFetch();
				return;
			}
			if (err !== null && portalIssue === false) {
				log("lifecycle", "registry entry is corrupt or browser extension is out of date\n", err, "\n", response, "\n", untrustedResult);
				reject(addContextToErr(err, "registry entry appears corrupt"));
				return;
			}
			// Create a result with the correct typing.
			let result = <RegistryEntry>untrustedResult;

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
var readOwnRegistryEntry = function(keyPairTagStr: string, datakeyTagStr: string): Promise<ReadOwnRegistryEntryResult> {
	return new Promise((resolve, reject) => {
		// Fetch the keys and encode them to hex, then build the desired endpoint.
		let [keyPair, datakey] = ownRegistryEntryKeys(keyPairTagStr, datakeyTagStr);
		let pubkeyHex = buf2hex(keyPair.publicKey);
		let datakeyHex = buf2hex(datakey);
		let endpoint = "/skynet/registry?publickey=ed25519%3A"+pubkeyHex+"&datakey="+datakeyHex;

		// Fetch the list of portals and call progressiveFetch.
		let portalList = preferredPortals();
		progressiveFetch(endpoint, null, portalList)
		.then(output => {
			readOwnRegistryEntryHandleFetch(output, endpoint, keyPair.publicKey, datakey)
			.then(output => {
				resolve(output);
			})
			.catch(output => {
				reject(output);
			})
		})
		.catch(err => {
			reject(addContextToErr(err, "unable to read registry entry"));
		})
	})
}

// writeNewOwnRegistryEntry will write the provided data to a new registry
// entry. A revision number of 0 will be used, because this function is
// assuming that no data yet exists at that registry entry location.
var writeNewOwnRegistryEntry = function(keyPairTagStr: string, datakeyTagStr: string, data: Uint8Array, resolveCallback: any, rejectCallback: any) {
	// Fetch the keys.
	let [keyPair, datakey] = ownRegistryEntryKeys(keyPairTagStr, datakeyTagStr);
	let pubkeyHex = buf2hex(keyPair.publicKey);
	let datakeyHex = buf2hex(datakey);

	// Compute the signature of the new registry entry.
	let encodedData = encodePrefixedBytes(data);
	let encodedRevision = encodeNumber(0);
	let dataToSign = new Uint8Array(32 + 8 + data.length + 8);
	dataToSign.set(datakey, 0);
	dataToSign.set(encodedData, 32);
	dataToSign.set(encodedRevision, 32+8+data.length);
	let sigHash = blake2b(dataToSign);
	let sig = sign(sigHash, keyPair.secretKey);

	// Compose the registry entry query.
	let postBody = {
		publickey: {
			algorithm: "ed25519",
			key: Array.from(keyPair.publicKey),
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
	let portalList = preferredPortals();
	let endpoint = "/skynet/registry";

	// Write an adjusted success callback which checks the status of the
	// registry write.
	let adjustedResolveCallback = function(response, remainingPortalList) {
		if ("status" in response && response.status === 204) {
			// TODO: We probably want some way to verify that the
			// write was actually committed, rather than just
			// trusting the portal that they relayed the messages
			// to hosts. Perhaps have the portal supply a list of
			// signatures from hosts?
			log("wrtieNewOwnRegistryEntry", "successful regwrite", response);
			resolveCallback({
				err: "none",
				response: response,
			});
		} else {
			log("error", "unexpected response from server upon regwrite", "status" in response, response.status, response)
			progressiveFetchLegacy(endpoint, fetchOpts, remainingPortalList, adjustedResolveCallback, rejectCallback);
		}
	}
	progressiveFetchLegacy(endpoint, fetchOpts, portalList, adjustedResolveCallback, rejectCallback);
	return;
			// TODO: Verify the fields here of the registry entry. Maybe? Actually aren't they already verified somewhere 

			// TODO: Verify the fields here of the registry entry. Maybe? Actually aren't they already verified somewhere 

}