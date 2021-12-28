export {};

// TODO: Right now every application that opens an iframe to the kernel is
// going to load a separate instance of the kernel, it may make more sense to
// have the kernel operate entirely from shared workers. Still need to explore
// that.

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

// import:::skynet-kernel-extension/lib/sha512.ts

// import:::skynet-kernel-extension/lib/ed25519.ts

var defaultPortalList = ["siasky.net"];

// transplant:::skynet-kernel-skyfiles/skynet-kernel.js

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

var buf2hex = function(buffer: ArrayBuffer) { // buffer is an ArrayBuffer
	return [...new Uint8Array(buffer)]
		.map(x => x.toString(16).padStart(2, '0'))
		.join('');
}

// readOwnRegistryEntry will read and verify a registry entry that is owned by
// the user. The tag strings will be hashed with the user's seed to produce the
// correct entropy.
// 
// TODO: This function currently protects the user from a portal providing
// incorrect data, but does not protect the user from a portal providing
// outdated data or a false 404. Getting protection against those would require
// receiving a list of signatures from a set of hosts (likely established TOFU
// style through previous successful lookups) to verify that multiple trusted
// hosts as well as the portal are reporting the same result.
var readOwnRegistryEntry = function(keyPairTagStr: string, dataKeyTagStr: string, callback: any) {
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

	// Get a list of portals, then try fetching the entry from each portal
	// until a successful response is received. A 404 is considered a
	// successful response.
	// 
	// TODO: Need to check whether we need to add the 'hashedDataKeyHex'
	// param to our query strings. The docs say the default is 'false'
	// (meaning the portal will hash it for us), but I think the default is
	// actually 'true' (meaning the portal assumes it is already hashed).
	// The example doesn't use it and provides an already hashed datakey.
	// 
	// TODO: The actual way that we iterate through the portals is going to
	// be complicated. Not likely to be a for loop.
	let portalList = preferredPortals();
	let pubkeyHex = buf2hex(keyPair.publicKey);
	let dataKeyHex = buf2hex(dataKey);
	let endpoint = "/skynet/registry?publickey=ed25519%3A"+pubkeyHex+"&datakey="+dataKeyHex;
	progressiveFetch(endpoint, portalList, callback);
}

// progressiveFetch will query multiple portals until one returns with the
// correct response. If there is a success, it will call the success callback.
// If all of the portals fail, it will call the failure callback.
var progressiveFetch = function(endpoint: string, portals: string[], callback: any) {
	if (portals.length === 0) {
		// TODO: Error handling, the request did not succeed and we
		// need to handle that somehow.
		return;
	}

	// Try the next portal in the array.
	let portal = portals.shift();
	let query = "https://" + portal + endpoint;
	fetch(query)
	.then(response => {
		// Success! Handle the response.
		callback(response)
	})
	.catch((error) => {
		// No luck, repeat but with the next portal.
		log("portal", error);
		progressiveFetch(endpoint, portals, callback)
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

// preferredPortals will determine the user's preferred portals by looking in
// localstorage. If no portals are listed in localstorage, derivePortal will
// access the Sia registry using a portal list hardcoded by the extension. This
// should be the only time that the user needs to make a request that is not
// going directly to their preferred portals.
// 
// TODO: To prevent an infinite loop, we need to split the init function off
// from the core read function. Or maybe the core read function can return...
// something that will prevent a circular lookup on the registry lookup? This
// has to return without a network lookup but maybe it can kick off a network
// lookup? That might cause some spinning still anyway.
//
// I think that the best solution here is to have a separate init function
// which works in the background to fetch the portal list.
var preferredPortals = function(): string[] {
	// Try to get the list of portals from localstorage.
	let portalListStr = window.localStorage.getItem("v1-portalList");
	if (portalListStr !== null) {
		try {
			// TODO: In the main kernel (though perhaps not the browser
			// extension), we should run a background process that checks
			// whether the user's list of portals has been updated.
			//
			// TODO: Within the extension, we should probably append the set of
			// default portals to the user's list of portals so that in the
			// event that all of the user's portals are offline, the user is
			// still able to connect to Skynet.
			let portalList = JSON.parse(portalListStr);
			for (let i = 0; i < defaultPortalList.length; i++) {
				portalList.basicPortals.push(defaultPortalList[i]);
			}
			return portalList.basicPortals;
		} catch {
			// TODO: We should probably clear the entry so that the user can make progress.
			log("error", "corrupt portalListStr found in localStorage: "+portalListStr);
		}
	}

	// No list found. Just provide the default portal list.
	return defaultPortalList;
}

// loadUserPortalPreferences will fetch the user's remote portal preferences
// from their portal registry entry and update local storage to reflect the
// user's preferences. If the localstorage is already set containing a set of
// preferences, no network operations are performed, we will allow the full
// kernel to decide when and how to update the user's local portal settings.
//
// The callback will run once the user's preferences have been loaded.
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
	readOwnRegistryEntry("v1-skynet-portal-list", "v1-skynet-portal-list-dataKey", function(response) {
		log("loadUserPortalPreferences", "callback reached");
		log("loadUserPortalPreferences", response);
		if (response.status === 404) {
			window.localStorage.setItem("v1-portalList", JSON.stringify(defaultPortalList));
			log("loadUserPortalPreferences", "user portalList set to the default list after getting 404 on registry lookup");
		} else {
			// TODO: Need to parse the data and correctly set the
			// user's portal list.
		}
		callback();
	})
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

	// Load the user's preferred portals from remote.
	// 
	// TODO: Wrap this in a promise, then from that promise we fetch the
	// user's kernel location, then from there we load the user's kernel.
	// When we do the download we need to verify the proofs coming in.
	// Right? We shouldn't be fetching the user's kernel from siasky.net
	// should we? Or should we? I guess the worst that can happen is that
	// it loads slow the first time, but we do need to ensure that it will
	// load quickly on subsequent initializations.
	//
	// I guess that means we need to figure out the flow for determining
	// whether to just go with the settings that are local or deciding to
	// try to see if there's an update on the network. This is just
	// initialization, I don't think the extension needs to worry about
	// doing updates, that can be handled by the full kernel, which can
	// also overwrite the localstorage for future initializations.
	//
	// TODO: Sneak the download into here as a callback? Or is there some
	// way we can .then it here rather than going into callback hell.
	loadUserPortalPreferences(function() {
		// Load the rest of the script from Skynet.
		//
		// TODO: Instead of loading a hardcoded skylink, fetch the data from
		// the user's Skynet account. If there is no data in the user's Skynet
		// account, fall back to a hardcoded default. The default can save a
		// round trip by being the full javascript instead of being a v1
		// skylink.
		//
		// TODO: If there is some sort of error, need to set kernelLoading to
		// false and then send a 'authFailed' message or some other sort of
		// error notification.
		downloadV1Skylink("https://siasky.net/branch-file:::skynet-kernel-skyfiles/skynet-kernel.js/")
		.then(text => {
			log("lifecycle", "full kernel loaded");
			log("fullKernel", text);
			eval(text);
			log("lifecycle", "full kernel eval'd");
			kernelLoaded = true;
			window.parent.postMessage({kernelMethod: "skynetKernelLoaded"}, "*");
		});
	});
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
window.addEventListener("message", (event: any) => {
	log("message", "message received");
	log("message", event.data);
	log("message", event.origin);

	// Check that the authentication suceeded. If authentication did not
	// suceed, send a postMessage indicating that authentication failed.
	let [userSeed, err] = getUserSeed();
	if (err !== "") {
		log("message", "auth has failed, sending an authFailed message", err);
		window.parent.postMessage({kernelMethod: "authFailed"}, "*");
		return;
	}
	log("lifecycle", "user is authenticated");

	// Establish a handler to handle a request which states that
	// authentication has been completed. Because we have already called
	// hasUserSeed() earlier in the function, we know that the correct seed
	// exists. We therefore just need to load the rest of the Skynet kernel.
	// 
	// TODO: Need to check the origin here.
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
