export {};

// TODO: Right now every application that opens an iframe to the kernel is
// going to load a separate instance of the kernel, it may make more sense to
// have the kernel operate entirely from shared workers. Still need to explore
// that.

// TODO: This whole file is lax on input checking, we probably need to wire
// some error handling throughout to make sure that all foreign inputs are
// being checked for malicious values.

// Below is some code that might be useful later.
/*
	// Try signing and verifying some data using the keyPair.
	//
	// TODO: This only needs to be here for as long as we aren't doing the
	// full registry fetch and verify.
	let message = new TextEncoder().encode("this is a test message to sign");
	let message8 = new Uint8Array(message.length);
	message8.set(message);
	try {
		let sig = sign(message8, keyPair.secretKey);
		let result = verify(message8, sig, keyPair.publicKey);
		if (!result) {
			log("error", "pubkey verification failed", err);
			throw 'pubkey verification failed when trying to get the list of portals from the registry';
		}
	} catch(err) {
		log("error", "unable to produce signature from keypair", err);
	}
*/

// Set a title and a message which indicates that the page should only be
// accessed via an invisible iframe.
document.title = "kernel.siasky.net"
var header = document.createElement('h1');
header.textContent = "Something went wrong! You should not be visiting this page, this page should only be accessed via an invisible iframe.";
document.body.appendChild(header);

// log provides syntactic sugar for the logging functions. The first arugment
// passed into 'log' checks whether the logSettings have explicitly disabled
// that type of logging. The remaining args will be printed as they would if
// 'console.log' was called directly.
// 
// This is a minimal logging function that we expect will be overwritten by the
// kernel.
//
// TODO: Need to create an API for changing the logging settings in the kernel.
// API should be built from the kernel proper though no reason to have it in
// the browser extension. We only put it in the browser extension in the first
// place because so many of the lifecycle messages are important.
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

	// Run through all the conditions that would result in the log not
	// being printed. If the log is null, the log will be printed. The only
	// two cases where the log will not be printed is if there is an
	// explicit disable on all logs, or if there is an explicit disable on
	// this particular log type.
	if (logSettingsStr !== null) {
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
	}

	// Print the log.
	let args = Array.prototype.slice.call(arguments);
	args[0] = `[${logType}] Kernel: `;
	console.log.apply(console, args);
	return;
};

log("lifecycle", "kernel has been opened");

// NOTE: The imports need to happen in a specific order. In particular, ed25519
// depends on sha512, so the sha512 import should be listed first.

// import:::skynet-kernel-extension/lib/sha512.ts

// import:::skynet-kernel-extension/lib/ed25519.ts

// import:::skynet-kernel-extension/lib/blake2b.ts

var defaultPortalList = ["siasky.net"];

// transplant:::skynet-kernel-skyfiles/skynet-kernel.js

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
var buf2hex = function(buffer: ArrayBuffer) { // buffer is an ArrayBuffer
	return [...new Uint8Array(buffer)]
		.map(x => x.toString(16).padStart(2, '0'))
		.join('');
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
// TODO: Could we do better by refactoring this to use encodeBigintAsUint64?
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
// localstorage. If no local list of portals is found, the hardcoded d
var preferredPortals = function(): string[] {
	// Try to get the list of portals from localstorage.
	let portalListStr = window.localStorage.getItem("v1-portalList");
	if (portalListStr !== null) {
		try {
			// TODO: In the main kernel (though perhaps not the browser
			// extension), we should run a background process that checks
			// whether the user's list of portals has been updated.
			let portalList = JSON.parse(portalListStr);

			// Append the list of default portals to the set of
			// portals. In the event that all of the user's portals
			// are bad, they will still be able to connect to
			// Skynet. Because the portals are trust minimized,
			// there shouldn't be an issue with potentially
			// connecting to portals that the user hasn't strictly
			// authorized.
			for (let i = 0; i < defaultPortalList.length; i++) {
				// Check for duplicates between the default
				// list and the user's list. This deduplication
				// is relevant for performance, because lookups
				// will sequentially check every portal until a
				// working portal is found. If there are broken
				// portals duplicated in the final list, it
				// will take longer to get through the list.
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
			// We log an error but we don't change anything because
			// the data may have been placed there by a future
			// version of the kernel and we don't want to clear
			// anything that might be relevant or useful once the
			// full kernel has finished loading.
			log("error", err, portalListStr);
		}
	}

	// No list found. Just provide the default portal list.
	return defaultPortalList;
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
	// 
	// TODO: Need to check whether we need to add the 'hashedDataKeyHex'
	// param to our query strings. The docs say the default is 'false'
	// (meaning the portal will hash it for us), but I think the default is
	// actually 'true' (meaning the portal assumes it is already hashed).
	// The example doesn't use it and provides an already hashed datakey.
	let portalList = preferredPortals();
	let endpoint = "/skynet/registry?publickey=ed25519%3A"+pubkeyHex+"&datakey="+dataKeyHex;

	// The adjustedResolveCallback allows us to verify the integrity of the
	// portal's response before passing it back to the caller. If the
	// portal's response is found to be malicious or otherwise
	// untrustworthy, we will redo the progressiveFetch with the remaining
	// portal list.
	let adjustedResolveCallback = function(response, remainingPortalList) {
		// TODO: Add basic verification. We will do this after we make
		// the first call that will allow us to make a registry query
		// which actually resolves (which will be loading the kernel).
		//
		// TODO: We should add some level of host-response
		// verification, if the portal is telling us that there's a
		// 404, it should include some hosts that are reporting the 404
		// so we aren't just blindly accepting the 404. If the portal
		// presents a certain revision number as the latest revision
		// number, it should include some hosts that agree with the
		// portal. This level of verification makes a lot more sense
		// once we add the skylink hinting to the skylink types,
		// because then we will have some way of knowing which hosts we
		// should be expected responses from.
		resolveCallback(response);
	}
	progressiveFetch(endpoint, portalList, adjustedResolveCallback, rejectCallback);
}

// writeNewOwnRegistryEntry will write the provided data to a new registry
// entry. A revision number of 0 will be used, because this function is
// assuming that no data yet exists at that registry entry location.
var writeNewOwnRegistryEntry = function(keyPairTagStr: string, dataKeyTagStr: string, data: Uint8Array, resolveCallback: any, rejectCallback: any) {
	// Fetch the keys.
	let [keyPair, dataKey] = ownRegistryEntryKeys(keyPairTagStr, dataKeyTagStr);
	let pubkeyHex = buf2hex(keyPair.publicKey);
	let dataKeyHex = buf2hex(dataKey);

	// Create the data field, which contains the default kernel.
	//
	// TODO: We should probably do a base64 conversion here so that we
	// store the actual raw data.
	let dataFieldStr = defaultKernelResolverLink
	let dataField = Uint8Array.from(Array.from(dataFieldStr).map(letter => letter.charCodeAt(0)));

	// Compute the signature of the new registry entry.
	let encodedData = encodePrefixedBytes(data);
	let encodedRevision = encodeNumber(0);
	let dataToSign = new Uint8Array(32 + 8 + data.length + 8);
	dataToSign.set(dataKey, 0);
	dataToSign.set(encodedData, 32);
	dataToSign.set(encodedRevision, 32+8+data.length);
	let sigHash = blake2b(dataToSign, 32);
	let sig = sign(sigHash, keyPair.secretKey);

	// Compose the registry entry.
	//
	// TODO: I'm not sure that the type is correct. I'm also not sure that
	// this is all going to encode properly in json. But typing and
	// encoding aside, this should be roughly what we need.
	/*
	let entry = {
		publickey: {
			algorithm: "ed25519",
			key: keyPair.publicKey,
		}
		dataKey: dataKeyHex,
		revision: 0,
		data: dataField,
		signature: sig,
	}
       */

	// Compose the query.
	//
	// TODO: Turn this into a POST query.
	let portalList = preferredPortals();
	let endpoint = "/skynet/registry?publickey=ed25519%3A"+pubkeyHex+"&datakey="+dataKeyHex;
}

// progressiveFetch will query multiple portals until one returns with the
// correct response. If there is a success, it will call the success callback.
// If all of the portals fail, it will call the failure callback.
var progressiveFetch = function(endpoint: string, portals: string[], resolveCallback: any, rejectCallback: any) {
	if (portals.length === 0) {
		log("lifecycle", "no more portals available, rejecting");
		rejectCallback("no portals available");
		return;
	}

	// Try the next portal in the array.
	let portal = portals.shift();
	let query = "https://" + portal + endpoint;
	fetch(query)
	.then(response => {
		// Success! Handle the response.
		resolveCallback(response, portals);
	})
	.catch((error) => {
		// Try the next portal.
		log("portal", query, "::", error);
		progressiveFetch(endpoint, portals, resolveCallback, rejectCallback)
	})
}

// downloadV1Skylink will download the raw data for a skylink and then verify
// that the downloaded content matches the hash of the skylink.
// 
// TODO: Figure out how to use the user's preferred portal at this point
// instead of using siasky. We probably do that by checking localstorage. If
// there is no list of portals specified, default to siasky.
//
// TODO: I have no idea how to get this to return an error, but it needs to
// return an error if validation fails.
var downloadV1Skylink = function(skylink: string) {
	// TODO: Verify that the input is a valid V1 skylink.

	// TODO: Actually verify the download.

	return fetch(skylink).then(response => response.text())
}

// loadUserPortalPreferencesRegReadSuccess is the callback that will be
// performed by loadUserPortalPreferences after a successful call to the
// registry entry that holds all of the user's preferred portals.
var loadUserPortalPreferencesRegReadSuccess = function(response) {
	// In the event of a 404, we want to store the default list as the set
	// of user's portals. We do this so that subsequent kernel iframes that
	// the user opens don't need to go to the network as part of the
	// startup process. The full kernel will set the localStorage item to
	// another value when the user selects portals.
	if (response.status === 404) {
		window.localStorage.setItem("v1-portalList", JSON.stringify(defaultPortalList));
		log("lifecycle", "user portalList set to the default list after getting 404 on registry lookup");
	} else {
		// TODO: Need to parse the data and correctly set the
		// user's portal list.
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
		function(response) {
			loadUserPortalPreferencesRegReadSuccess(response);
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
var kernelDiscoveryComplete = function(response) {
	let userKernel = "";
	if (response.status === 404) {
		log("lifecycle", "user has no established kernel, trying to set the default");
		// TODO: This is where we need to do our first registry write.
		// We have to write the hardcoded default kernel in as the
		// user's kernel.
	} else {
		// TODO: We won't be able to build this branch out until we
		// have set the default kernel for the user. But then we just
		// read it an load it.
	}

	// TODO: By this point 'userKernel' should be set, we want to download
	// and verify that kernel.  Load the kernel itself from Skynet.
	//
	// TODO: If there is some sort of error, need to set kernelLoading to
	// false and then report an error to the parent.
	downloadV1Skylink("https://siasky.net/branch-file:::skynet-kernel-skyfiles/skynet-kernel.js/")
	.then(text => {
		log("lifecycle", "full kernel loaded");
		log("fullKernel", text);
		eval(text);
		log("lifecycle", "full kernel eval'd");
		kernelLoaded = true;

		// Tell the parent that the kernel has finished
		// loading.
		window.parent.postMessage({kernelMethod: "skynetKernelLoaded"}, "*");
	});
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
var kernelDiscoveryFailed = function(err) {
	log("lifecycle", "unable to determine user's preferred kernel");
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
	log("lifecycle", "kernel is loading");

	// Check the loading status of the kernel. If the kernel is loading,
	// block until the loading is complete and then send a message to the
	// caller indicating a successful load.
	//
	// TODO: I'm not sure this flow is correct.
	if (kernelLoaded || kernelLoading) {
		return;
	}
	kernelLoading = true;
	log("lifecycle", "kernel loading passed the safety race condition");

	// TODO: Check localstorage (or perhaps an encrypted indexededdb) for
	// the kernel to see if it is already loaded.

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
