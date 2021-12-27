export {};

// TODO: Right now every application that opens an iframe to the kernel is
// going to load a separate instance of the kernel, it may make more sense to
// have the kernel operate entirely from shared workers. Still need to explore
// that.

// TODO: The next step is that we need to actually set up the flow for figuring
// out the user's preferred portal, right? Or do we keep trucking with the v1
// downloads? At some point we need to have the user set up a portal, I guess
// that can happen later?

// TODO: First we get the user's preferred portal, then we get the user's
// preferred kernel. Then instead of loading the default kernel we load the
// user's preferred kernel. If the user doesn't have a preferred kernel, we can
// set the user's preferred kernel. So that's where we can get the first
// writeRegistry item in place.

// Set a title and a message which indicates that the page should only be
// accessed via an invisible iframe.
console.log("progress", "kernel has been opened");
document.title = "kernel.siasky.net"
var header = document.createElement('h1');
header.textContent = "Something went wrong! You should not be visiting this page, this page should only be accessed via an invisible iframe.";
document.body.appendChild(header);

// import:::skynet-kernel-extension/lib/sha512.ts

// import:::skynet-kernel-extension/lib/ed25519.ts

var defaultPortalList = ["siasky.net"];

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
	console.log("progress", "clearing local storage after logging out");
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
//
// TODO: Need to provide error and success callbacks, as this is a generic
// function. Or maybe we just provide response callbacks? Let the caller decide
// how to handle the response? Probably for the better that way.
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
			console.log("error", "pubkey verification failed", err);
			throw 'pubkey verification failed when trying to get the list of portals from the registry';
		}
	} catch(err) {
		console.log("error", "unable to produce signature from keypair", err);
	}

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
	for (let i = 0; i < portalList.length; i++) {
		let portal = portalList[i];
		let pubkeyHex = buf2hex(keyPair.publicKey);
		let dataKeyHex = buf2hex(dataKey);
		let query = "https://" + portal + "/skynet/registry?publickey=ed25519%3A"+pubkeyHex+"&datakey="+dataKeyHex;
		console.log("registryGET", query);
		callback()
		fetch(query)
			.then(response => {
				// TODO: If the status is not 404, we need to
				// parse and verify the entry and then use the
				// contents of that entry to set the
				// localstorage list of portals. This is being
				// postponed for the moment because we don't
				// have any flow to write the user's preferred
				// list of portals.
				console.log("RESPONSE HAS BEEN RECEIVED");
				console.log(response);
				console.log(response.status);
			})
		return
	}

	// Fetch the registry data.
	// 
	// TODO: Design the error handling.
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
			console.log("error", "corrupt portalListStr found in localStorage: "+portalListStr);
		}
	}

	// No list found. Just provide the default portal list.
	return defaultPortalList;
}

// loadUserPortalPreferences will fetch the user's remote portal preferences
// from their portal registry entry and update local storage to reflect the
// user's preferences.
//
// TODO: Switch this to use registry subscriptions.
var loadUserPortalPreferences = function() {
	readOwnRegistryEntry("v1-skynet-portal-list", "v1-skynet-portal-list-dataKey", function() {
		// TODO: Remove this console.log.
		console.log("DEBUG", "callback reached");
	})
	if (err !== null) {
		// TODO: Error handling.
		return;
	}

	// TODO: decode the registry entry and set localstorage entry for the
	// portal list.
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
	console.log("progress", "kernel is loading");

	// Check the loading status of the kernel. If the kernel is loading,
	// block until the loading is complete and then send a message to the
	// caller indicating a successful load.
	//
	// TODO: I'm not sure this flow is correct.
	if (kernelLoaded || kernelLoading) {
		return;
	}
	kernelLoading = true;
	console.log("progress", "kernel loading passed the safety race condition");

	// TODO: Check localstorage (or perhaps an encrypted indexededdb) for
	// the kernel to see if it is already loaded.

	// Load the user's preferred portals from remote.
	loadUserPortalPreferences();

	// TODO: Grab the registry entry that should be holding the location of
	// the user's kernel.

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
			console.log("progress", "full kernel loaded");
			console.log(text);
			eval(text);
			console.log("progress", "full kernel eval'd");
			kernelLoaded = true;
			window.parent.postMessage({kernelMethod: "skynetKernelLoaded"}, "*");
		});
}

// handleMessage is called by the message event listener when a new message
// comes in. This function is intended to be overwritten by the kernel that we
// fetch from the user's Skynet account.
//
// TODO: This doesn't have to be 'any' I just don't know what type to put here.
var handleMessage = function(event: any) {
	console.log("progress", "Skynet Kernel: handleMessage is being called with unloaded kernel");
	return;
}

// Establish the event listener for the kernel. There are several default
// requests that are supported, namely everything that the user needs to create
// a seed and log in with an existing seed, because before we have the user
// seed we cannot load the rest of the skynet kernel.
//
// TODO: This doesn't have to be 'any' I just don't know what type to put here.
window.addEventListener("message", (event: any) => {
	// Log every incoming message to help app developers debug their
	// applications.
	//
	// TODO: Switch this to only logging when debug mode is set.
	console.log("Skynet Kernel: message received");
	console.log(event.data);
	console.log(event.origin);

	// Check that the authentication suceeded. If authentication did not
	// suceed, send a postMessage indicating that authentication failed.
	let [userSeed, err] = getUserSeed();
	if (err !== "") {
		console.log("progress", "auth has failed, sending an authFailed message", err);
		window.parent.postMessage({kernelMethod: "authFailed"}, "*");
		return;
	}
	console.log("progress", "user is authenticated");

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
		console.log("progress", "sending receiveTest message to source");
		console.log("progress", event.source);
		event.source.postMessage({kernelMethod: "receiveTest"}, "*");
		return;
	}

	// Establish a means for the user to logout. Only logout requests
	// provided by home are allowed.
	if (event.data.kernelMethod === "logOut" && event.origin === "https://home.siasky.net") {
		logOut();
		console.log("progress", "sending logOutSuccess message to home");
		try {
			event.source.postMessage({kernelMethod: "logOutSuccess"}, "https://home.siasky.net");
		} catch (err) {
			console.log("ERROR:", err);
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
	console.log("progress", "auth failed, sending message");
	window.parent.postMessage({kernelMethod: "authFailed"}, "*");
} else {
	console.log("progress", "auth succeeded, loading kernel");
	loadSkynetKernel();
}
