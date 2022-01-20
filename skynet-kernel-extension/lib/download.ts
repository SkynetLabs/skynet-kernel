// downloadSkylinkResult is the object that gets returned if a call to
// downloadSkylink resolves.
interface downloadSkylinkResult {
	response: Response;
	fileData: Uint8Array;
}

// parseSkylinkBitfield is a helper function to downloadSkylink which pulls
// the fetchSize out of the bitfield. parseSkylink will return an error if the
// offset is not zero.
var parseSkylinkBitfield = function(skylink: Uint8Array): [number, number, number, Error] {
	// Validate the input.
	if (skylink.length !== 34) {
		return [0, 0, 0, new Error("provided skylink has incorrect length")]
	}

	// Extract the bitfield.
	let bitfield = new DataView(skylink.buffer).getUint16(0, true)

	// Extract the version.
	let version = (bitfield & 3) + 1
	// Only versions 1 and 2 are recognized.
	if (version !== 1 && version !== 2) {
		return [0, 0, 0, new Error("provided skylink has unrecognized version")]
	}

	// Verify that the mode is valid, then fetch the mode.
	bitfield = bitfield >> 2
	if ((bitfield&255) === 255) {
		return [0, 0, 0, new Error("provided skylink has an unrecognized version")]
	}
	let mode = 0
	for (let i = 0; i < 8; i++) {
		if ((bitfield & 1) === 0) {
			bitfield = bitfield >> 1
			break
		}
		bitfield = bitfield >> 1
		mode++
	}
	// If the mode is greater than 7, this is not a valid v1 skylink.
	if (mode > 7) {
		return [0, 0, 0, new Error("provided skylink has an invalid v1 bitfield")]
	}

	// Determine the offset and fetchSize increment.
	let offsetIncrement = 4096 << mode
	let fetchSizeIncrement = 4096
	if (mode > 0) {
		fetchSizeIncrement = fetchSizeIncrement << mode-1
	}

	// The next three bits decide the fetchSize.
	let fetchSizeBits = bitfield & 7
	fetchSizeBits++ // semantic upstep, range should be [1,8] not [0,8).
	let fetchSize = fetchSizeBits * fetchSizeIncrement
	bitfield = bitfield >> 3

	// The remaining bits determine the fetchSize.
	let offset = bitfield * offsetIncrement
	if (offset + fetchSize > 1 << 22) {
		return [0, 0, 0, new Error("provided skylink has an invalid v1 bitfield")]
	}

	// Return what we learned.
	return [version, offset, fetchSize, null]
}

// validSkylink returns true if the provided Uint8Array is a valid skylink.
// This is an alias for 'parseSkylinkBitfield', as both perform the same
// validation.
var validSkylink = function(skylink: Uint8Array): boolean {
	// Get the bitfield values. If the bitfield parsing doesn't return an error, 
	let [version, offset, fetchSize, errPSB] = parseSkylinkBitfield(skylink)
	if (errPSB !== null) {
		return false
	}
	return true
}

// verifyResolverLinkProof will check that the given resolver proof matches the
// provided skylink. If the proof is correct and the signature matches, the
// data will be returned. The returned link will be a verified skylink.
var verifyResolverLinkProof = function(skylink: Uint8Array, proof: any): [Uint8Array, Error] {
	// Verify the presented skylink is formatted correctly.
	if (skylink.length !== 34) {
		return [null, new Error("skylink is malformed, expecting 34 bytes")]
	}

	// Verify that all of the required fields are present in the proof.
	if (!("data" in proof) || !("datakey" in proof) || !("publickey" in proof) || !("signature" in proof) || !("type" in proof) || !("revision" in proof)) {
		return [null, new Error("proof is malformed, fields are missing")]
	}
	if (!("algorithm" in proof.publickey) || !("key" in proof.publickey)) {
		return [null, new Error("pubkey is malformed")]
	}

	// Verify the typing of the fields.
	if (typeof proof.data !== "string") {
		return [null, new Error("data is malformed")]
	}
	let dataStr = <string>proof.data
	if (typeof proof.datakey !== "string") {
		return [null, new Error("datakey is malformed")]
	}
	let datakeyStr = <string>proof.datakey
	if (proof.publickey.algorithm !== "ed25519") {
		return [null, new Error("pubkey has unrecognized algorithm")]
	}
	if (typeof proof.publickey.key !== "string") {
		return [null, new Error("pubkey key is malformed")]
	}
	let pubkeyStr = <string>proof.publickey.key
	if (typeof proof.signature !== "string") {
		return [null, new Error("signature is malformed")]
	}
	if (proof.type !== 1) {
		return [null, new Error("registry entry has unrecognized type")]
	}
	let sigStr = <string>proof.signature
	if (typeof proof.revision !== "number") {
		return [null, new Error("revision is malformed")]
	}
	let revision = <number>proof.revision

	// Decode all of the fields. They are presented in varied types and
	// encodings.
	let [data, errD] = hex2buf(dataStr)
	if (errD !== null) {
		return [null, addContextToErr(errD, "data is invalid hex")]
	}
	let [datakey, errDK] = hex2buf(datakeyStr)
	if (errDK !== null) {
		return [null, addContextToErr(errDK, "datakey is invalid hex")]
	}
	let [pubkey, errPK] = b64ToBuf(pubkeyStr)
	if (errPK !== null) {
		return [null, addContextToErr(errPK, "pubkey key is invalid base64")]
	}
	let [sig, errS] = hex2buf(sigStr)
	if (errS !== null) {
		return [null, addContextToErr(errS, "signature is invalid hex")]
	}

	// Verify that the data is a skylink - this is a proof for a resolver,
	// which means the proof is pointing to a specific skylink.
	if (!validSkylink(data)) {
		return [null, new Error("this skylink does not resolve to another skylink")]
	}

	// Verify that the combination of the datakey and the public key match
	// the skylink.
	let [entryID, errREID] = deriveRegistryEntryID(pubkey, datakey)
	if (errREID !== null) {
		return [null, addContextToErr(errREID, "proof pubkey is malformed")]
	}
	let linkID = skylink.slice(2, 34)
	for (let i = 0; i < entryID.length; i++) {
		if (entryID[i] !== linkID[i]) {
			return [null, new Error("proof pubkey and datakey do not match the skylink root")]
		}
	}

	// Verify the signature.
	if (!verifyRegistrySignature(pubkey, datakey, data, revision, sig)) {
		return [null, new Error("signature does not match")]
	}
	return [data, null]
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
		return [null, new Error("provided proof is not an array")]
	}
	if (proof.length === 0) {
		return [null, new Error("proof array is empty")]
	}

	// Check each proof in the chain, returning the final skylink.
	for (let i = 0; i < proof.length; i++) {
		let errVRLP
		[skylink, errVRLP] = verifyResolverLinkProof(skylink, proof[i])
		if (errVRLP !== null) {
			return [null, addContextToErr(errVRLP, "one of the resolution proofs is invalid")]
		}
	}

	// Though it says 'skylink', the verifier is actually just returning
	// whatever the registry data is. We need to check that the final value
	// is a V1 skylink.
	if (skylink.length !== 34) {
		return [null, new Error("final value returned by the resolver link is not a skylink")]
	}
	let [version, x, xx, errPSB] = parseSkylinkBitfield(skylink)
	if (errPSB !== null) {
		return [null, addContextToErr(errPSB, "final value returned by resolver link is not a valid skylink")]
	}
	if (version !== 1) {
		return [null, new Error("final value returned by resolver link is not a v1 skylink")]
	}

	return [skylink, null]
}

// verifyDownload will verify a download response from a portal. The input is
// essentially components of a skylink - the offset, length, and merkle root.
// The output is the raw file data.
//
// The 'buf' input should match the standard response body of a verified
// download request to a portal, which is the skylink raw data followed by a
// merkle proof. The offset and length provided as input indicate the offset
// and length of the skylink raw data - not the offset and length of the
// request within the file (that would be a different set of params).
//
// The skylink raw data itself breaks down into a metadata component and a file
// component. The metadata component will contain information like the length
// of the real file, and any fanout structure for large files. The first step
// we need to take is verifying the Merkel proof, which will appear at the end
// of the buffer. We'll have to hash the data we received and then compare it
// against the Merkle proof and ensure it matches the data we are expecting.
// Then we'll have to look at the layout to figure out which pieces of the data
// are the full file, while also checking for corruption as the file can be
// malicious independent of the portal operator.
//
// As long as the Merkle proof matches the root, offset, and length that we
// have as input, the portal is considered non-malicious. Any additional errors
// we find after that can be considered malice or incompetence on the part of
// the person who uploaded the file.
var verifyDownload = function(root: Uint8Array, offset: number, fetchSize: number, buf: ArrayBuffer): [Uint8Array, boolean, Error] {
	let u8 = new Uint8Array(buf)
	// Input checking. If any of this is incorrect, its safe to blame the
	// server because the skylink format fundamentally should enable these
	// to be correct.
	if (u8.length < fetchSize) {
		return [null, true, new Error("provided data is not large enough to cover fetchSize")]
	}
	if (u8.length < 99) {
		return [null, true, new Error("provided data is not large enough to contain a skyfile")]
	}

	// Grab the skylinkData and Merkle proof from the array, and then
	// verify the Merkle proof.
	let skylinkData = u8.slice(0, fetchSize)
	let merkleProof = u8.slice(fetchSize, u8.length)
	let errVBSRP = verifyBlake2bSectorRangeProof(root, skylinkData, offset, fetchSize, merkleProof)
	if (errVBSRP !== null) {
		log("lifecycle", "merkle proof verification error", skylinkData.length, offset, fetchSize)
		return [null, true, addContextToErr(errVBSRP, "provided Merkle proof is not valid")]
	}

	// The organization of the skylinkData is always:
	// 	layoutBytes || fanoutBytes || metadataBytes || fileBytes
	//
	// The layout is always exactly 99 bytes. Bytes [1,8] of the layout
	// contain the exact size of the fileBytes. Bytes [9, 16] of the layout
	// contain the exact size of the metadata. And bytes [17,24] of the
	// layout contain the exact size of the fanout. To get the offset of
	// the fileData, we need to extract the sizes of the metadata and
	// fanout, and then add those values to 99 to get the fileData offset.
	let fileSizeBytes = skylinkData.slice(1, 9)
	let mdSizeBytes = skylinkData.slice(9, 17)
	let fanoutSizeBytes = skylinkData.slice(17, 25)
	let [fileSize, errFSDN] = decodeNumber(fileSizeBytes)
	if (errFSDN !== null) {
		return [null, false, addContextToErr(errFSDN, "unable to decode filesize")]
	}
	let [mdSize, errMDDN] = decodeNumber(mdSizeBytes)
	if (errMDDN !== null) {
		return [null, false, addContextToErr(errMDDN, "unable to decode metadata size")]
	}
	let [fanoutSize, errFODN] = decodeNumber(fanoutSizeBytes)
	if (errFODN !== null) {
		return [null, false, addContextToErr(errFODN, "unable to decode fanout size")]
	}
	if (skylinkData.length < 99 + fileSize + mdSize + fanoutSize) {
		// return [null, false, new Error("provided data is too short to contain the full skyfile")]
	}
	let fileData = skylinkData.slice(99+mdSize+fanoutSize, 99+mdSize+fanoutSize+fileSize)
	return [fileData, false, null]
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
				fileData: null,
			})
			return
		}

		// The only other response code we know how to handle
		// here is a 200, anything else should result in an
		// error.
		if (response.status !== 200) {
			log("portal", "unrecognized response status from portal\n", response)
			reject(new Error("unrecognized response status"))
			return
		}

		// Get the link variables, we need these. Recomputing them is
		// cleaner than passing them in again.
		let [version, offset, fetchSize, errBF] = parseSkylinkBitfield(u8Link)
		if (errBF !== null) {
			reject(addContextToErr(errBF, "skylink bitfield is invalid"))
			return
		}

		// Helper function for readability.
		let continueFetch = function() {
			progressiveFetch(endpoint, null, output.remainingPortals, output.first4XX)
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
			let proofJSON = response.headers.get("skynet-proof")
			if (proofJSON === null) {
				log("portal", "response did not include resolver proofs", response)
				continueFetch()
				return
			}
			let [proof, errPH] = parseJSON(proofJSON)
			if (errPH !== null) {
				log("portal", "error validating the resolver link proof", errPH)
				continueFetch()
				return
			}

			// Verify the proof.
			let errVRLP
			[u8Link, errVRLP] = verifyResolverLinkProofs(u8Link, proof)
			if (errVRLP !== null) {
				log("portal", "received corrupt resolver proofs", errVRLP)
				continueFetch()
				return
			}

			// Update the version/offset/fetchsize.
			[version, offset, fetchSize, errBF] = parseSkylinkBitfield(u8Link)
			if (errBF !== null) {
				log("portal", "received invalid final skylink\n", u8Link, "\n", errBF)
				continueFetch()
				return
			}
			// Verify the final link is a v1 link.
			if (version !== 1) {
				log("portal", "received final skylink that is not V1")
				continueFetch()
				return
			}
		}

		// At this point we've confirmed that the headers and resolver
		// proofs are valid. We've also got an updated u8Link and
		// version/offset/fetchsize to match our download, so we can
		// use those values to read the text.
		response.arrayBuffer()
		.then(buf => {
			// Verify the data that we have downloaded from the
			// server.
			let [fileData, portalAtFault, errVD] = verifyDownload(u8Link.slice(2, 34), offset, fetchSize, buf)
			if (errVD !== null && portalAtFault) {
				log("lifecycle", "received invalid download from portal", errVD)
				continueFetch()
				return
			}
			if (errVD !== null && !portalAtFault) {
				log("lifecycle", "received valid download, but data is corrupt")
				reject(addContextToErr(errVD, "the requested download is corrupt"))
				return
			}

			// Download is complete, the fileData is verified, we
			// can return it.
			resolve({
				response: response,
				fileData: fileData,
			})
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
		let [u8Link, err64] = b64ToBuf(skylink)
		if (err64 !== null) {
			reject(addContextToErr(err64, "unable to decode skylink"))
			return
		}
		if (u8Link.length !== 34) {
			reject(new Error("input skylink is not the correct length"))
			return
		}
		let [version, offset, fetchSize, errBF] = parseSkylinkBitfield(u8Link)
		if (errBF !== null) {
			reject(addContextToErr(errBF, "skylink bitfield is invalid"))
			return
		}

		// Establish the endpoint that we want to call on the portal and the
		// list of portals we want to use.
		let endpoint = "/skynet/trustless/basesector/" + skylink // + "/"
		let portalList = preferredPortals()
		progressiveFetch(endpoint, null, portalList, null)
		.then(output => {
			downloadSkylinkHandleFetch(output, endpoint, u8Link)
			.then(output => {
				resolve(output)
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

// TODO: Remove this function. Currently we cannot remove it because the kernel
// itself uses the function to download and serve the user's homescreen. Once
// the kernel is cleaned up to use the secure functions, we can remove this.
var downloadV1Skylink = function(skylink: string) {
	return fetch(skylink).then(response => response.text())
}
