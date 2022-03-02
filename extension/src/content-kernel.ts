export {};

// TODO: Need to redo the logging system.

// Set a title and a message which indicates that the page should only be
// accessed via an invisible iframe.
document.title = "kernel.siasky.net"
var header = document.createElement('h1');
header.textContent = "Something went wrong! You should not be visiting this page, this page should only be accessed via an invisible iframe.";
document.body.appendChild(header);

// NOTE: These imports are order-sensitive.

// import:::extension/lib/parsejson.ts
// import:::extension/lib/err.ts
// import:::extension/lib/log.ts
// import:::extension/lib/sha512.ts
// import:::extension/lib/ed25519.ts
// import:::extension/lib/blake2b.ts
// import:::extension/lib/merkle.ts
// import:::extension/lib/encoding.ts
// import:::extension/lib/preferredportals.ts
// import:::extension/lib/progressivefetch.ts
// import:::extension/lib/registry.ts
// import:::extension/lib/download.ts

// transplant:::kernel/kernel.js

// log is a wrapper to call sourceLog that ensures every log is prefixed with
// 'Kernel'.
var log = function(logType: string, ...inputs: any) {
	sourceLog("Kernel", logType, ...inputs)
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

// downloadDefaultKernel will download the default kernel.
var downloadDefaultKernel = function(): Promise<string> {
	return new Promise((resolve, reject) => {
		downloadSkylink(defaultKernelResolverLink)
		.then(output => {
			// Handle the success case.
			if (output.response.status === 200) {
				let [text, errBTS] = bufToStr(output.fileData)
				if (errBTS !== null) {
					reject(addContextToErr(errBTS, "kernel data is invalid"))
					return
				}
				resolve(text);
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
			let [text, errBTS] = bufToStr(output.fileData)
			if (errBTS !== null) {
				reject(addContextToErr(errBTS, "kernel data is invalid"))
				return
			}
			resolve(text);
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
var kernelDiscoveryFailed = function(err) {
	// Set kernelLoading to false. This needs to happen before the call to
	// postMessage so that when the parent initiates a new kernel load, the
	// attempt will not be blocked.
	kernelLoading = false

	// Log the error and send a failure notification to the parent.
	err = addContextToErr(err, "unable to load the user's kernel")
	log("lifecycle", err)
	window.parent.postMessage({
		kernelMethod: "skynetKernelLoadFailed",
		err: err,
	}, "*");
}

// evalKernel will call 'eval' on the provided kernel code.
var evalKernel = function(kernel: string) {
	eval(kernel);
	log("lifecycle", "user kernel successfully loaded")
	window.parent.postMessage({kernelMethod: "skynetKernelLoaded"}, "*");
}

// loadSkynetKernel handles loading the the skynet-kernel from the user's
// skynet storage. We use 'kernelLoading' to ensure this only happens once. If
// loading fails, 'kernelLoading' will be set to false, and an error will be
// sent to the parent, allowing the parent a chance to fix whatever is wrong
// and try again. Usually a failure means the user is not logged in.
var kernelLoading = false;
var loadSkynetKernel = function() {
	// Check the loading status of the kernel. If the kernel is loading,
	// block until the loading is complete and then send a message to the
	// caller indicating a successful load.
	if (kernelLoading) {
		log("lifecycle", "loadSkynetKernel called when kernel is already loading");
		return;
	}
	kernelLoading = true;

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

// handleSkynetKernelRequestGET is defined for two pages when the user hasn't
// logged in: the home page, and the authentication page.
var handleSkynetKernelRequestGET = function(event) {
	logToSource(event, "help me")
	// Define a helper function for returning an error.
	let respondErr = function(err: string) {
		let requestURLResponse = {
			queryStatus: "reject",
			nonce: event.data.nonce,
			kernelMethod: "requestURLResponseErr",
			err,
		}
		event.source.postMessage(requestURLResponse, event.origin)
	}
	let respondBody = function(body) {
		let requestURLResponse = {
			queryStatus: "resolve",
			nonce: event.data.nonce,
			kernelMethod: "requestURLResponse",
			response: body,
		}
		event.source.postMessage(requestURLResponse, event.origin)
	}

	// Input checking.
	if (!("data" in event) || !("url" in event.data) || typeof event.data.url !== "string") {
		respondErr("no url provided")
		return
	}

	// Handle the auth page.
	//
	// TODO: Change the authpage to a v2link so that we can update the
	// without having to modify the file.
	let url = event.data.url
	if (url === "https://kernel.siasky.net/auth.html" || url === "http://kernel.skynet/auth.html") {
		logToSource(event, "requestGET received for auth")
		downloadSkylink("OABWRQ5IlmfLMAB0XYq_ZE3Z6gX995hj4J_dbawpPHtoYg")
		.then(result => {
			respondBody(result.fileData)
		})
		.catch(err => {
			respondErr("unable to fetch skylink for home.siasky.net: "+err)
		})
		return
	}
	logToSource(event, "requestGET received for something else: "+event.data.url)

	// Default, return a page indicating an error.
	let buf = new TextEncoder().encode("err - unrecognized URL: "+event.data.url)
	respondBody(buf)
}

// handleMessage is called by the message event listener when a new message
// comes in. This function is intended to be overwritten by the kernel that we
// fetch from the user's Skynet account.
var handleMessage = function(event: any) {
	// Check if the user has been authed. If so, send an authCompleted
	// message.
	let [userSeed, errGSU] = getUserSeed()
	if (errGSU === null) {
		log("lifecycle", "user is not logged in, sending message to parent\n", errGSU);
		window.parent.postMessage({kernelMethod: "authCompleted"}, "*");
		return
	}

	// If the parent is informing us that the user has completed
	// authentication, we'll go ahead and reload the kernel so that the
	// user's full kernel can be pulled in.
	if (event.data.kernelMethod === "authCompleted") {
		event.source.postMessage({kernelMethod: "authCompleted"}, "*");
		return;
	}

	// Establish a debugging handler that a developer can call to verify
	// that round-trip communication has been correctly programmed between
	// the kernel and the calling application.
	if (event.data.kernelMethod === "requestTest") {
		log("lifecycle", "sending receiveTest message to source\n", event.source);
		event.source.postMessage({kernelMethod: "receiveTest"}, event.source.origin);
		return;
	}

	// Establish a means for the user to logout. Only logout requests
	// provided by home are allowed.
	if (event.data.kernelMethod === "logOut" && event.origin === "https://home.siasky.net") {
		logOut();
		log("lifecycle", "sending logOutSuccess message to home");
		window.postMessage({kernelMethod: "logOutSuccess"}, "*")
		try {
			event.source.postMessage({kernelMethod: "logOutSuccess"}, "https://home.siasky.net");
		} catch (err) {
			log("lifecycle", "unable to inform source that logOut was competed", err);
		}
		return;
	}

	// Create a handler to handle requestGET calls. If the user is not
	// logged in, the main important calls that can be sent are calls for
	// home.siasky.net (which is the home base for the user) and
	// kernel.siasky.net/auth.html (which is how the user can log into
	// their kernel).
	if (event.data.kernelMethod === "requestGET") {
		logToSource(event, "requestGET received")
		handleSkynetKernelRequestGET(event)
		return
	}

	// The bootloader doesn't recognize any other message types.
	log("message", "unrecognized message received by bootloader\n", event)
	return;
}

// Establish the event listener for the kernel. There are several default
// requests that are supported, namely everything that the user needs to create
// a seed and log in with an existing seed, because before we have the user
// seed we cannot load the rest of the skynet kernel.
window.addEventListener("message", event => {handleMessage(event)}, false)

// If the user seed is in local storage, we'll load the kernel. If the user seed
// is not in local storage, we'll report that the user needs to perform
// authentication.
let [userSeed, errGSU] = getUserSeed()
if (errGSU !== null) {
	log("lifecycle", "user is not logged in, sending message to parent\n", errGSU);
	window.parent.postMessage({kernelMethod: "authFailed"}, "*");
} else {
	log("lifecycle", "user is logged in, loading kernel");
	loadSkynetKernel();
}
