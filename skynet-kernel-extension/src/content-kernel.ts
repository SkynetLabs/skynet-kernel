export {};

// Set a title and a message which indicates that the page should only be
// accessed via an invisible iframe.
document.title = "kernel.siasky.net"
var header = document.createElement('h1');
header.textContent = "Something went wrong! You should not be visiting this page, this page should only be accessed via an invisible iframe.";
document.body.appendChild(header);

// NOTE: These imports are order-sensitive.

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

// import:::skynet-kernel-extension/lib/handlemessage.ts

// TODO: The transplant contains the V2 skylink of the full kernel that we have
// developed in the other folder. This link should actually not be a
// transplant, it should be hardcoded! During this early phase of development -
// before the core kernel and the bootloader have been split into separate
// repos - we are keeping the transplant to make development easier.

// transplant:::skynet-kernel-skyfiles/skynet-kernel.js

log("lifecycle", "kernel has loaded");

var defaultPortalList = ["siasky.net", "eu-ger-12.siasky.net"];

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

// downloadDefaultKernel will download the default kernel.
var downloadDefaultKernel = function(): Promise<string> {
	return new Promise((resolve, reject) => {
		downloadSkylink(defaultKernelResolverLink)
		.then(output => {
			// Handle the success case.
			if (output.response.status === 200) {
				resolve(output.text);
				return;
			}

			// Handle every other response status.
			log("lifecycle", "portal response not recognized", output.response);
			reject("response not recognized when reading default kernel");
			return;
		})
		.catch(err => {
			reject(addContextToErr(err, "unable to download default portal"));
		});
	})
}

// processUserKernelDownload handles the result of attempting to download the
// kernel stored at the user's seed. This is a 'success' response, meaning that
// the network query succeeded without any malice from the portals. That is
// still not the same as the download completing, the result of the query may
// have been a 404, for example.
var processUserKernelDownload = function(output: downloadSkylinkResult): Promise<string> {
	return new Promise((resolve, reject) => {
		// Handle the success case.
		let response = output.response;
		if (response.status === 200) {
			resolve(output.text);
			return;
		}

		// Handle the 404 case, which invovles writing the default
		// kernel to the user's kernel registry entry and then
		// downloading the default kernel and returning it. We write
		// the default kernel as the user's kernel because we want the
		// user to have a consistent experience between browsers. If
		// the first kernel they ever used was of a particular
		// distribution, we want the next time they log in (even if on
		// a different device with a different extension) to use the
		// same kernel.
		if (response.status === 404) {
			log("lifecycle", "user has no established kernel, trying to set the default");

			// Perform the registry write.
			let [defaultKernelSkylink, err64] = b64ToBuf(defaultKernelResolverLink)
			if (err64 !== null) {
				log("lifecycle", "could not convert defaultKernelSkylink to a uin8array");
				reject(addContextToErr(err64, "could not convert defaultKernelSkylink"));
				return;
			}
			writeNewOwnRegistryEntry("v1-skynet-kernel", "v1-skynet-kernel-datakey", defaultKernelSkylink)
			.then(response => {
				log("lifecycle", "succesfully set the user's kernel to the default kernel");
			})
			.catch(err => {
				log("lifecycle", "unable to set the user's kernel\n", err)
			})

			// Need to download and eval the default kernel.
			// fetchAndEvalDefaultKernel();
			downloadDefaultKernel()
			.then(text => {
				resolve(text)
			})
			.catch(err => {
				reject(addContextToErr(err, "unable to download default kernel"))
			})
			return;
		}

		// Handle every other response status.
		log("lifecycle", "response not recognized when reading user kernel\n", response);
		reject("response not recognized when reading user's kernel");
		return;
	})
}

// downloadUserKernel will download the user's kernel, falling back to the
// default if necessary.
var downloadUserKernel = function(): Promise<string> {
	return new Promise((resolve, reject) => {
		// Get the resolver link for the user's kernel.
		let [skylink, errDRL] = deriveResolverLink("v1-skynet-kernel", "v1-skynet-kernel-datakey")
		if (errDRL !== null) {
			reject(addContextToErr(errDRL, "unable to get resovler link for user's portal prefs"))
			return
		}

		// Attempt the download.
		downloadSkylink(skylink)
		.then(output => {
			processUserKernelDownload(output)
			.then(kernel => resolve(kernel))
			.catch(err => {
				reject(addContextToErr(err, "unable to download kernel for the user"))
			})
		})
		.catch(err => {
			reject(addContextToErr(err, "unable to download user's kernel"));
		})
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
//
// TODO: I believe we need to set 'kernelLoading' to false in here somewhere.
var kernelDiscoveryFailed = function(err) {
	err = addContextToErr(err, "unable to load the user's kernel")
	log("lifecycle", err)
	// TODO: Need to update the homescreen auth to be able to receive such
	// a message.
	window.parent.postMessage({
		kernelMethod: "skynetKernelLoadFailed",
		err: err,
	}, "*");
}

// evalKernel will call 'eval' on the provided kernel code.
var evalKernel = function(kernel: string) {
	log("lifecycle", "user kernel was successfully downloaded");
	eval(kernel);
	log("lifecycle", "user kernel loaded and eval'd");
	kernelLoaded = true;
	window.parent.postMessage({kernelMethod: "skynetKernelLoaded"}, "*");
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
	initUserPortalPreferences()
	.then(nil => {
		return downloadUserKernel()
	})
	.then(kernel => {
		evalKernel(kernel)
	})
	.catch(err => {
		kernelDiscoveryFailed(err);
	});
}

// Establish the event listener for the kernel. There are several default
// requests that are supported, namely everything that the user needs to create
// a seed and log in with an existing seed, because before we have the user
// seed we cannot load the rest of the skynet kernel.
window.addEventListener("message", (event: any) => {
	// handleMessage will be overwritten after the kernel is loaded to add
	// additional API calls.
	handleMessage(event)
}, false)

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
