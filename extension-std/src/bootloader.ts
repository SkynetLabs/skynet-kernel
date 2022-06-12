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
	bufToHex as bootloaderBufToHex,
	bufToStr as bootloaderBufToStr,
	computeRegistrySignature as bootloaderComputeRegistrySignature,
	defaultPortalList as bootloaderDefaultPortalList,
	deriveChildSeed as bootloaderDeriveChildSeed,
	deriveRegistryEntryID as bootloaderDeriveRegistryEntryID,
	ed25519Keypair as bootloaderEd25519Keypair,
	entryIDToSkylink as bootloaderEntryIDToSkylink,
	error as bootloaderError,
	progressiveFetch as bootloaderProgressiveFetch,
	progressiveFetchResult as bootloaderProgressiveFetchResult,
	taggedRegistryEntryKeys as bootloaderTaggedRegistryEntryKeys,
	tryStringify as bootloaderTryStringify,
	validSkylink as bootloaderValidSkylink,
	verifyDownloadResponse as bootloaderVerifyDownloadResponse,
	verifyRegistryReadResponse as bootloaderVerifyRegistryReadResp,
} from "libskynet"

// NOTE: The bootloader is somewhat unique because it contains both the code
// for the browser extension bootloader, and also for the skt.us bootloader.
// The main difference between the two is how localstorage is handled.

// TODO: A whole bunch of 'event' objects have been given type 'any' because
// typescript was throwing weird errors like 'Object is possibly null' and
// 'Argument of type 'string' is not assignable to parameter of type
// 'WindowPostMessageOptions | undefined' - both of which I believe are
// incorrect.

// TODO: Need to ensure that queries that come in which are intended for the
// full kernel but instead hit the bootloader do get relayed to the full kernel
// after it gets eval'd, or otherwise get rejected if the full kernel cannot be
// loaded. This is particularly important for request overrides and header
// overrides because the user may be depending on these overrides for safety.

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
		bootloaderLog("calling progfetch")
		bootloaderProgressiveFetch(endpoint, null, bootloaderDefaultPortalList, verifyFunction).then(
			(result: bootloaderProgressiveFetchResult) => {
				bootloaderLog("progfetch called and returned")
				// Return an error if the call failed.
				if (result.success !== true) {
					// Check for a 404.
					for (let i = 0; i < result.responsesFailed.length; i++) {
						if (result.responsesFailed[i].status === 404) {
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
	bootloaderLog("user kernel not found, setting user kernel to " + bootloaderDefaultKernelResolverLink)

	// Get the defaultKernelSkylink as a Uint8Array, which will be the data of
	// the registry entry that we need to write.
	let [defaultKernelSkylink, err64] = bootloaderB64ToBuf(bootloaderDefaultKernelResolverLink)
	if (err64 !== null) {
		bootloaderLog("unable to convert default kernel link to a Uint8Array")
		return
	}

	// Get the encoded data and signature.
	let [sig, errCRS] = bootloaderComputeRegistrySignature(keypair.secretKey, dataKey, defaultKernelSkylink, 0n)
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
		datakey: dataKeyHex,
		revision: 0,
		data: Array.from(defaultKernelSkylink),
		signature: Array.from(sig),
	}
	let fetchOpts = {
		method: "post",
		body: JSON.stringify(postBody),
	}

	// Perform the fetch call.
	bootloaderProgressiveFetch(endpoint, fetchOpts, bootloaderDefaultPortalList, bootloaderVerifyRegistryReadResp).then(
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
		// Get the user's seed so we can use it to derive the user's kernel
		// entry.
		let [seed, errBGS] = bootloaderGetSeed()
		if (errBGS !== null) {
			bootloaderLog("user seed could not be retreived for kernel download")
			resolve(["", bootloaderAddContextToErr(errBGS, "unable to load the user's seed")])
			return
		}
		bootloaderLog("user seed successfully retrieved")

		// Create a child seed for working with the user's kernel entry. We
		// create a child seed here so that the user's kernel entry seed can be
		// exported without exposing the user's root seed. It's unlikely that
		// this will ever matter, but it's also trivial to implement.
		let kernelEntrySeed = bootloaderDeriveChildSeed(seed, "userPreferredKernel")

		// Get the registry keys.
		let [keypair, dataKey, errTREK] = bootloaderTaggedRegistryEntryKeys(kernelEntrySeed, "user kernel")
		if (errTREK !== null) {
			resolve(["", bootloaderAddContextToErr(errTREK, "unable to create user kernel registry keys")])
			return
		}

		// Get the entry id for the user's kernel entry.
		let [entryID, errREID] = bootloaderDeriveRegistryEntryID(keypair.publicKey, dataKey)
		if (errREID !== null) {
			resolve(["", bootloaderAddContextToErr(errREID, "unable to derive registry entry id")])
			return
		}
		let userKernelSkylink = bootloaderEntryIDToSkylink(entryID)

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
		bootloaderLog("calling download on userKernelSkylink")
		bootloaderDownloadKernel(userKernelSkylink).then(([kernelCode, err]) => {
			// If the error is a 404, we need to set the default kernel of the
			// user and then return the download for the default kernel.
			bootloaderLog("download has finished")
			if (err === "404") {
				bootloaderLog("got a 404")
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

// bootloaderEvalKernel will call 'eval' on the provided kernel code and send a
// message indication success or failure.
function bootloaderEvalKernel(kernel: string) {
	// The eval will throw if the userSeed is not available. This shouldn't
	// happen, but we catch the throw here anyway.
	try {
		eval(kernel)
		bootloaderKernelLoaded = "success"
		bootloaderSendAuthUpdate()
		bootloaderLog("kernel successfully loaded and eval'd")
		return
	} catch (err: any) {
		let extErr = bootloaderAddContextToErr(bootloaderTryStringify(err), "unable to eval kernel")
		bootloaderKernelLoaded = extErr
		bootloaderErr(extErr)
		bootloaderSendAuthUpdate()
		return
	}
}

// bootloaderLoadKernel will download the kernel code and eval it.
function bootloaderLoadKernel() {
	bootloaderDownloadUserKernel().then(([kernelCode, err]) => {
		bootloaderLog("user kernel download is complete")
		if (err !== null) {
			let extErr = bootloaderAddContextToErr(err, "unable to download kernel")
			bootloaderKernelLoaded = extErr
			bootloaderErr(extErr)
			bootloaderSendAuthUpdate()
			return
		}

		// Download was successful, time to eval the result.
		bootloaderEvalKernel(kernelCode)
	})
}

// bootstrapHandleSkynetKernelRequestOverride is defined for two pages when the
// user hasn't logged in: the home page, and the authentication page.
function bootstrapHandleSkynetKernelRequestOverride(event: any) {
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
		let msg = {
			nonce: data.nonce,
			method: "response",
			err,
		}
		event.source.postMessage(msg, event.origin)
	}

	// Define a helper function for returning the new body of the page that is
	// getting overwritten.
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
	if (!("data" in data) || typeof data.data.url !== "string") {
		respondErr("no url provided: " + bootloaderTryStringify(data))
		return
	}

	// Any page that isn't the auth page can be ignored.
	let url = data.data.url
	if (url !== "http://kernel.skynet/auth.html") {
		// Respond with null, indicating that there is no override for the
		// requested page.
		respondBody(null)
		return
	}

	// Fetch the auth page and return it for the override.
	//
	// TODO: Change the skylink to a v2 skylink so we can update the auth page
	// without needing to re-ship the bootloader.
	bootloaderDownloadSkylink("OAC7797uTAoG25e9psL6ejA71VLKinUdF4t76sMkYTj8IA").then(([fileData, err]) => {
		if (err !== null) {
			respondErr(bootloaderAddContextToErr(err, "unable to fetch kernel auth page"))
			return
		}
		respondBody(fileData)
	})
}

// bootstrapHandleSkynetKernelProxyInfo responds to a DNS query. The default
// kernel always responds that there should be no proxy for the given domain -
// the background script already has special carveouts for all required
// domains.
function bootstrapHandleSkynetKernelProxyInfo(event: any) {
	// Before the kernel is loaded, the default is always "do not proxy".
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

// Establish a message handler for the kernel called handleMessage. The kernel
// is intended to overwrite this handler after it has loaded, therefore the
// name 'handleMessage' is part of the bootloading protocol and cannot be
// changed.
//
// The construction of the browser extension requires that a few messages get
// handled in advance of the full kernel loading, because certain pages and
// assets need to be loaded before the kernel itself is able to load.
var handleMessage = function (event: any) {
	// Establish a helper method to respond to an unknown message with an
	// error.
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

	// Check that there's a nonce and a method.
	if (!("nonce" in event.data)) {
		return
	}
	if (!("method" in event.data)) {
		respondUnknownMethod("[no method provided]")
		return
	}

	// Create default handlers for the requestOverride and proxyInfo
	// methods. These methods are important during bootloading to ensure
	// that the default login page can be loaded for the user.
	if (event.data.method === "requestOverride") {
		bootstrapHandleSkynetKernelRequestOverride(event)
		return
	}
	if (event.data.method === "proxyInfo") {
		bootstrapHandleSkynetKernelProxyInfo(event)
		return
	}

	// This message is not supposed to be handled until the kernel has loaded.
	// And the kernel loading is supposed to overwrite this handler.
	bootloaderLog("received a message before the kernel was ready\n", event.data)
}
window.addEventListener("message", (event) => {
	handleMessage(event)
})

// Establish a message handler for storage events. The kernel is intended to
// overwrite this handler after the kernel has loaded, therefore the name
// 'handleStorage' is part of the bootloading protocol and cannot be changed.
//
// handleStorage primarily listens for changes to the user seed that indicate
// that the user has either logged in or logged out.
var handleStorage = function (event: StorageEvent) {
	// Ignore any storage events that don't include v1-seed. The 'null' key
	// means that all storage entries were wiped, which does include changes to
	// v1-seed.
	if (event.key !== null && event.key !== "v1-seed") {
		return
	}
	// If the user is already logged out, ignore the message as we should wait
	// until we've refreshed.
	if (bootloaderLogoutComplete === true) {
		return
	}

	// If the storage was wiped but the user is already not logged in, nothing
	// needs to happen.
	if (event.key === null && bootloaderLoginComplete === false) {
		return
	}

	// If the user is not logged in and this is a v1-seed change, it means that
	// the user is now logged in.
	if (event.key === "v1-seed" && bootloaderLoginComplete === false) {
		bootloaderLog("user is now logged in, attempting to load kernel")
		bootloaderLoginComplete = true
		bootloaderLoadKernel()
		bootloaderSendAuthUpdate()
		return
	}

	// The other two cases are where the user was already logged in and then
	// either v1-seed changed or all variables were deleted (which includes
	// v1-seed being changed). We set logoutComplete to true and then we
	// refresh the kernel, resetting the auth cycle.
	//
	// We refresh the kernel upon logout because we want to ensure that no
	// settings or private data leaks between different user account logins of
	// the kernel.
	bootloaderLogoutComplete = true
	bootloaderSendAuthUpdate()
	window.location.reload()
}
window.addEventListener("storage", (event) => handleStorage(event))

// bootloaderSendAuthUpdate will send a message containing an auth update,
// letting any listeners know the updated auth state. The auth state has five
// stages that are covered by three variables.
//
// Stage 0; no auth updates
// Stage 1: bootloader is loaded, user is not yet logged in
// Stage 2: bootloader is loaded, user is logged in
// Stage 3: kernel is loaded, user is logged in
// Stage 4: kernel is loaded, user is logging out (refresh iminent)
let bootloaderLoginComplete = false
let bootloaderLogoutComplete = false
let bootloaderKernelLoaded = "not yet"
function bootloaderSendAuthUpdate() {
	window.parent.postMessage(
		{
			method: "kernelAuthStatus",
			data: {
				loginComplete: bootloaderLoginComplete,
				logoutComplete: bootloaderLogoutComplete,
				kernelLoaded: bootloaderKernelLoaded,
			},
		},
		"*"
	)
}

// bootloaderCheckForLoadKernel will check that the user seed is available, and
// if so it will load the kernel. If not it will report that the user is not
// logged in and go idle.
function bootloaderCheckForLoadKernel() {
	// Try to load the user's seed.
	let [, errGSU] = bootloaderGetSeed()
	if (errGSU !== null) {
		// If the seed could not be loaded, the most likely explanation is that
		// the user is not logged in. We send an auth message that says the
		// user is not logged in, but this informs the receiver that the
		// bootloader has finished loading.
		bootloaderLog(bootloaderAddContextToErr(errGSU, "unable to get user credentials, user may not be logged in"))
		bootloaderSendAuthUpdate()
		return
	}

	// User is logged in, attempt to load the kernel. Before loading the
	// kernel, inform any listeners that auth was successful.
	bootloaderLog("user is already logged in, attempting to load kernel")
	bootloaderLoginComplete = true
	bootloaderSendAuthUpdate()
	bootloaderLoadKernel()
}

// If the browser supports requesting storage access, try to get storage
// access. Otherwise, the user will need to disable strict privacy in their
// browser for skt.us to work. If the user has the extension, disabling strict
// privacy is not needed.
let bootloaderAccessFailedStr = "unable to get access to localStorage, user may need to reduce their privacy settings"
if (Object.prototype.hasOwnProperty.call(document, "requestStorageAccess") && window.origin === "https://skt.us") {
	document
		.requestStorageAccess()
		.then(() => {
			bootloaderCheckForLoadKernel()
		})
		.catch((err) => {
			bootloaderLog(bootloaderAddContextToErr(err, bootloaderAccessFailedStr))
			bootloaderSendAuthUpdate()
		})
} else {
	bootloaderCheckForLoadKernel()
}
