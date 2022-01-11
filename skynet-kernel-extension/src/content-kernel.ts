export {};

// TODO: Right now every application that opens an iframe to the kernel is
// going to load a separate instance of the kernel, it may make more sense to
// have the kernel operate entirely from shared workers. Still need to explore
// that.

// TODO: We can probably make more liberal use of the typing system in
// typescript to get more robust code, especially around error handling.

// TODO: I don't think we are verifying all of the untrusted inputs we are
// receiving.

// TODO: Need to switch the entire protocol over to using encryption.

// Set a title and a message which indicates that the page should only be
// accessed via an invisible iframe.
document.title = "kernel.siasky.net"
var header = document.createElement('h1');
header.textContent = "Something went wrong! You should not be visiting this page, this page should only be accessed via an invisible iframe.";
document.body.appendChild(header);

// log provides syntactic sugar for the logging functions. The first arugment
// passed into 'log' checks whether the logSettings have explicitly enabled
// that type of logging. The remaining args will be printed as they would if
// 'console.log' was called directly.
// 
// This is a minimal logging function that we expect will be overwritten by the
// kernel.
//
// TODO: Need to create an API for changing the logging settings in the kernel.
// API should be built from the kernel proper though no reason to have it in
// the browser extension. We only put it in the browser extension in the first
// place because so many of the lifecycle messages are important. One of the
// things we can do here is have the 'log' functino pay attention to all the
// different log types that come through, and present the user with the option
// to enable any particular set of them. May as well also have an option to
// enable all logs, though that could potentially be very verbose.
var log = function(logType: string, ...inputs: any) {
	// Fetch the log settings as a string.
	let logSettingsStr = localStorage.getItem("v1-logSettings");

	// If there is no logSettingsStr set yet, create one with the default
	// logging settings active. These don't get persisted, which makes
	// debugging easier (just wipe the log settings and make changes here
	// as needed, to avoid having to use the kernel api to change your log
	// settings as you develop).
	if (logSettingsStr === null) {
		logSettingsStr = '{"ERROR": true, "error": true, "lifecycle": true, "portal": true}';
	}

	// Wrap the JSON.parse in a try-catch block. If the parse
	// fails, we want to catch the error and report that the
	// logSettings persistence has corrupted.
	try {
		// Logging is disabled by default, except for the
		// messages that are explicitly set to come through.
		let logSettings = JSON.parse(logSettingsStr);
		if (logSettings[logType] !== true && logSettings.allLogsEnabled !== true) {
			return;
		}
	} catch (err) {
		console.log("ERROR: logSettings item in localstorage is corrupt:", err);
		console.log(logSettingsStr);
		return;
	}

	// Print the log.
	let args = Array.prototype.slice.call(arguments);
	args[0] = `[${logType}] Kernel (${performance.now()} ms): `;
	console.log.apply(console, args);
	return;
};

log("lifecycle", "kernel has been opened");

// NOTE: The imports need to happen in a specific order. In particular, ed25519
// depends on sha512, so the sha512 import should be listed first.
//
// TODO: The transplant contains the V2 skylink of the full kernel that we have
// developed in the other folder. This link should actually not be a
// transplant, it should be hardcoded! During this early phase of development -
// before the core kernel and the bootloader have been split into separate
// repos - we are keeping the transplant to make development easier.

// import:::skynet-kernel-extension/lib/sha512.ts

// import:::skynet-kernel-extension/lib/ed25519.ts

// import:::skynet-kernel-extension/lib/blake2b.ts

// transplant:::skynet-kernel-skyfiles/skynet-kernel.js

log("lifecycle", "imports have loaded");

var defaultPortalList = ["siasky.net", "eu-ger-12.siasky.net"];

// Define an Ed25519KeyPair so that it can be returned as part of an array and
// still pass the Typescript type checks.
interface Ed25519KeyPair {
	publicKey: Uint8Array;
	secretKey: Uint8Array;
}

// getUserSeed will return the seed that is stored in localStorage. This is the
// first function that gets called when the kernel iframe is openend. The
// kernel will not be loaded if no seed is present, as it means that the user
// is not logged in.
var getUserSeed = function(): [Uint8Array, string] {
	let userSeedString = window.localStorage.getItem("v1-seed");
	if (userSeedString === null) {
		return [null, "no user seed in local storage"];
	}
	let userSeed: Uint8Array;
	try {
		userSeed = new TextEncoder().encode(userSeedString);
	} catch(err) {
		return [null, "user seed is not valid"];
	}
	return [userSeed, ""];
}

// logOut will erase the localStorage, which means the seed will no longer be
// available, and any sensistive data that the kernel placed in localStorage
// will also be cleared.
var logOut = function() {
	log("lifecycle", "clearing local storage after logging out");
	localStorage.clear();
}

// buf2hex takes a Uint8Array as input (or any ArrayBuffer) and returns the hex
// encoding of those bytes. The return value is a string.
var buf2hex = function(buffer: ArrayBuffer) {
	return [...new Uint8Array(buffer)]
		.map(x => x.toString(16).padStart(2, '0'))
		.join('');
}

// hex2buf takes an untrusted string as input, verifies that the string is
// valid hex, and then converts the string to a Uint8Array.
var hex2buf = function(hex: string): [Uint8Array, string] {
	// Check that the length makes sense.
	if (hex.length%2 != 0) {
		return [null, "input has incorrect length"];
	}

	// Check that all of the characters are legal.
	let match = /[0-9A-Fa-f]*/g;
	if (!match.test(hex)) {
		return [null, "input has invalid character"];
	}

	// Create the buffer and fill it.
	let matches = hex.match(/.{1,2}/g);
	if (matches === null) {
		return [null, "input is incomplete"];
	}
	let u8 = new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
	return [u8, null];
}

// b64ToBuf will take an untrusted base64 string and convert it into a
// Uin8Array, returning an error if the input is not valid base64.
var b64ToBuf = function(b64: string): [Uint8Array, string] {
	// Check that the final string is valid base64.
	let b64regex = /^[0-9a-zA-Z-_]*$/;
	if (!b64regex.test(b64)) {
		return [null, "provided string is not valid base64"];
	}

	// Swap any '-' characters for '+', and swap any '_' characters for '/'
	// for use in the atob function.
	b64 = b64.replace(/-/g, "+").replace(/_/g, "/");

	// Perform the conversion.
	let binStr = atob(b64);
	let len = binStr.length;
	let buf = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		buf[i] = binStr.charCodeAt(i);
	}
	return [buf, null];
}

// encodeNumber will take a number as input and return a corresponding
// Uint8Array.
var encodeNumber = function(num: number): Uint8Array {
	let encoded = new Uint8Array(8);
	for (let index = 0; index < encoded.length; index++) {
		let byte = num & 0xff;
		encoded[index] = byte
		num = num >> 8;
	}
	return encoded
}

// encodePrefixedBytes takes a Uint8Array as input and returns a Uint8Array
// that has the length prefixed as an 8 byte prefix. Inside the function we use
// 'setUint32', which means that the input needs to be less than 4 GiB. For all
// known use cases, this is fine.
//
// TODO: I'm not completely sure why the implementation of encodeNumber and
// encodePrefixBytes is so different.
var encodePrefixedBytes = function(bytes: Uint8Array): Uint8Array {
	let len = bytes.length;
	let buf = new ArrayBuffer(8 + len);
	let view = new DataView(buf);
	view.setUint32(0, len, true);
	let uint8Bytes = new Uint8Array(buf);
	uint8Bytes.set(bytes, 8);
	return uint8Bytes;
}

// preferredPortals will determine the user's preferred portals by looking in
// localStorage. If no local list of portals is found, the hardcoded default
// list of portals will be set. This function does not check the network.
//
// Even if there is a list of preferred portals in localStorage, this function
// will append the list of default portals to that list (as lower priority
// portals) to increase the chance that a user is able to connect to Skynet.
// This is particularly useful for users who are reviving very old Skynet
// accounts and may have an outdated list of preferred portals.
var preferredPortals = function(): string[] {
	// Try to get the list of portals from localstorage. If there is no
	// list, just use the list hardcoded by the extension.
	let portalListStr = window.localStorage.getItem("v1-portalList");
	if (portalListStr === null) {
		return defaultPortalList;
	}

	try {
		let portalList = JSON.parse(portalListStr);

		// Append the list of default portals to the set of portals. In
		// the event that all of the user's portals are bad, they will
		// still be able to connect to Skynet. Because the portals are
		// trust minimized, there shouldn't be an issue with
		// potentially connecting to portals that the user hasn't
		// strictly authorized.
		for (let i = 0; i < defaultPortalList.length; i++) {
			// Check for duplicates between the default list and
			// the user's list. This deduplication is relevant for
			// performance, because lookups will sequentially check
			// every portal until a working portal is found. If
			// there are broken portals duplicated in the final
			// list, it will take longer to get through the list.
			let found = false;
			for (let j = 0; j < portalList.length; j++) {
				if (portalList[j] === defaultPortalList[i]) {
					found = true;
					break;
				}
			}
			if (!found) {
				portalList.push(defaultPortalList[i]);
			}
		}
		return portalList;
	} catch (err) {
		// We log an error but we don't change anything because the
		// data may have been placed there by a future version of the
		// kernel and we don't want to clear anything that might be
		// relevant or useful once the full kernel has finished
		// loading.
		log("error", err, portalListStr);
		return defaultPortalList;
	}
}

// progressiveFetch will query multiple portals until one returns with the
// correct response. If there is a success, it will call the success callback.
// If all of the portals fail, it will call the failure callback.
var progressiveFetch = function(endpoint: string, fetchOpts: any, portals: string[], resolveCallback: any, rejectCallback: any) {
	if (portals.length === 0) {
		log("progressiveFetch", "progressiveFetch failed because all portals have been tried", endpoint, fetchOpts);
		rejectCallback("no more portals available");
		return;
	}

	// Try the next portal in the array.
	let portal = portals.shift();
	let query = "https://" + portal + endpoint;
	fetch(query, fetchOpts)
	.then(response => {
		// Success! Handle the response.
		log("allFetch", "fetch returned successfully", query, "::", response);
		resolveCallback(response, portals);
	})
	.catch((error) => {
		// Try the next portal.
		log("portal", query, "::", error);
		progressiveFetch(endpoint, fetchOpts, portals, resolveCallback, rejectCallback)
	})
}

// ownRegistryEntryKeys will use the user's seed to derive a keypair and a
// datakey using the provided tags.
var ownRegistryEntryKeys = function(keyPairTagStr: string, dataKeyTagStr: string): [Ed25519KeyPair, Uint8Array] {
	// Use the user's seed to derive the registry entry that is going to contain
	// the user's portal list.
	let keyPairEntropy = new Uint8Array(HASH_SIZE);
	let keyPairTag = new TextEncoder().encode(keyPairTagStr);
	let entropyInput = new Uint8Array(keyPairTag.length+userSeed.length);
	entropyInput.set(keyPairTag);
	entropyInput.set(userSeed, keyPairTag.length);
	sha512(keyPairEntropy, entropyInput, entropyInput.length);
	// Use the user's seed to dervie the dataKey for the registry entry. We use
	// a different tag to ensure that the dataKey is independently random, such
	// that the registry entry looks like it could be any other registry entry.
	let dataKeyEntropy = new Uint8Array(HASH_SIZE);
	let dataKeyTag = new TextEncoder().encode(dataKeyTagStr);
	let dataKeyInput = new Uint8Array(dataKeyTag.length+userSeed.length);
	dataKeyInput.set(dataKeyTag);
	dataKeyInput.set(userSeed, dataKeyTag.length);
	sha512(dataKeyEntropy, dataKeyInput, dataKeyInput.length);

	// Create the private key for the registry entry.
	let keyPair = keyPairFromSeed(keyPairEntropy.slice(0, 32));
	let dataKey = dataKeyEntropy.slice(0, 32);
	return [keyPair, dataKey];
}

// verifyRegReadResp will check the response body of a registry read on a
// portal. The first return value indicates whether the error that gets
// returned is a problem with the portal, or a problem with the underlying
// registry entry. If the problem is with the portal, the caller should try the
// next portal. If the problem is with the underyling registry entry, the
// caller should handle the error and not try any more portals.
var verifyRegReadResp = function(response, result, pubkey, dataKey): [boolean, string] {
	// If the portal reports that it's having trouble filling the request,
	// try the next portal. The portals are set up so that a 5XX error
	// indicates that other portals may have better luck.
	if (response.status >= 500 && response.status < 600) {
		return [true, "received 5XX from portal"];
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
		if (result.type !== 1) {
			return [false, "registry entry is not of type 1"];
		}

		// Verify the reponse has all required fields.
		if (!("data" in result) || !("revision" in result) || !("signature" in result)) {
			return [true, "response is missing fields"];
		}
		// Verify the signature on the registry entry.
		if (!(typeof(result.data) === "string") || !(typeof(result.revision) === "number") || !(typeof(result.signature) === "string")) {
			return [true, "portal response has invalid format"]
		}

		// Attempt to decode the hex values of the results.
		let [data, err1] = hex2buf(result.data);
		if (err1 !== null) {
			return [true, "portal result data did not decode from hex"];
		}
		let [sig, err3] = hex2buf(result.signature);
		if (err3 !== null) {
			return [true, "portal result signature did not decode from hex"];
		}

		// The data has passed verification, check the
		// signature.
		let encodedData = encodePrefixedBytes(data);
		let encodedRevision = encodeNumber(result.revision);
		let dataToVerify = new Uint8Array(32 + 8 + data.length + 8);
		dataToVerify.set(dataKey, 0);
		dataToVerify.set(encodedData, 32);
		dataToVerify.set(encodedRevision, 32+8+data.length);
		let sigHash = blake2b(dataToVerify, 32);
		if (!verify(sigHash, sig, pubkey)) {
			return [true, "portal response has a signature mismatch"];
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

	return [true, "portal response not recognized"];
}

// readOwnRegistryEntry will read and verify a registry entry that is owned by
// the user. The tag strings will be hashed with the user's seed to produce the
// correct entropy.
var readOwnRegistryEntry = function(keyPairTagStr: string, dataKeyTagStr: string, resolveCallback: any, rejectCallback: any) {
	// Fetch the keys.
	let [keyPair, dataKey] = ownRegistryEntryKeys(keyPairTagStr, dataKeyTagStr);
	let pubkeyHex = buf2hex(keyPair.publicKey);
	let dataKeyHex = buf2hex(dataKey);

	// Get a list of portals, then try fetching the entry from each portal
	// until a successful response is received. A 404 is considered a
	// successful response.
	let portalList = preferredPortals();
	let endpoint = "/skynet/registry?publickey=ed25519%3A"+pubkeyHex+"&datakey="+dataKeyHex;

	// The adjustedResolveCallback allows us to verify the integrity of the
	// portal's response before passing it back to the caller. If the
	// portal's response is found to be malicious or otherwise
	// untrustworthy, we will redo the progressiveFetch with the remaining
	// portal list.
	let adjustedResolveCallback = function(response, remainingPortalList) {
		// Read the response, then handle the response in callbacks.
		response.json()
		.then(result => {
			log("readOwnRegistryEntry", "progressiveFetch called the successCallback", response, result);

			// Check the response from the portal and then either
			// try the next portal or call the resolve callback.
			let [portalIssue, err] = verifyRegReadResp(response, result, keyPair.publicKey, dataKey);
			if (err !== null && portalIssue === true) {
				log("portal", "portal returned an invalid regread response", err, response.status, response.statusText, response.url, result);
				progressiveFetch(endpoint, null, remainingPortalList, adjustedResolveCallback, rejectCallback);
				return;
			}
			if (err !== null && portalIssue === false) {
				log("lifecycle", "registry entry is corrupt or browser extension is out of date", err, response.status, response.statusText, response.url, result);
				resolveCallback({
					err: err,
					response: response,
					result: result,
				});
				return;
			}

			// The err is null, call the resolve callback.
			resolveCallback({
				err: "none",
				response: response,
				result: result,
			});
		})
		.catch(err => {
			log("portal", "unable to parse response body", response, err);
			progressiveFetch(endpoint, null, remainingPortalList, adjustedResolveCallback, rejectCallback);
		})
	};
	progressiveFetch(endpoint, null, portalList, adjustedResolveCallback, rejectCallback);
}

// writeNewOwnRegistryEntry will write the provided data to a new registry
// entry. A revision number of 0 will be used, because this function is
// assuming that no data yet exists at that registry entry location.
var writeNewOwnRegistryEntry = function(keyPairTagStr: string, dataKeyTagStr: string, data: Uint8Array, resolveCallback: any, rejectCallback: any) {
	// Fetch the keys.
	let [keyPair, dataKey] = ownRegistryEntryKeys(keyPairTagStr, dataKeyTagStr);
	let pubkeyHex = buf2hex(keyPair.publicKey);
	let dataKeyHex = buf2hex(dataKey);

	// Compute the signature of the new registry entry.
	let encodedData = encodePrefixedBytes(data);
	let encodedRevision = encodeNumber(0);
	let dataToSign = new Uint8Array(32 + 8 + data.length + 8);
	dataToSign.set(dataKey, 0);
	dataToSign.set(encodedData, 32);
	dataToSign.set(encodedRevision, 32+8+data.length);
	let sigHash = blake2b(dataToSign, 32);
	let sig = sign(sigHash, keyPair.secretKey);

	// Compose the registry entry query.
	let postBody = {
		publickey: {
			algorithm: "ed25519",
			key: Array.from(keyPair.publicKey),
		},
		dataKey: dataKeyHex,
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
			progressiveFetch(endpoint, fetchOpts, remainingPortalList, adjustedResolveCallback, rejectCallback);
		}
	}
	progressiveFetch(endpoint, fetchOpts, portalList, adjustedResolveCallback, rejectCallback);
	return;
}

// parseSkylinkV1Bitfield is a helper function to downloadSkylink which pulls
// the fetchSize out of the bitfield. parseSkylink will return an error if the
// offset is not zero.
var parseSkylinkV1Bitfield = function(bitfield: number): [number, number, string] {
	// Verify that the mode is valid.
	bitfield = bitfield >> 2;
	if ((bitfield&255) === 255) {
		return [0, 0, "provided skylink has an unrecognized version"];
	}

	// Fetch the mode, consuming the mode bits in the process.
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
		return [0, 0, "provided skylink has an invalid v1 bitfield"];
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

	// Determine the offset, which is the remaining bits.
	let offset = bitfield * offsetIncrement;
	if (offset + fetchSize > 1 << 22) {
		return [0, 0, "provided skylink has an invalid v1 bitfield"];
	}
	return [offset, fetchSize, null];
}

// downloadSkylink will securely download a skylink, checking all of the proofs
// associated with any resolver links, and then verifying the hash of the final
// v1 skylink.
//
// downloadSkylink will verify that the input skylink is a valid skylink,
// calling the rejectCallback with an error if it is not.
var downloadSkylink = function(skylink: string, resolveCallback: any, rejectCallback: any) {
	// Verify that the provided skylink is a valid skylink.
	let [u8Link, err] = b64ToBuf(skylink);
	if (err !== null) {
		rejectCallback("unable to decode skylink: " + err);
		return;
	}
	if (u8Link.length !== 34) {
		rejectCallback("input skylink is not the correct length");
		return;
	}
	// Extract the bitfield.
	let bitfield = new DataView(u8Link).getUint16(0, true);
	let version = (bitfield & 3) + 1
	// Only versions 1 and 2 are recognized.
	if (version !== 1 && version !== 2) {
		rejectCallback("provided skylink has an unrecognized version");
		return;
	}
	// Version 2 links should have the rest of the bitfield unset.
	if (version === 2 && (bitfield & 3) !== bitfield) {
		rejectCallback("provided skylink has an unrecognized version");
		return;
	}

	// If the link is a v1 skylink, determine the fetchSize.
	let offset = 0;
	let fetchSize = 0;
	if (version === 1) {
		let [o, fs, err] = parseSkylinkV1Bitfield(bitfield)
		if (err !== null) {
			rejectCallback(err)
			return;
		}
		offset = o;
		fetchSize = fs;
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
			log("lifecycle", "downloadSkylink response parsed successfully", response, result, remainingPortalList)

			for (let header of response.headers) {
				log("lifecycle", header)
			}

			// TODO: Determine whether the input link is a V2
			// skylink. If the input link is a V2 skylink, the
			// first N elements of the 'skynet-proof' header will
			// contain registry proofs that show the registry entry
			// resolved

			// TODO: The 'skynet-proof' header contains the
			// resolution data that we need to verify the link was
			// resolved correctly. Unfortunately, it doesn't seem
			// to contain merkle proofs in the event that we have
			// made a ranged request. We can get around this
			// temporarily by assuming zero-padding in the tail,
			// but even that is sort of bad because none of this
			// stuff has been encrypted.

			// TODO: Verify any skylink resolutions that had to be
			// made. We also need to verify that the version of the
			// skylink provided to the function matches the
			// response - if it's a v2 link, we are expecting the
			// portal to provide resolution proofs. If its a v1
			// link, we should expect that there are no resolution
			// proofs.

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

// downloadV1Skylink will download the raw data for a skylink and then verify
// that the downloaded content matches the hash of the skylink.
var downloadV1Skylink = function(skylink: string) {
	// TODO: Delete as soon as downloadSkylink is done.

	return fetch(skylink).then(response => response.text())
}

// loadUserPortalPreferencesRegReadSuccess is the callback that will be
// performed by loadUserPortalPreferences after a successful call to the
// registry entry that holds all of the user's preferred portals.
var loadUserPortalPreferencesRegReadSuccess = function(output) {
	// In the event of a 404, we want to store the default list as the set
	// of user's portals. We do this so that subsequent kernel iframes that
	// the user opens don't need to go to the network as part of the
	// startup process. The full kernel will set the localStorage item to
	// another value when the user selects portals.
	if (output.response.status === 404) {
		window.localStorage.setItem("v1-portalList", JSON.stringify(defaultPortalList));
		log("lifecycle", "user portalList set to the default list after getting 404 on registry lookup");
	} else {
		// TODO: Need to parse the data and correctly set the
		// user's portal list.
		window.localStorage.setItem("v1-portalList", JSON.stringify(defaultPortalList));
		log("error", "user portalList set to the default list after getting a response but not bothering to check it");
	}
}

// loadUserPortalPreferences will fetch the user's remote portal preferences
// from their portal registry entry and update local storage to reflect the
// user's preferences. If the localstorage is already set containing a set of
// preferences, no network operations are performed, we will allow the full
// kernel to decide when and how to update the user's local portal settings.
//
// The callback will be run once the user's preferred portals have been
// established. If there is some error in establishing the user's portals,
// localstorage will remain blank and the callback will be called anyway. This
// function does not guarantee that the user's portals are properly loaded, it
// merely makes a best attempt.
var loadUserPortalPreferences = function(callback: any) {
	// Try to get the list of portals from localstorage.
	let portalListStr = window.localStorage.getItem("v1-portalList");
	if (portalListStr !== null) {
		callback();
		return;
	}

	// Attempt to fetch the user's list of portals from Skynet. This
	// particular request will use the default set of portals established
	// by the browser extension, as there is no information available yet
	// about the user's preferred portal.
	//
	// If the user does not have any portals set on Skynet either, we will
	// write the default list of portals to localstorage, which will
	// eliminate the need to perform this call in the future.
	//
	// We need to define inline functions for the resolve and reject
	// callbacks because there's no easy way to pass the
	// loadUserPortalPreferences callback into them without doing it
	// inline. Yay javascript (if there's a better way, lmk).
	readOwnRegistryEntry("v1-skynet-portal-list", "v1-skynet-portal-list-dataKey",
		// This is the success callback.
		function(output) {
			loadUserPortalPreferencesRegReadSuccess(output);
			callback();
		},
		// This is the error callback.
		function(err) {
			log("lifecycle", "unable to load the users list of preferred portals", err);
			callback();
		}
	);
}

// kernelDiscoveryComplete defines the callback that is called in
// readRegistryAndLoadKernel after reading the registry entry containing the
// kernel successfully. Note that success can imply a 404 or some other
// non-result, but it does mean that we successfully reached Skynet.
//
// We're going to check what the kernel is supposed to be and then download it.
// If there is kernel, we'll set the user's kernel to the default kernel
// hardcoded into the extension and download that. We set the user's kernel on
// 404 because this is going to be the user's first kernel, and we want to make
// sure that the next time they log in (even if from another device) they get
// the same kernel again. We don't want the user jumping between kernels as
// they change web browsers simply because they never got far enough to
// complete setup, we want a consistent user experience.
//
// TODO: We should adjust the flow here so that instead of doing two round
// trips to load the user kernel, we should use the full resolver link protocol
// and load the kernel in a single round trip. This will require adding a new
// function to the kernel that can fetch resolver links and fully verify them.
var kernelDiscoveryComplete = function(regReadReturn) {
	let err = regReadReturn.err;
	let response = regReadReturn.response;
	let result = regReadReturn.result;

	// If there was an error in loading the kernel, we want to abort
	// loading the kernel.
	if (err !== "none") {
		kernelDiscoveryFailed(err);
		return;
	}

	// Check for a 404, which means that the user does not have a kernel.
	// If the user does not have a kernel, we will set their kernel to the
	// default.
	let userKernel = "";
	if (response.status === 404) {
		log("lifecycle", "user has no established kernel, trying to set the default");
		// Create the data field, which contains the default kernel.
		//
		// TODO: We should probably do a base64 conversion here so that
		// we store the actual raw data and match the protocol for a
		// resolver link.
		userKernel = defaultKernelResolverLink
		let dataFieldStr = defaultKernelResolverLink
		let dataField = new TextEncoder().encode(dataFieldStr);

		// Make a call to write the default kernel to the user's kernel
		// registry entry. The callbacks here are sparse because we
		// don't need to know the result of the write to load the
		// user's kernel.
		writeNewOwnRegistryEntry(
			"v1-skynet-kernel",
			"v1-skynet-kernel-dataKey",
			dataField,
			// Success callback.
			function(response) {
				log("lifecycle", "set the user's kernel to the extension default", response);
			},
			// Failure callback.
			function(err) {
				log("lifecycle", "unable to set the user's kernel", err);
			}
		);
	} else if (response.status === 200) {
		let [data, err] = hex2buf(result.data)
		if (err !== null) {
			log("lifecycle", "portal response could not be parsed", response, err);
			kernelDiscoveryFailed("portal response not recognized when reading user's kernel");
			return;
		}
		let dataStr = new TextDecoder("utf-8").decode(data);
		userKernel = defaultKernelResolverLink;
		log("lifecycle", "found the user's kernel skylink:", dataStr);
	} else {
		log("lifecycle", "portal response not recognized", response);
		kernelDiscoveryFailed("portal response not recognized when reading user's kernel");
		return;
	}

	// Now that we have the kernel, we want to download and load the kernel.
	downloadV1Skylink("https://siasky.net/" + userKernel + "/")
	.then(text => {
		log("lifecycle", "kernel has been downloaded");
		log("fullKernel", text);
		eval(text);
		log("lifecycle", "full kernel loaded and evaluated");
		kernelLoaded = true;

		// Tell the parent that the kernel has finished
		// loading.
		window.parent.postMessage({kernelMethod: "skynetKernelLoaded"}, "*");
	})
	.catch(err => {
		kernelDiscoveryFailed(err);
	});

	// TODO: Replace the above call to downloadV1Skylink with the below
	// call to downloadSkylink. The main thing we need to do is copy-paste
	// the logic in the V1 into the standard download, and then delete the
	// entire downloadV1 function.
	downloadSkylink(userKernel,
	// Resolve callback.
	function() {
		log("lifecycle", "downloadSkylink call resolved");
	},
	// Reject callback.
	function() {
		log("lifecycle", "downloadSkylink call rejected");
	})
}

// kernelDiscoveryFailed defines the callback that is called in
// readRegistryAndLoadKernel after we were unable to read the user's registry
// entry from Skynet. Note that this is different from a 404, it means that we
// could not get a reliable read at all.
//
// If we can't figure out what kernel the user wants to load, we are going to
// abort and send an error message to the parent, because we don't want the UX
// of loading the default kernel for the user if there's a different kernel
// that they are already used to.
//
// TODO: I believe we need to set 'kernelLoading' to false in here somewhere.
var kernelDiscoveryFailed = function(err) {
	log("lifecycle", "unable to determine user's preferred kernel", err);
	// TODO: Need to update the homescreen auth to be able to receive such
	// a message.
	window.parent.postMessage({kernelMethod: "skynetKernelLoadFailed"}, "*");
}

// readRegistryAndLoadKernel is called after the loadSkynetKernel function has
// loaded the user portal preferences. This function is passed to
// loadUserPortalPreferences as the callback. It starts by reading the registry
// entry for the kernel, and then passing in a callback to load the actual
// kernel.
var readRegistryAndLoadKernel = function() {
	readOwnRegistryEntry(
		"v1-skynet-kernel",
		"v1-skynet-kernel-dataKey",
		kernelDiscoveryComplete,
		kernelDiscoveryFailed
	)
}

// loadSkynetKernel handles loading the rest of the skynet-kernel from the user's
// skynet storage. This will include loading all installed modules. A global
// variable is used to ensure that the loading process only happens once.
//
// We have the variables kernelLoaded and kernelLoading to prevent race
// conditions if multiple threads attempt to trigger a kernel load
// simultaneously. kernelLoading is set initially to indicate that we are
// attempting to load the kernel. It may fail, which will cause the value to be
// un-set.
//
// TODO: Need to switch the kernelLoaded and kernelLoading variables to use
// atomics.
var kernelLoaded = false;
var kernelLoading = false;
var loadSkynetKernel = function() {
	log("lifecycle", "attempting to load kernel");

	// Check the loading status of the kernel. If the kernel is loading,
	// block until the loading is complete and then send a message to the
	// caller indicating a successful load.
	//
	// TODO: I'm not sure this flow is correct.
	if (kernelLoaded || kernelLoading) {
		log("lifecycle", "aborting attempted kernel load, another attempt is already in progress");
		return;
	}
	kernelLoading = true;
	log("lifecycle", "kernel has lock on loading process, proceeding");

	// TODO: Check localstorage for the kernel to see if it is already
	// loaded.

	// Load the user's preferred portals from their skynet data. Add a
	// callback which will load the user's preferred kernel from Skynet
	// once the preferred portal has been established.
	loadUserPortalPreferences(readRegistryAndLoadKernel);
}

// handleMessage is called by the message event listener when a new message
// comes in. This function is intended to be overwritten by the kernel that we
// fetch from the user's Skynet account.
var handleMessage = function(event: any) {
	log("lifecycle", "handleMessage is being called with unloaded kernel");
	return;
}

// Establish the event listener for the kernel. There are several default
// requests that are supported, namely everything that the user needs to create
// a seed and log in with an existing seed, because before we have the user
// seed we cannot load the rest of the skynet kernel.
//
// TODO: The way this is written, the whole set of functions below can't
// actually be overwritten by the main kernel. We should probably move these
// items to handleMessage, which would require updating the overwrite that the
// kernel does later on.
window.addEventListener("message", (event: any) => {
	log("message", "message received\n", event.data, "\n", event.origin);

	// Check that the authentication suceeded. If authentication did not
	// suceed, send a postMessage indicating that authentication failed.
	let [userSeed, err] = getUserSeed();
	if (err !== "") {
		log("message", "auth has failed, sending an authFailed message", err);
		window.parent.postMessage({kernelMethod: "authFailed"}, "*");
		return;
	}
	log("message", "user is authenticated");

	// Establish a handler to handle a request which states that
	// authentication has been completed. Because we have already called
	// getUserSeed() earlier in the function, we know that the correct seed
	// exists. We therefore just need to load the rest of the Skynet
	// kernel.
	if (event.data.kernelMethod === "authCompleted") {
		loadSkynetKernel();
		return;
	}

	// Establish a debugging handler that a developer can call to verify
	// that round-trip communication has been correctly programmed between
	// the kernel and the calling application.
	if (event.data.kernelMethod === "requestTest") {
		log("lifecycle", "sending receiveTest message to source");
		log("lifecycle", event.source);
		event.source.postMessage({kernelMethod: "receiveTest"}, "*");
		return;
	}

	// Establish a means for the user to logout. Only logout requests
	// provided by home are allowed.
	if (event.data.kernelMethod === "logOut" && event.origin === "https://home.siasky.net") {
		logOut();
		log("lifecycle", "sending logOutSuccess message to home");
		try {
			event.source.postMessage({kernelMethod: "logOutSuccess"}, "https://home.siasky.net");
		} catch (err) {
			log("lifecycle", "unable to inform source that logOut was competed", err);
		}
		return;
	}

	// handleMessage will be overwritten after the kernel is loaded and can
	// add additional API calls.
	handleMessage(event);
}, false);

// If the user seed is in local storage, we'll load the kernel. If the user seed
// is not in local storage, we'll report that the user needs to perform
// authentication.
let [userSeed, err] = getUserSeed()
if (err !== "") {
	log("lifecycle", "auth failed, sending message");
	window.parent.postMessage({kernelMethod: "authFailed"}, "*");
} else {
	log("lifecycle", "auth succeeded, loading kernel");
	loadSkynetKernel();
}
