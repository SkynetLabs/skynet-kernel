export {}

// Set a title and a message which indicates that the page should only be
// accessed via an invisible iframe.
document.title = "kernel.skynet"
var header = document.createElement('h1')
header.textContent = "Something went wrong! You should not be visiting this page, this page should only be accessed via an invisible iframe."
document.body.appendChild(header)

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

// Establish a promise that will block until the kernel is loaded. Messages
// that are received will wait to be processed until the kernel has finished
// bootstrapping. Messages that are required for kernel bootstrapping will
// bypass the block.
//
// The kernelHasLoaded variable is used by the handleMessage function to make
// sure that messages aren't stuck in an infinite loop.
var kernelLoaded
var blockUntilLoaded = new Promise(resolve => {kernelLoaded = resolve})
var kernelHasLoaded = false

// getUserSeed will return the seed that is stored in localStorage. This is the
// first function that gets called when the kernel iframe is openend. The
// kernel will not be loaded if no seed is present, as it means that the user
// is not logged in.
var getUserSeed = function(): [Uint8Array, Error] {
	// Pull the string version of the seed from localstorage.
	let userSeedString = window.localStorage.getItem("v1-seed")
	if (userSeedString === null) {
		return [null, new Error("no user seed in local storage")]
	}

	// Parse the string into a Uint8Array and return the result.
	let userSeed = Uint8Array.from([...userSeedString].map(ch => ch.charCodeAt(0)))
	return [userSeed, null]
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
				resolve(text)
				return
			}

			// Handle every other response status.
			log("lifecycle", "portal response not recognized", output.response)
			reject("response not recognized when reading default kernel")
			return
		})
		.catch(err => {
			reject(addContextToErr(err, "unable to download default portal"))
		})
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
		let response = output.response
		if (response.status === 200) {
			let [text, errBTS] = bufToStr(output.fileData)
			if (errBTS !== null) {
				reject(addContextToErr(errBTS, "kernel data is invalid"))
				return
			}
			resolve(text)
			return
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
			log("lifecycle", "user has no established kernel, trying to set the default")

			// Perform the registry write.
			let [defaultKernelSkylink, err64] = b64ToBuf(defaultKernelResolverLink)
			if (err64 !== null) {
				log("lifecycle", "could not convert defaultKernelSkylink to a uin8array")
				reject(addContextToErr(err64, "could not convert defaultKernelSkylink"))
				return
			}
			writeNewOwnRegistryEntry("v1-skynet-kernel", "v1-skynet-kernel-datakey", defaultKernelSkylink)
			.then(response => {
				log("lifecycle", "succesfully set the user's kernel to the default kernel")
			})
			.catch(err => {
				log("lifecycle", "unable to set the user's kernel\n", err)
			})

			// Need to download and eval the default kernel.
			// fetchAndEvalDefaultKernel()
			downloadDefaultKernel()
			.then(text => {
				resolve(text)
			})
			.catch(err => {
				reject(addContextToErr(err, "unable to download default kernel"))
			})
			return
		}

		// Handle every other response status.
		log("lifecycle", "response not recognized when reading user kernel\n", response)
		reject("response not recognized when reading user's kernel")
		return
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
			reject(addContextToErr(err, "unable to download user's kernel"))
		})
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
var kernelDiscoveryFailed = function(err) {
	// Set kernelLoading to false. This needs to happen before the call to
	// postMessage so that when the parent initiates a new kernel load, the
	// attempt will not be blocked.
	kernelLoading = false

	// Log the error and send a failure notification to the parent.
	log("auth", "unable to load user's kernel", err)
	window.parent.postMessage({
		method: "kernelAuthStatus",
		data: {
			userAuthorized: true,
			err,
		},
	}, window.parent.origin)
	kernelLoaded()
	kernelHasLoaded = true
}

// evalKernel will call 'eval' on the provided kernel code.
var evalKernel = function(kernel: string) {
	eval(kernel)
	log("lifecycle", "user kernel successfully loaded")

	// Only send a message indicating that the kernel was successfully
	// loaded if the auth status hasn't changed in the meantime.
	if (authChangeMessageSent === false) {
		window.parent.postMessage({
			method: "kernelAuthStatus",
			data: {
				userAuthorized: true,
				err: null,
			},
		}, window.parent.origin)
		kernelLoaded()
		kernelHasLoaded = true
	}
}

// loadSkynetKernel handles loading the the skynet-kernel from the user's
// skynet storage. We use 'kernelLoading' to ensure this only happens once. If
// loading fails, 'kernelLoading' will be set to false, and an error will be
// sent to the parent, allowing the parent a chance to fix whatever is wrong
// and try again. Usually a failure means the user is not logged in.
var kernelLoading = false
var loadSkynetKernel = function() {
	// Check the loading status of the kernel. If the kernel is loading,
	// block until the loading is complete and then send a message to the
	// caller indicating a successful load.
	if (kernelLoading) {
		return
	}
	kernelLoading = true

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
		log("auth", "unable to load kernel", err)
		kernelDiscoveryFailed(err)
	})
}

// handleSkynetKernelRequestOverride is defined for two pages when the user
// hasn't logged in: the home page, and the authentication page.
var handleSkynetKernelRequestOverride = function(event) {
	// Define the headers that need to be injected when responding to the
	// GET request. In this case (pre-auth), the headers will be the same
	// for all pages that we inject.
	let headers = [
		{
			name: "content-type",
			value: "text/html; charset=utf8",
		},
	]

	// Define a helper function for returning an error.
	let data = event.data
	let respondErr = function(err: string) {
		event.source.postMessage({
			nonce: data.nonce,
			method: "response",
			err,
		}, event.origin)
	}
	let respondBody = function(body) {
		let msg = {
			nonce: data.nonce,
			method: "response",
			err: null,
		}
		if (body === null) {
			msg["data"] = {
				override: false,
			}
		} else {
			msg["data"] = {
				override: true,
				headers,
				body,
			}
		}
		event.source.postMessage(msg, event.origin)
	}

	// Input checking.
	if (!("data" in data) || !("url" in data.data) || typeof data.data.url !== "string") {
		respondErr("no url provided: "+JSON.stringify(data))
		return
	}
	if (!("method" in data.data) || typeof data.data.method !== "string") {
		respondErr("no data.method provided: "+JSON.stringify(data))
		return
	}

	// Handle the auth page.
	//
	// TODO: Change the authpage to a v2link so that we can update the
	// without having to modify the file.
	let url = data.data.url
	if (url === "http://kernel.skynet/auth.html") {
		downloadSkylink("OABWRQ5IlmfLMAB0XYq_ZE3Z6gX995hj4J_dbawpPHtoYg")
		.then(result => {
			respondBody(result.fileData)
		})
		.catch(err => {
			respondErr("unable to fetch skylink for kernel page: "+err)
		})
		return
	}
	respondBody(null)
}

// handleSkynetKernelProxyInfo responds to a DNS query. The default kernel
// always responds that there should be no proxy for the given domain - the
// background script already has special carveouts for all required domains.
var handleSkynetKernelProxyInfo = function(event) {
	event.source.postMessage({
		nonce: event.data.nonce,
		method: "response",
		err: null,
		data: {
			proxy: false,
		},
	}, event.origin)
}

// handleTest responds to the 'test' method.
var handleTest = function(event: MessageEvent) {
	event.source.postMessage({
		nonce: event.data.nonce,
		method: "response",
		err: null,
		data: {
			version: "v0.0.1",
		},
	}, event.origin as any)
}

// Establish the event listener for the kernel. There are several default
// requests that are supported, namely everything that the user needs to create
// a seed and log in with an existing seed, because before we have the user
// seed we cannot load the rest of the skynet kernel.
var handleMessage = function(event: MessageEvent) {
	// Establish some error handling helpers.
	let respondUnknownMethod = function(method: string) {
		event.source.postMessage({
			nonce: event.data.nonce,
			method: "response",
			err: "unrecognized method (user may need to log in): "+method,
		}, event.origin as any)
	}
	// Check that there's a nonce.
	if (!("nonce" in event.data)) {
		return
	}
	if (!("method" in event.data)) {
		respondUnknownMethod("[no method provided]")
		return
	}

	// Establish a debugging handler that a developer can call to verify
	// that round-trip communication has been correctly programmed between
	// the kernel and the calling application.
	if (event.data.method === "test") {
		handleTest(event)
		return
	}

	// Create default handlers for the requestOverride and proxyInfo
	// methods.  These methods are important during bootloading to ensure
	// that the default login page can be loaded for the user.
	//
	// TODO: Only select versions of these methods should actually run, we
	// don't want to do everything prior to boostrap just the requests that
	// directly pertain to the bootstrapping process.
	if (event.data.method === "requestOverride") {
		handleSkynetKernelRequestOverride(event)
		return
	}
	if (event.data.method === "proxyInfo") {
		handleSkynetKernelProxyInfo(event)
		return
	}

	// This message is not supposed to be handled until the kernel has
	// loaded. If the kernel is already loaded, then we respond with an
	// error. If the kernel has not yet loaded, we wait until the kernel is
	// loaded. Then we call 'handleMessage' again because the full kernel
	// will overwrite the function, and we want to use the new rules.
	if (kernelHasLoaded === true) {
		respondUnknownMethod(event.data.method)
	} else {
		blockUntilLoaded
		.then(x => {
			handleMessage(event)
		})
	}
}
window.addEventListener("message", event => {handleMessage(event)})

// Establish a storage listener for the kernel that listens for any changes to
// the userSeed storage key. In the event of a change, we want to emit an
// 'kernelAuthStatusChanged' method to the parent so that the kernel can be
// refreshed.
var authChangeMessageSent = false
var handleStorage = function(event: StorageEvent) {
	// A null key indicates that storage has been cleared, which also means
	// the auth status has changed.
	if (event.key === "v1-seed" || event.key === null) {
		authChangeMessageSent = true
		window.parent.postMessage({method: "kernelAuthStatusChanged"}, window.parent.origin)
	}
}
window.addEventListener("storage", event => (handleStorage(event)))

// Send a message indicating that the kernel has loaded.
window.parent.postMessage({
	method: "kernelReady",
	data: {},
}, window.parent.origin)

// If the user seed is in local storage, we'll load the kernel. If the user seed
// is not in local storage, we'll report that the user needs to perform
// authentication.
let [userSeed, errGSU] = getUserSeed()
if (errGSU !== null) {
	// Send a message indicating the auth status.
	log("auth", "user is not logged in\n", errGSU)
	window.parent.postMessage({
		method: "kernelAuthStatus",
		data: {
			userAuthorized: false,
			err: null,
		},
	}, window.parent.origin)
	kernelLoaded()
	kernelHasLoaded = true
} else {
	log("auth", "user is logged in, attempting to load kernel")
	loadSkynetKernel()
}
