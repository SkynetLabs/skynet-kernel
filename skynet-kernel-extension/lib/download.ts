// downloadSkylinkResult is the object that gets returned if a call to
// downloadSkylink resolves.
interface downloadSkylinkResult {
	response: Response;
	text: string;
}

// parseSkylinkBitfield is a helper function to downloadSkylink which pulls
// the fetchSize out of the bitfield. parseSkylink will return an error if the
// offset is not zero.
var parseSkylinkBitfield = function(skylink: Uint8Array): [number, number, number, Error] {
	// Validate the input.
	if (skylink.length !== 34) {
		return [0, 0, 0, new Error("provided skylink has incorrect length")];
	}

	// Extract the bitfield.
	let bitfield = new DataView(skylink.buffer).getUint16(0, true);

	// Extract the version.
	let version = (bitfield & 3) + 1
	// Only versions 1 and 2 are recognized.
	if (version !== 1 && version !== 2) {
		return [0, 0, 0, new Error("provided skylink has unrecognized version")];
	}

	// Verify that the mode is valid, then fetch the mode.
	bitfield = bitfield >> 2;
	if ((bitfield&255) === 255) {
		return [0, 0, 0, new Error("provided skylink has an unrecognized version")];
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
		return [0, 0, 0, new Error("provided skylink has an invalid v1 bitfield")];
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
		return [0, 0, 0, new Error("provided skylink has an invalid v1 bitfield")];
	}

	// Return what we learned.
	return [version, offset, fetchSize, null];
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
var verifyResolverLinkProof = function(skylink: Uint8Array, proof: any): [Uint8Array, Error] {
	// Verify the presented skylink is formatted correctly.
	if (skylink.length !== 34) {
		return [null, new Error("skylink is malformed, expecting 34 bytes")];
	}

	// Verify that all of the required fields are present in the proof.
	if (!("data" in proof) || !("datakey" in proof) || !("publickey" in proof) || !("signature" in proof) || !("type" in proof) || !("revision" in proof)) {
		return [null, new Error("proof is malformed, fields are missing")];
	}
	if (!("algorithm" in proof.publickey) || !("key" in proof.publickey)) {
		return [null, new Error("pubkey is malformed")];
	}

	// Verify the typing of the fields.
	if (typeof proof.data !== "string") {
		return [null, new Error("data is malformed")];
	}
	let dataStr = <string>proof.data;
	if (typeof proof.datakey !== "string") {
		return [null, new Error("datakey is malformed")];
	}
	let datakeyStr = <string>proof.datakey;
	if (proof.publickey.algorithm !== "ed25519") {
		return [null, new Error("pubkey has unrecognized algorithm")];
	}
	if (typeof proof.publickey.key !== "string") {
		return [null, new Error("pubkey key is malformed")];
	}
	let pubkeyStr = <string>proof.publickey.key;
	if (typeof proof.signature !== "string") {
		return [null, new Error("signature is malformed")];
	}
	if (proof.type !== 1) {
		return [null, new Error("registry entry has unrecognized type")];
	}
	let sigStr = <string>proof.signature;
	if (typeof proof.revision !== "number") {
		return [null, new Error("revision is malformed")];
	}
	let revision = <number>proof.revision;

	// Decode all of the fields. They are presented in varied types and
	// encodings.
	let [data, errD] = hex2buf(dataStr);
	if (errD !== null) {
		return [null, addContextToErr(errD, "data is invalid hex")];
	}
	let [datakey, errDK] = hex2buf(datakeyStr);
	if (errDK !== null) {
		return [null, addContextToErr(errDK, "datakey is invalid hex")];
	}
	let [pubkey, errPK] = b64ToBuf(pubkeyStr);
	if (errPK !== null) {
		return [null, addContextToErr(errPK, "pubkey key is invalid base64")];
	}
	let [sig, errS] = hex2buf(sigStr);
	if (errS !== null) {
		return [null, addContextToErr(errS, "signature is invalid hex")];
	}

	// Verify that the data is a skylink - this is a proof for a resolver,
	// which means the proof is pointing to a specific skylink.
	if (!validSkylink(data)) {
		return [null, new Error("this skylink does not resolve to another skylink")];
	}

	// Verify that the combination of the datakey and the public key match
	// the skylink.
	let [entryID, err] = deriveRegistryEntryID(pubkey, datakey)
	if (err !== null) {
		return [null, addContextToErr(err, "proof pubkey is malformed")];
	}
	let linkID = skylink.slice(2, 34);
	for (let i = 0; i < entryID.length; i++) {
		if (entryID[i] !== linkID[i]) {
			return [null, new Error("proof pubkey and datakey do not match the skylink root")];
		}
	}

	// Verify the signature.
	if (!verifyRegistrySignature(pubkey, datakey, data, revision, sig)) {
		return [null, new Error("signature does not match")];
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
var verifyResolverLinkProofs = function(skylink: Uint8Array, proof: any): [Uint8Array, Error] {
	// Check that the proof is an array.
	if (!Array.isArray(proof)) {
		return [null, new Error("provided proof is not an array")];
	}
	if (proof.length === 0) {
		return [null, new Error("proof array is empty")];
	}

	// Check each proof in the chain, returning the final skylink.
	for (let i = 0; i < proof.length; i++) {
		let err;
		[skylink, err] = verifyResolverLinkProof(skylink, proof[i]);
		if (err !== null) {
			return [null, addContextToErr(err, "one of the resolution proofs is invalid")];
		}
	}

	// Though it says 'skylink', the verifier is actually just returning
	// whatever the registry data is. We need to check that the final value
	// is a V1 skylink.
	if (skylink.length !== 34) {
		return [null, new Error("final value returned by the resolver link is not a skylink")];
	}
	let [version, x, xx, err] = parseSkylinkBitfield(skylink);
	if (err !== null) {
		return [null, addContextToErr(err, "final value returned by resolver link is not a valid skylink")];
	}
	if (version !== 1) {
		return [null, new Error("final value returned by resolver link is not a v1 skylink")];
	}

	return [skylink, null];
}

// downloadSkylinkHandleFetch will process the response to a fetch call that
// downloads a skylink. We need the helper so that the verification step can be
// recursive and make additional calls to progressiveFetch if it is determined
// that we need to try downloading from the next portal.
var downloadSkylinkHandleFetch = function(output: progressiveFetchResult, endpoint: string, u8Link: Uint8Array): Promise<downloadSkylinkResult> {
	return new Promise((resolve, reject) => {
		let response = output.response
		// Check for 404s.
		if (response.status === 404) {
			resolve({
				response,
				text: null,
			})
			return;
		}

		// The only other response code we know how to handle
		// here is a 200, anything else should result in an
		// error.
		if (response.status !== 200) {
			reject(new Error("unrecognized response status"));
			return;
		}

		// TODO: We should probably have some logic to handle a 429
		// (ratelimiting).

		// Get the link variables, we need these. Recomputing them is
		// cleaner than passing them in again.
		let [version, offset, fetchSize, errBF] = parseSkylinkBitfield(u8Link);
		if (errBF !== null) {
			reject(addContextToErr(errBF, "skylink bitfield is invalid"))
			return;
		}

		// Helper function for readability.
		let continueFetch = function() {
			progressiveFetch(endpoint, null, output.remainingPortals)
			.then(output => {
				downloadSkylinkHandleFetch(output, endpoint, u8Link)
				.then(output => {
					resolve(output)
				})
				.catch(err => {
					reject(err)
				})
			})
			.catch(err => {
				reject(addContextToErr(err, "downloadSkylink failed"))
			})
		}

		// If the skylink was a resolver link (meaning the
		// version is 2), check the 'skynet-proof' header to
		// verify that the registry entry is being resolved
		// correctly.
		if (version === 2) {
			// Grab the proof header.
			let proofJSON = response.headers.get("skynet-proof");
			if (proofJSON === null) {
				log("lifecycle", "response did not include resolver proofs", response.status);
				continueFetch()
				return;
			}
			let [proof, errPH] = parseJSON(proofJSON);
			if (errPH !== null) {
				log("lifecycle", "error validating the resolver link proof", errPH)
				continueFetch()
				return;
			}

			// Verify the proof.
			let errVRLP;
			[u8Link, errVRLP] = verifyResolverLinkProofs(u8Link, proof)
			if (errVRLP !== null) {
				log("lifecycle", "received corrupt resolver proofs", errVRLP)
				continueFetch()
				return;
			}

			// Update the version/offset/fetchsize.
			[version, offset, fetchSize, errBF] = parseSkylinkBitfield(u8Link);
			if (errBF !== null) {
				log("lifecycle", "received invalid final skylink\n", u8Link, "\n", errBF)
				continueFetch()
				return;
			}
			// Verify the final link is a v1 link.
			if (version !== 1) {
				log("lifecycle", "received final skylink that is not V1")
				continueFetch()
				return;
			}
		}

		// At this point we've confirmed that the headers and resolver
		// proofs are valid. We've also got an updated u8Link and
		// version/offset/fetchsize to match our download, so we can
		// use those values to read the text.
		response.text()
		.then(text => {
			// TODO: We need to update the portal API so that we
			// can get a range proof on the data that we
			// downloaded. Currently we have no way to verify that
			// the data returned by the portal is the correct data.
			// The resolver link verifier updated the u8link,
			// version, offset, and fetchSize already, so we can
			// treat anything that reaches this point as a v1
			// skylink with all the corect data already set.

			resolve({
				response: response,
				text: text,
			});
		})
		.catch(err => {
			log("portal", "downloadSkylink response parsed unsuccessfully\n", response, "\n", err)
			continueFetch()
		})

	})
}

// downloadSkylink will perform a download on the provided skylink, verifying
// that the link is valid. If the link is a content link, the data returned by
// the portal will be verified against the hash. If the link is a resolver
// link, the registry entry proofs returned by the portal will be verified and
// then the resulting content will also be verified.
var downloadSkylink = function(skylink: string): Promise<downloadSkylinkResult> {
	return new Promise((resolve, reject) => {
		// Verify that the provided skylink is a valid skylink.
		let [u8Link, err64] = b64ToBuf(skylink);
		if (err64 !== null) {
			reject(addContextToErr(err64, "unable to decode skylink"))
			return;
		}
		if (u8Link.length !== 34) {
			reject(new Error("input skylink is not the correct length"));
			return;
		}
		let [version, offset, fetchSize, errBF] = parseSkylinkBitfield(u8Link);
		if (errBF !== null) {
			reject(addContextToErr(errBF, "skylink bitfield is invalid: "));
			return;
		}

		// Establish the endpoint that we want to call on the portal and the
		// list of portals we want to use.
		let endpoint = "/" + skylink + "/";
		let portalList = preferredPortals();
		progressiveFetch(endpoint, null, portalList)
		.then(output => {
			downloadSkylinkHandleFetch(output, endpoint, u8Link)
			.then(output => {
				resolve(output);
			})
			.catch(err => {
				reject(addContextToErr(err, "unable to download skylink"))
			})
		})
		.catch(err => {
			reject(addContextToErr(err, "unable to download skylink"))
		})
	})
}
