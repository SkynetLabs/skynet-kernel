// parseSkylinkBitfield is a helper function to downloadSkylink which pulls
// the fetchSize out of the bitfield. parseSkylink will return an error if the
// offset is not zero.
var parseSkylinkBitfield = function(skylink: Uint8Array): [number, number, number, string] {
	// Validate the input.
	if (skylink.length !== 34) {
		return [0, 0, 0, "provided skylink has incorrect length"];
	}

	// Extract the bitfield.
	let bitfield = new DataView(skylink.buffer).getUint16(0, true);

	// Extract the version.
	let version = (bitfield & 3) + 1
	// Only versions 1 and 2 are recognized.
	if (version !== 1 && version !== 2) {
		return [0, 0, 0, "provided skylink has unrecognized version"];
	}

	// Verify that the mode is valid, then fetch the mode.
	bitfield = bitfield >> 2;
	if ((bitfield&255) === 255) {
		return [0, 0, 0, "provided skylink has an unrecognized version"];
	}
	let mode = 0;
	for (let i = 0; i < 8; i++) {
		if ((bitfield & 1) === 0) {
			bitfield = bitfield >> 1;
			break;
		}
		bitfield = bitfield >> 1;
		mode++;
	}
	// If the mode is greater than 7, this is not a valid v1 skylink.
	if (mode > 7) {
		return [0, 0, 0, "provided skylink has an invalid v1 bitfield"];
	}

	// Determine the offset and fetchSize increment.
	let offsetIncrement = 4096 << mode;
	let fetchSizeIncrement = 4096;
	if (mode > 0) {
		fetchSizeIncrement = fetchSizeIncrement << mode-1;
	}

	// The next three bits decide the fetchSize.
	let fetchSizeBits = bitfield & 7;
	fetchSizeBits++ // semantic upstep, range should be [1,8] not [0,8).
	let fetchSize = fetchSizeBits * fetchSizeIncrement;

	// The remaining bits determine the fetchSize.
	let offset = bitfield * offsetIncrement;
	if (offset + fetchSize > 1 << 22) {
		return [0, 0, 0, "provided skylink has an invalid v1 bitfield"];
	}

	// Return what we learned.
	return [version, offset, fetchSize, null];
}

// deriveRegistryEntryID derives a registry entry ID from a provided pubkey and
// datakey.
var deriveRegistryEntryID = function(pubkey: Uint8Array, datakey: Uint8Array): [Uint8Array, string] {
	// Check the lengths of the inputs.
	if (pubkey.length !== 32) {
		return [null, "pubkey is invalid, length is wrong"];
	}
	if (datakey.length !== 32) {
		return [null, "datakey is not a valid hash, length is wrong"];
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

// validSkylink returns true if the provided Uint8Array is a valid skylink.
// This is an alias for 'parseSkylinkBitfield', as both perform the same
// validation.
var validSkylink = function(skylink: Uint8Array): boolean {
	// Get the bitfield values. If the bitfield parsing doesn't return an error, 
	let [version, offset, fetchSize, err] = parseSkylinkBitfield(skylink);
	if (err !== null) {
		return false;
	}
	return true;
}

// verifyResolverLinkProof will check that the given resolver proof matches the
// provided skylink. If the proof is correct and the signature matches, the
// data will be returned. The returned link will be a verified skylink.
var verifyResolverLinkProof = function(skylink: Uint8Array, proof: any): [Uint8Array, string] {
	// Verify the presented skylink is formatted correctly.
	if (skylink.length !== 34) {
		return [null, "skylink is malformed, expecting 34 bytes"];
	}

	// Verify that all of the required fields are present in the proof.
	if (!("data" in proof) || !("datakey" in proof) || !("publickey" in proof) || !("signature" in proof) || !("type" in proof) || !("revision" in proof)) {
		return [null, "proof is malformed, fields are missing"];
	}
	if (!("algorithm" in proof.publickey) || !("key" in proof.publickey)) {
		return [null, "pubkey is malformed"];
	}

	// Verify the typing of the fields.
	if (typeof proof.data !== "string") {
		return [null, "data is malformed"];
	}
	let dataStr = <string>proof.data;
	if (typeof proof.datakey !== "string") {
		return [null, "datakey is malformed"];
	}
	let datakeyStr = <string>proof.datakey;
	if (proof.publickey.algorithm !== "ed25519") {
		return [null, "pubkey has unrecognized algorithm"];
	}
	if (typeof proof.publickey.key !== "string") {
		return [null, "pubkey key is malformed"];
	}
	let pubkeyStr = <string>proof.publickey.key;
	if (typeof proof.signature !== "string") {
		return [null, "signature is malformed"];
	}
	if (proof.type !== 1) {
		return [null, "registry entry has unrecognized type"];
	}
	let sigStr = <string>proof.signature;
	if (typeof proof.revision !== "number") {
		return [null, "revision is malformed"];
	}
	let revision = <number>proof.revision;

	// Decode all of the fields. They are presented in varied types and
	// encodings.
	let [data, errD] = hex2buf(dataStr);
	if (errD !== null) {
		return [null, "data is invalid hex: " + errD];
	}
	let [datakey, errDK] = hex2buf(datakeyStr);
	if (errDK !== null) {
		return [null, "datakey is invalid hex: " + errDK];
	}
	let [pubkey, errPK] = b64ToBuf(pubkeyStr);
	if (errPK !== null) {
		return [null, "pubkey key is invalid base64: " + errPK];
	}
	let [sig, errS] = hex2buf(sigStr);
	if (errS !== null) {
		return [null, "signature is invalid hex: " + errS];
	}

	// Verify that the data is a skylink - this is a proof for a resolver,
	// which means the proof is pointing to a specific skylink.
	if (!validSkylink(data)) {
		return [null, "this skylink does not resolve to another skylink"];
	}

	// Verify that the combination of the datakey and the public key match
	// the skylink.
	let [entryID, err] = deriveRegistryEntryID(pubkey, datakey)
	if (err !== null) {
		return [null, "proof pubkey is malformed: " + err];
	}
	let linkID = skylink.slice(2, 34);
	for (let i = 0; i < entryID.length; i++) {
		if (entryID[i] !== linkID[i]) {
			return [null, "proof pubkey and datakey do not match the skylink root"];
		}
	}

	// Verify the signature.
	if (!verifyRegistrySignature(pubkey, datakey, data, revision, sig)) {
		return [null, "signature does not match"];
	}
	return [data, null];
}

// verifyResolverLinkProofs will verify a set of resolver link proofs provided
// by a portal after performing a resolver link lookup. Each proof corresponds
// to one level of resolution. The final value returned will be the V1 skylink
// at the end of the chain.
//
// This function treats the proof as untrusted data and will verify all of the
// fields that are provided.
var verifyResolverLinkProofs = function(skylink: Uint8Array, proof: any): [Uint8Array, string] {
	// Check that the proof is an array.
	if (!Array.isArray(proof)) {
		return [null, "provided proof is not an array"];
	}
	if (proof.length === 0) {
		return [null, "proof array is empty"];
	}

	// Check each proof in the chain, returning the final skylink.
	for (let i = 0; i < proof.length; i++) {
		let err;
		[skylink, err] = verifyResolverLinkProof(skylink, proof[i]);
		if (err !== null) {
			return [null, "one of the resolution proofs is invalid: " + err];
		}
	}

	// Though it says 'skylink', the verifier is actually just returning
	// whatever the registry data is. We need to check that the final value
	// is a V1 skylink.
	if (skylink.length !== 34) {
		return [null, "final value returned by the resolver link is not a skylink"];
	}
	let [version, x, xx, err] = parseSkylinkBitfield(skylink);
	if (err !== null) {
		return [null, "final value returned by resolver link is not a valid skylink: " + err];
	}
	if (version !== 1) {
		return [null, "final value returned by resolver link is not a v1 skylink"];
	}

	return [skylink, null];
}

// downloadSkylink will perform a download on the provided skylink, verifying
// that the link is valid. If the link is a content link, the data returned by
// the portal will be verified against the hash. If the link is a resolver
// link, the registry entry proofs returned by the portal will be verified and
// then the resulting content will also be verified.
var downloadSkylink = function(skylink: string, resolveCallback: any, rejectCallback: any) {
	// Verify that the provided skylink is a valid skylink.
	let [u8Link, err64] = b64ToBuf(skylink);
	if (err64 !== null) {
		rejectCallback("unable to decode skylink: " + err64);
		return;
	}
	if (u8Link.length !== 34) {
		rejectCallback("input skylink is not the correct length");
		return;
	}

	let [version, offset, fetchSize, errBF] = parseSkylinkBitfield(u8Link);
	if (errBF !== null) {
		rejectCallback("skylink bitfield is invalid: ", errBF);
		return;
	}

	// Establish the endpoint that we want to call on the portal and the
	// list of portals we want to use.
	let endpoint = "/" + skylink + "/";
	let portalList = preferredPortals();

	// Establish the modified resolve callback which will cryptographically
	// verify the responses from the portals.
	let adjustedResolveCallback = function(response, remainingPortalList) {
		response.text()
		.then(result => {
			// Check for 404s.
			if (response.status === 404) {
				resolveCallback({
					err: "none",
					response: response,
					result: result,
				});
				return;
			}

			// The only other response code we know how to handle
			// here is a 200, anything else should result in an
			// error.
			if (response.status !== 200) {
				resolveCallback({
					err: "unrecognized response status",
					response: response,
					result: result,
				});
				return;
			}

			// TODO: We should probably have some logic to handle a
			// 429 (ratelimiting).

			// If the skylink was a resolver link (meaning the
			// version is 2), check the 'skynet-proof' header to
			// verify that the registry entry is being resolved
			// correctly.
			if (version === 2) {
				// Grab the proof header.
				let proofJSON = response.headers.get("skynet-proof");
				if (proofJSON === null) {
					log("lifecycle", "downloadSkylink response did not include resolver proofs on resolver link", response.status);
					progressiveFetch(endpoint, null, remainingPortalList, adjustedResolveCallback, rejectCallback);
					return;
				}
				let [proof, errPH] = parseJSON(proofJSON);
				if (errPH !== null) {
					log("lifecycle", "error validating the resolver link proof from the portal", errPH)
					progressiveFetch(endpoint, null, remainingPortalList, adjustedResolveCallback, rejectCallback);
					return;
				}

				// Verify the proof.
				let errVRLP;
				[u8Link, errVRLP] = verifyResolverLinkProofs(u8Link, proof)
				if (errVRLP !== null) {
					log("lifecycle", "downloadSkylink response received corrupt resolver link proofs", errVRLP)
					progressiveFetch(endpoint, null, remainingPortalList, adjustedResolveCallback, rejectCallback);
					return;
				}

				[version, offset, fetchSize, errBF] = parseSkylinkBitfield(u8Link);
				if (errBF !== null) {
					log("lifecycle", "downloadSkylink response received bad final skylink", errBF)
					progressiveFetch(endpoint, null, remainingPortalList, adjustedResolveCallback, rejectCallback);
					return;
				}
				if (version !== 1) {
					log("lifecycle", "downloadSkylink response received bad final skylink, it's not V1")
					progressiveFetch(endpoint, null, remainingPortalList, adjustedResolveCallback, rejectCallback);
					return;
				}
			}

			// TODO: We need to update the portal API so that we
			// can get a range proof on the data that we
			// downloaded. Currently we have no way to verify that
			// the data returned by the portal is the correct data.
			// The resolver link verifier updated the u8link,
			// version, offset, and fetchSize already, so we can
			// treat anything that reaches this point as a v1
			// skylink with all the corect data already set.

			resolveCallback({
				err: "none",
				response: response,
				result: result,
			});
		})
		.catch(err => {
			log("lifecycle", "downloadSkylink response parsed unsuccessfully", response, err, remainingPortalList)
			progressiveFetch(endpoint, null, remainingPortalList, adjustedResolveCallback, rejectCallback);
		})

	}
	progressiveFetch(endpoint, null, portalList, adjustedResolveCallback, rejectCallback);
}
