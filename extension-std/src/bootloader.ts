// Import methods from libskynet. They are all namespaced to have a
// 'bootloader' prefix because the full kernel is also likely to use libskynet.
// As the full kernel is imported via 'eval', we need to make sure that methods
// declared inside of the kernel do not conflict with the bootloader. And as
// the bootloader is the one that is the most difficult to change, we go out of
// our way to namespace the bootloader.
//
// This cumbersome namespacing extends to other methods that we define inside
// of the bootloader as well.
import {
	addContextToErr as bootloaderAddContextToErr,
	b64ToBuf as bootloaderB64ToBuf,
	bufToStr as bootloaderBufToStr,
	defaultPortalList as bootloaderDefaultPortalList,
	ed25519Keypair as bootloaderEd25519Keypair,
	error as bootloaderError,
	progressiveFetch as bootloaderProgressiveFetch,
	progressiveFetchResult as bootloaderProgressiveFetchResult,
	tryStringify as bootloaderTryStringify,
	validSkylink as bootloaderValidSkylink,
	verifyDownloadResponse as bootloaderVerifyDownloadResponse,
} from "libskynet"

// NOTE: The bootloader is somewhat unique because it contains both the code
// for the browser extension bootloader, and also for the skt.us bootloader.
// The main difference between the two is how localstorage is handled.

// TODO: Need to figure out if the full kernel needs to overwrite the handlers
// or if it can just add its own. And what the performance implications of that
// might be. Well, the kernel probably wants to do things like overwrite the
// localstorage handler behavior anyway.

// TODO: A whole bunch of 'event' objects have been given type 'any' because
// typescript was throwing weird errors like 'Object is possibly null' and
// 'Argument of type 'string' is not assignable to parameter of type
// 'WindowPostMessageOptions | undefined' - both of which I believe are
// incorrect.

// Set a title and a message which indicates that the page should only be
// accessed via an invisible iframe.
document.title = "kernel.skynet"
let header = document.createElement("h1")
header.textContent =
	"Something went wrong! You should not be visiting this page, this page should only be accessed via an invisible iframe."
document.body.appendChild(header)

// Establish the skylink of the default kernel.
const bootloaderDefaultKernelResolverLink = "AQBY_5nSN_JhWCNcm7GrjENlNuaT-yUTTknWH4rtCnQO5A"

// bootloaderWLog is a function that gets wrapped by bootloaderLog and
// bootloaderErr.
function bootloaderWLog(isErr: boolean, ...inputs: any) {
	let message = "[bootloader]"
	for (let i = 0; i < inputs.length; i++) {
		message += "\n"
		message += bootloaderTryStringify(inputs[i])
	}
	window.parent.postMessage(
		{
			method: "log",
			data: {
				isErr,
				message,
			},
		},
		"*"
	)
}

// Establish logging functions for the bootloader. The bootloader is in an
// iframe and can't console.log directly, so instead we need to send a message
// to the background and request that the background create the log message.
function bootloaderLog(...inputs: any) {
	bootloaderWLog(false, ...inputs)
}

// bootloaderErr is a mirror of bootloaderLog, except that it reports the log
// as an error.
function bootloaderErr(...inputs: any) {
	bootloaderWLog(true, ...inputs)
}

// bootloaderGetSeed will return the seed that is stored in localStorage. If
// there is no seed, it means the user is not logged in.
function bootloaderGetSeed(): [Uint8Array, bootloaderError] {
	// Pull the string version of the seed from localstorage.
	let userSeedString = window.localStorage.getItem("v1-seed")
	if (userSeedString === null) {
		return [new Uint8Array(0), "no user seed in local storage"]
	}

	// Parse the string into a Uint8Array and return the result.
	let userSeed = Uint8Array.from([...userSeedString].map((ch) => ch.charCodeAt(0)))
	return [userSeed, null]
}

// bootloaderDownloadSkylink will download the provided skylink.
function bootloaderDownloadSkylink(skylink: string): Promise<[data: Uint8Array, err: bootloaderError]> {
	return new Promise((resolve) => {
		// Get the Uint8Array of the input skylink.
		let [u8Link, errBBTB] = bootloaderB64ToBuf(skylink)
		if (errBBTB !== null) {
			resolve([new Uint8Array(0), bootloaderAddContextToErr(errBBTB, "unable to decode skylink")])
			return
		}
		if (!bootloaderValidSkylink(u8Link)) {
			resolve([new Uint8Array(0), "skylink appears to be invalid"])
			return
		}

		// Prepare the download call.
		let endpoint = "/skynet/trustless/basesector/" + skylink
		let fileDataPtr = { fileData: new Uint8Array(0), err: null }
		let verifyFunction = function (response: Response): Promise<bootloaderError> {
			return bootloaderVerifyDownloadResponse(response, u8Link, fileDataPtr)
		}

		// Perform the download call.
		bootloaderProgressiveFetch(endpoint, null, bootloaderDefaultPortalList, verifyFunction).then(
			(result: bootloaderProgressiveFetchResult) => {
				// Return an error if the call failed.
				if (result.success !== true) {
					// Check for a 404.
					for (let i = 0; i < result.responsesFailed.length; i++) {
						if (responsesFailed[i].status === 404) {
							resolve([new Uint8Array(0), "404"])
							return
						}
					}

					// Error is not a 404, return the logs as the error.
					let err = bootloaderTryStringify(result.logs)
					resolve([new Uint8Array(0), bootloaderAddContextToErr(err, "unable to complete download")])
					return
				}
				// Check if the portal is honest but the download is corrupt.
				if (fileDataPtr.err !== null) {
					resolve([new Uint8Array(0), bootloaderAddContextToErr(fileDataPtr.err, "download is corrupt")])
					return
				}
				resolve([fileDataPtr.fileData, null])
			}
		)
	})
}

// bootloaderDownloadKernel will take the skylink for a kernel distro, download
// that kernel, and return the code that can be eval'd to load the kernel.
function bootloaderDownloadKernel(kernelSkylink: string): Promise<[kernelCode: string, err: bootloaderError]> {
	return new Promise((resolve) => {
		bootloaderDownloadSkylink(kernelSkylink).then(([fileData, err]) => {
			// Don't add any context to a 404 error.
			if (err === "404") {
				resolve(["", err])
				return
			}

			// Check the error.
			if (err !== null) {
				resolve(["", bootloaderAddContextToErr(err, "unable to download the default kernel")])
				return
			}

			// Decode the fileData to text and return the text.
			let [kernelCode, errBBTS] = bootloaderBufToStr(fileData)
			if (errBBTS !== null) {
				resolve(["", bootloaderAddContextToErr(err, "unable to decode the default kernel")])
				return
			}
			resolve([kernelCode, null])
		})
	})
}

// bootloaderDownloadDefaultKernel will attempt to download the default kernel
// and return the code that can be eval'd.
function bootloaderDownloadDefaultKernel(): Promise<[kernelCode: string, err: bootloaderError]> {
	return bootloaderDownloadKernel(bootloaderDefaultKernelResolverLink)
}

// bootloaderSetUserKernelAsDefault will set the user's kernel to be the
// default kernel.
//
// There is no return value for this function, if it doesn't work leave a log
// message.
function bootloaderSetUserKernelAsDefault(keypair: bootloaderEd25519Keypair, dataKey: Uint8Array) {
	// Log that we are setting the user's kernel.
	bootloaderLog("user kernel not found, setting user kernel to "+bootloaderDefaultKernelResolverLink)

	// Get the defaultKernelSkylink as a Uint8Array, which will be the data of
	// the registry entry that we need to write.
	let [defaultKernelSkylink, err64] = bootloaderB64ToBuf(bootloaderDefaultKernelResolverLink)
	if (err64 !== null) {
		bootloaderLog("unable to convert default kernel link to a Uint8Array")
		return
	}

	// Get the encoded data and signature.
	let [sig, encodedData, errCRS] = bootloaderComputeRegistrySignature(keypair.secretKey, dataKey, defaultKernelSkylink, 0n)
	if (errCRS !== null) {
		bootloaderLog(bootloaderAddContextToErr(errCRS, "unable to compute registry signature to set user kernel"))
		return
	}

	// Compute the parameters of the fetch call.
	let dataKeyHex = bootloaderBufToHex(dataKey)
	let endpoint = "/skynet/registry"
	let postBody = {
		publickey: {
			algorithm: "ed25519",
			key: Array.from(keypair.publicKey),
		},
		datakey: datakeyHex,
		revision: 0,
		data: Array.from(data),
		signature: Array.from(sig),
	}
	let fetchOpts = {
		method: "post",
		body: JSON.stringify(postBody),
	}

	// Perform the fetch call.
	bootloaderProgressiveFetch(endpoint, postBody, bootloaderDefaultPortalList, verifyFunction).then(
		(result: bootloaderProgressiveFetchResult) => {
			// Return an error if the call failed.
			if (result.success !== true) {
				bootloaderLog("unable to update the user kernel registry entry\n", bootloaderTryStringify(result.logs))
				return
			}
			bootloaderLog("successfully updated the user kernel registry entry to the default kernel")
		}
	)
}

// bootloaderDownloadUserKernel will download the user's kernel and return the
// code that can be eval'd.
function bootloaderDownloadUserKernel(): Promise<[kernelCode: string, err: bootloaderError]> {
	return new Promise((resolve) => {
		// We need to derive the registry entry keys for the user's kernel.
		let [seed, errBGS] = bootloaderGetSeed()
		if (errBGS !== null) {
			resolve(["", bootloaderAddContextToErr(errBGS, "unable to load the user's seed")])
			return
		}

		// TODO: use lib/registry:ownRegistryEntryKeys to get the registry
		// entry keys. OR, add something to libskynet and use that instead.

		// Get the resolver link for the user's kernel.
		let [userKernelSkylink, errDRL] = deriveResolverLink("v1-skynet-kernel", "v1-skynet-kernel-datakey")
		// TODO: handle err here

		// Perform the download of the user kernel. If the user kernel is a 404, we
		// need to establish the default kernel of this bootloader as the user's
		// kernel.
		//
		// We do this so that the user's first experience will be mirrored on any
		// other device they use to load Skynet. If the user wishes to change to a
		// new kernel from the one they initially bootstrapped to, they can do so
		// and then they won't see this bootloader again. But at the very least, a
		// naive user will have the same experience every time when using Skynet
		// until they intentionally change their kernel.
		bootloaderDownloadKernel(userKernelSkylink).then(([kernelCode, err]) => {
			// If the error is a 404, we need to set the default kernel of the
			// user and then return the download for the default kernel.
			if (err === "404") {
				bootloaderDownloadDefaultKernel().then(([defaultCode, errDefault]) => {
					if (errDefault === null) {
						bootloaderSetUserKernelAsDefault(keypair, dataKey)
					}
					resolve([defaultCode, errDefault])
					return
				})
			}

			// The error is not a 404, therefore use the result of the download
			// directly as the resolve/return values.
			resolve([kernelCode, err])
		})
	})
}

// Establish a singleton which tracks whether the kernel has loaded.
//
// TODO: Need to rename this to namespace it better.
let kernelHasLoaded = false

// kernelDiscoveryFailed defines the callback that is called in
// readRegistryAndLoadKernel after we were unable to read the user's registry
// entry from Skynet. Note that this is different from a 404, it means that we
// could not get a reliable read at all.
//
// If we can't figure out what kernel the user wants to load, we are going to
// abort and send an error message to the parent, because we don't want the UX
// of loading the default kernel for the user if there's a different kernel
// that they are already used to.
let kernelDiscoveryFailed = function (err: any) {
	// Set kernelLoading to false. This needs to happen before the call to
	// postMessage so that when the parent initiates a new kernel load, the
	// attempt will not be blocked.
	kernelLoading = false

	// Log the error and send a failure notification to the parent.
	bootloaderLog("auth", "unable to load user's kernel", err)
	window.parent.postMessage(
		{
			method: "kernelAuthStatus",
			data: {
				userAuthorized: true,
				err: err.message,
			},
		},
		"*"
	)
	kernelHasLoaded = true
}

// evalKernel will call 'eval' on the provided kernel code.
let evalKernel = function (kernel: string) {
	// The eval will throw if the userSeed is not available. This shouldn't
	// happen, but we catch the throw here anyway.
	try {
		eval(kernel)
	} catch (err) {
		bootloaderErr("kernel could not be loaded", err)
		return
	}

	// Only send a message indicating that the kernel was successfully
	// loaded if the auth status hasn't changed in the meantime.
	if (authChangeMessageSent === false) {
		window.parent.postMessage(
			{
				method: "kernelAuthStatus",
				data: {
					userAuthorized: true,
					err: null,
				},
			},
			"*"
		)
		kernelHasLoaded = true
	}
}

// loadSkynetKernel handles loading the the skynet-kernel from the user's
// skynet storage. We use 'kernelLoading' to ensure this only happens once. If
// loading fails, 'kernelLoading' will be set to false, and an error will be
// sent to the parent, allowing the parent a chance to fix whatever is wrong
// and try again. Usually a failure means the user is not logged in.
var kernelLoading = false
let loadSkynetKernel = function () {
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
		.then(() => {
			return downloadUserKernel()
		})
		.then((kernel: any) => {
			evalKernel(kernel)
			bootloaderLog("auth", "kernel is loaded")
		})
		.catch((err: any) => {
			bootloaderLog("auth", "unable to load kernel", err)
			kernelDiscoveryFailed(err)
		})
}

// handleSkynetKernelRequestOverride is defined for two pages when the user
// hasn't logged in: the home page, and the authentication page.
let handleSkynetKernelRequestOverride = function (event: any) {
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
	let respondErr = function (err: string) {
		event.source.postMessage(
			{
				nonce: data.nonce,
				method: "response",
				err,
			},
			event.origin
		)
	}
	let respondBody = function (body: any) {
		let msg: any = {
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
		respondErr("no url provided: " + JSON.stringify(data))
		return
	}
	if (!("method" in data.data) || typeof data.data.method !== "string") {
		respondErr("no data.method provided: " + JSON.stringify(data))
		return
	}

	// Handle the auth page.
	//
	// TODO: Change the authpage to a v2link so that we can update the
	// without having to modify the file.
	let url = data.data.url
	if (url === "http://kernel.skynet/auth.html") {
		downloadSkylink("OAC7797uTAoG25e9psL6ejA71VLKinUdF4t76sMkYTj8IA")
			.then((result: any) => {
				respondBody(result.fileData)
			})
			.catch((err: any) => {
				let errStr = bootloaderTryStringify(err)
				respondErr("unable to fetch skylink for kernel page: " + errStr)
			})
		return
	}
	respondBody(null)
}

// handleSkynetKernelProxyInfo responds to a DNS query. The default kernel
// always responds that there should be no proxy for the given domain - the
// background script already has special carveouts for all required domains.
let handleSkynetKernelProxyInfo = function (event: any) {
	event.source.postMessage(
		{
			nonce: event.data.nonce,
			method: "response",
			err: null,
			data: {
				proxy: false,
			},
		},
		event.origin
	)
}

// Establish the event listener for the kernel. There are several default
// requests that are supported, namely everything that the user needs to create
// a seed and log in with an existing seed, because before we have the user
// seed we cannot load the rest of the skynet kernel.
var handleMessage = function (event: any) {
	// Establish some error handling helpers.
	let respondUnknownMethod = function (method: string) {
		event.source.postMessage(
			{
				nonce: event.data.nonce,
				method: "response",
				err: "unrecognized method (user may need to log in): " + method,
			},
			event.origin as any
		)
	}
	// Check that there's a nonce.
	if (!("nonce" in event.data)) {
		return
	}
	if (!("method" in event.data)) {
		respondUnknownMethod("[no method provided]")
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
		bootloaderLog("received a message before the kernel was ready", event.data)
	}
}
window.addEventListener("message", (event) => {
	handleMessage(event)
})

// Establish a storage listener for the kernel that listens for any changes to
// the userSeed storage key. In the event of a change, we want to emit an
// 'kernelAuthStatusChanged' method to the parent so that the kernel can be
// refreshed.
var authChangeMessageSent = false
var handleStorage = function (event: StorageEvent) {
	// If the event is that the v1-seed has changed, then this is a login
	// event. If the user was already logged in, it may mean they switched
	// accounts.
	if (event.key === "v1-seed") {
		authChangeMessageSent = true
		window.parent.postMessage(
			{
				method: "kernelAuthStatusChanged",
				data: {
					userAuthorized: true,
				},
			},
			"*"
		)

		// Attempt to load the kernel again.
		if (kernelHasLoaded === false) {
			loadSkynetKernel()
			kernelHasLoaded = true
		}
	}

	// If the event is null, it means the localStorage was cleared, which means
	// the user has logged out.
	if (event.key === null) {
		authChangeMessageSent = true
		window.parent.postMessage(
			{
				method: "kernelAuthStatusChanged",
				data: {
					userAuthorized: false,
				},
			},
			"*"
		)
		window.location.reload()
	}
}
window.addEventListener("storage", (event) => handleStorage(event))

// If the user seed is in local storage, we'll load the kernel. If the user
// seed is not in local storage, we'll report that the user needs to perform
// authentication. Kernel loading will resume once the user has authenticated.
//
// NOTE: Depending on which browser is being used we need to call
// requestStorageAccess.
function bootloaderAuthFailed() {
	window.parent.postMessage(
		{
			method: "kernelAuthStatus",
			data: {
				userAuthorized: false,
				err: null,
			},
		},
		"*"
	)
}

// bootloaderLoadKernel will attempt to load the kernel from the user's seed.
// If the seed isn't available, it will declare that auth failed.
function bootloaderLoadKernel() {
	// Try to load the user's seed.
	let [, errGSU] = bootloaderGetSeed()
	if (errGSU !== null) {
		bootloaderLog("auth", "user is not logged in", errGSU)
		bootloaderAuthFailed()
		return
	}

	// Attempt to load the skynet kernel.
	bootloaderLog("auth", "user is logged in, attempting to load kernel")
	loadSkynetKernel()
}

// If the browser supports requesting storage access, try to get storage
// access. Otherwise, the user will need to disable strict privacy in their
// browser for skt.us to work. If the user has the extension, disabling strict
// privacy is not needed.
if (Object.prototype.hasOwnProperty.call(document, "requestStorageAccess") && window.origin === "https://skt.us") {
	document
		.requestStorageAccess()
		.then(() => {
			bootloaderLoadKernel()
		})
		.catch((err) => {
			bootloaderLog("auth", "could not get access to localStorage", err)
			bootloaderAuthFailed()
		})
} else {
	bootloaderLoadKernel()
}
