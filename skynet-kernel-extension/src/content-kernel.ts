export {};

// TODO: Right now every application that opens an iframe to the kernel is
// going to load a separate instance of the kernel, it may make more sense to
// have the kernel operate entirely from shared workers. Still need to explore
// that.

// TODO: Visual inspection of the user seed suggests that it low entropy, there
// seems to be an encoding issue.

// TODO: I don't think we are verifying all of the untrusted inputs we are
// receiving.

// TODO: Need to switch the entire protocol over to using encryption.

// TODO: Need to update the progressive fetch flow so that we can figure out
// which portal is lying if it is discovered that a portal is lying. And within
// the kernel we'll need to establish some system for tracking the reliability
// of various portals over various endpoints, so we know whether or not to use
// them.

// TODO: There are places here where we could transition our types to used
// fixed length arrays, which would eliminate some of the length checking that
// we have to do in some of our functions.

// TODO: We can make more liberal use in general of the typing system in
// typescript to get more robust code, especially around error handling.

// TODO: Looks like the login flow is broken.

// Set a title and a message which indicates that the page should only be
// accessed via an invisible iframe.
document.title = "kernel.siasky.net"
var header = document.createElement('h1');
header.textContent = "Something went wrong! You should not be visiting this page, this page should only be accessed via an invisible iframe.";
document.body.appendChild(header);

// NOTE: The imports need to happen in a specific order, as many of them depend
// on prior imports. There's no dependency resolution in the bundle script, so
// the ordering must be handled manually.

// import:::skynet-kernel-extension/lib/parsejson.ts

// import:::skynet-kernel-extension/lib/err.ts

// import:::skynet-kernel-extension/lib/log.ts

// import:::skynet-kernel-extension/lib/sha512.ts

// import:::skynet-kernel-extension/lib/ed25519.ts

// import:::skynet-kernel-extension/lib/blake2b.ts

// import:::skynet-kernel-extension/lib/encoding.ts

// import:::skynet-kernel-extension/lib/preferredportals.ts

// import:::skynet-kernel-extension/lib/progressivefetch.ts

// import:::skynet-kernel-extension/lib/registry.ts

// import:::skynet-kernel-extension/lib/download.ts

// TODO: The transplant contains the V2 skylink of the full kernel that we have
// developed in the other folder. This link should actually not be a
// transplant, it should be hardcoded! During this early phase of development -
// before the core kernel and the bootloader have been split into separate
// repos - we are keeping the transplant to make development easier.

// transplant:::skynet-kernel-skyfiles/skynet-kernel.js

log("lifecycle", "kernel has loaded");

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
var getUserSeed = function(): [Uint8Array, Error] {
	// Pull the string version of the seed from localstorage.
	let userSeedString = window.localStorage.getItem("v1-seed");
	if (userSeedString === null) {
		return [null, new Error("no user seed in local storage")];
	}

	// Parse the string into a Uint8Array and return the result.
	let userSeed = Uint8Array.from([...userSeedString].map(ch => ch.charCodeAt(0)))
	return [userSeed, null];
}

// logOut will erase the localStorage, which means the seed will no longer be
// available, and any sensistive data that the kernel placed in localStorage
// will also be cleared.
var logOut = function() {
	log("lifecycle", "clearing local storage after logging out");
	localStorage.clear();
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
		// TODO: Need to parse the data and correctly set the user's
		// portal list. Actually setting the user's portal preferences
		// list should be done by the full kernel, so this won't be
		// able to be updated until we have a full kernel.
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
	// Try to get the list of portals from localstorage. If the list
	// already exists, we don't need to fetch the list.
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
	readOwnRegistryEntry("v1-skynet-portal-list", "v1-skynet-portal-list-datakey")
	.then(output => {
		loadUserPortalPreferencesRegReadSuccess(output);
		callback();
	})
	.catch(output => {
		log("lifecycle", "unable to load the users list of preferred portals", err);
		callback();
	});
}

// processKernelDownload handles the result of attempting to download the
// kernel stored at the user's seed. This is a 'success' response, meaning that
// the network query succeeded without any malice from the portals. That is
// still not the same as the download completing, the result of the query may
// have been a 404, for example.
var processKernelDownload = function(output) {
	// Create helper variables around the output.
	let err = output.err;
	let response = output.response;
	let result = output.result;

	// Check the error.
	if (err !== "none") {
		kernelDiscoveryFailed("unable to download the user kernel: " + err);
		return;
	}

	// Handle the success case.
	if (response.status === 200) {
		log("lifecycle", "user kernel was successfully downloaded");
		eval(output.result);
		log("lifecycle", "user kernel loaded and eval'd");
		kernelLoaded = true;

		// Tell the parent that the kernel has finished
		// loading.
		window.parent.postMessage({kernelMethod: "skynetKernelLoaded"}, "*");
		return;
	}

	// Handle the 404 case.
	if (response.status === 404) {
		log("lifecycle", "user has no established kernel, trying to set the default");
		// Create the data field, which contains the default kernel.
		let [defaultKernelSkylink, err64] = b64ToBuf(defaultKernelResolverLink)
		if (err64 !== null) {
			log("lifecycle", "could not convert defaultKernelSkylink to a uin8array");
			return;
		}

		// Make a call to write the default kernel to the user's kernel
		// registry entry. The callbacks here are sparse because we
		// don't need to know the result of the write to load the
		// user's kernel.
		writeNewOwnRegistryEntry("v1-skynet-kernel", "v1-skynet-kernel-datakey", defaultKernelSkylink)
		.then(response => {
			log("lifecycle", "succesfully set the user's kernel to the default kernel");
		})
		.catch(err => {
			log("lifecycle", "unable to set the user's kernel\n", err)
		})

		// Need to download and eval the default kernel.
		fetchAndEvalDefaultKernel();
		return;
	}

	// Handle everything else.
	log("lifecycle", "portal response not recognized", response);
	kernelDiscoveryFailed("portal response not recognized when reading user's kernel");
	return;
}

// fetchAndEvalDefaultKernel will download the default kernel and load it for
// the user, this should only happen if the user doesn't already have a default
// kernel set.
var fetchAndEvalDefaultKernel = function() {
	downloadSkylink(defaultKernelResolverLink,
	// Success callback.
	function(output) {
		// Create helper variables around the output.
		let err = output.err;
		let response = output.response;
		let result = output.result;
		// Check the error.
		if (err !== "none") {
			kernelDiscoveryFailed("unable to download the user kernel: " + err);
			return;
		}

		// Handle the success case.
		if (response.status === 200) {
			log("lifecycle", "default kernel was successfully downloaded");
			eval(output.result);
			log("lifecycle", "default kernel loaded and eval'd");
			kernelLoaded = true;

			// Tell the parent that the kernel has finished
			// loading.
			window.parent.postMessage({kernelMethod: "skynetKernelLoaded"}, "*");
			return;
		}

		// Handle everything else.
		log("lifecycle", "portal response not recognized", response);
		kernelDiscoveryFailed("portal response not recognized when reading user's kernel");
		return;
	},
	// Reject callback.
	function(err) {
		kernelDiscoveryFailed(err);
	});
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
var fetchAndEvalKernel = function() {
	// Determine the resolver link for the user's kernel.
	let [keyPair, datakey, err] = ownRegistryEntryKeys("v1-skynet-kernel", "v1-skynet-kernel-datakey");
	if (err !== null) {
		kernelDiscoveryFailed("unable to get user's registry entry keys");
		return;
	}
	let [entryID, errID] = deriveRegistryEntryID(keyPair.publicKey, datakey)
	if (errID !== null) {
		kernelDiscoveryFailed("unable to determine entryID of user's kernel registry entry: " + errID);
		return;
	}
	// Build the v2 skylink from the entryID.
	let v2Skylink = new Uint8Array(34);
	v2Skylink.set(entryID, 2);
	v2Skylink[0] = 1;

	// Convert the v2Skylink to base64 for the download call.
	let skylink = bufToB64(v2Skylink);
	downloadSkylink(skylink, processKernelDownload, kernelDiscoveryFailed);
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
	loadUserPortalPreferences(fetchAndEvalKernel);
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
	if (err !== null) {
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

// TODO: Remove this function. Currently we cannot remove it because the kernel
// itself uses the function to download and serve the user's homescreen. Once
// the kernel is cleaned up to use the secure functions, we can remove this.
var downloadV1Skylink = function(skylink: string) {
	return fetch(skylink).then(response => response.text())
}

// If the user seed is in local storage, we'll load the kernel. If the user seed
// is not in local storage, we'll report that the user needs to perform
// authentication.
let [userSeed, err] = getUserSeed()
if (err !== null) {
	log("lifecycle", "auth failed, sending message");
	window.parent.postMessage({kernelMethod: "authFailed"}, "*");
} else {
	log("lifecycle", "auth succeeded, loading kernel");
	loadSkynetKernel();
}
