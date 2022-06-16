// bootloader.ts is the bootloader for the kernel. The sole purpose of the
// bootloader is to load the user's kernel, ensuring along the way that the
// webserver is not able to maliciously inject code that could steal the user's
// seed.
//
// Throughout the bootloader, there are places where we need to do friviolous
// null checks and use types 'as any' due to typescript seemingly not
// understanding the types involved when working with the webbrowser. I'd like
// to fix it, but it fell off of the priorities list. They've been marked with
// the comment 'tsc'. We've tried to avoid them as much as possible, and if you
// know how to get rid of these exceptions, we'd love to see a pull request.

import { addContextToErr, tryStringify } from "libskynet"

var browser: any // tsc

// Set a title and a message which indicates that the page should only be
// accessed via an invisible iframe.
document.title = "kernel.skynet"
let header = document.createElement("h1")
header.textContent =
	"Something went wrong! You should not be visiting this page, this page should only be accessed via an invisible iframe."
document.body.appendChild(header)

// bootloaderWLog is a function that gets wrapped by bootloaderLog and
// bootloaderErr.
function bootloaderWLog(isErr: boolean, ...inputs: any) {
	let message = "[skynet-kernel-bootloader]"
	for (let i = 0; i < inputs.length; i++) {
		message += "\n"
		message += tryStringify(inputs[i])
	}
	window.parent.postMessage(
		{
			method: "log",
			data: {
				isErr,
				message,
			},
		},
		"*" as any // tsc
	)
}
// Establish logging functions for the bootloader. The bootloader is in an
// iframe and can't console.log directly, so instead we need to send a message
// to the background and request that the background create the log message.
function log(...inputs: any) {
	bootloaderWLog(false, ...inputs)
}
function logErr(...inputs: any) {
	bootloaderWLog(true, ...inputs)
}

// Set up the message handler that will process messages coming from pages or
// from the background script.
var handleMessage = function (event: MessageEvent) {
	if (event.source === null) { // tsc
		return
	}

	// Check that there's a nonce.
	if (!("nonce" in event.data)) {
		event.source.postMessage({
			nonce: "N/A",
			method: "response",
			err: "message sent to kernel with no nonce",
		}, "*" as any) // tsc
		return
	}

	// Check that there's a method.
	if (!("method" in event.data)) {
		(event.source as WindowProxy).postMessage({
			nonce: event.data.nonce,
			method: "response",
			err: "message sent to kernel with no method",
		}, "*" as any) // tsc
		return
	}

	// Create default handlers for the requestOverride and proxyInfo
	// methods. These methods are important during bootloading to ensure
	// that the default login page can be loaded for the user.
	if (event.data.method === "requestOverride") {
		handleSkynetKernelRequestOverride(event)
		return
	}

	// Message that the method was not recognized.
	(event.source as WindowProxy).postMessage({
		nonce: event.data.nonce,
		method: "response",
		err: "unrecognized method (user may need to log in): " + event.data.method,
	}, "*" as any) // tsc
	return
}
window.addEventListener("message", (event: MessageEvent) => {
	handleMessage(event)
})

// handleSkynetKernelRequestOverride will respond to a request override
// message. This method will only respond to the browser extension, and it is
// used to trustlessly load the favicon.ico and the kernel auth page.
//
// As part of initializing this function, we launch a promise that fetches the
// favicon and the auth page so that we may send them to the background script
// at runtime.
let kernelFavicon: Uint8Array
let blockForFavicon: Promise<void> = new Promise((resolve) => {
	let faviconURL = browser.runtime.getURL("icon@2x.png")
	fetch(faviconURL).then((response) => {
		response.arrayBuffer().then((faviconData) => {
			kernelFavicon = new Uint8Array(faviconData)
			resolve()
		})
	})
	.catch(() => {
		// In the event of an error, just set the favicon to nothing.
		kernelFavicon = new Uint8Array(0)
		resolve()
	})
})
let kernelAuthPage: Uint8Array
let blockForAuthPage: Promise<void> = new Promise((resolve) => {
	let authURL = browser.runtime.getURL("auth.html")
	fetch(authURL).then((response) => {
		response.arrayBuffer().then((authData) => {
			kernelAuthPage = new Uint8Array(authData)
			resolve()
		})
	})
	.catch((err: any) => {
		authURL = new TextEncoder().encode(addContextToErr(err, "unable to load the kernel auth page"))
		resolve()
	})
})
function handleSkynetKernelRequestOverride(event: MessageEvent) {
	if (event.source === null) { // tsc
		return
	}

	// Only a browser extension is allowed to call requestOverride.
	if (!(event.origin.startsWith("moz"))) {
		return
	}
	// Check that this is for a GET request, all other types are not handled.
	if (event.data.data.method !== "GET") {
		return
	}

	// Establish the standard headers that we respond with.
	let respondOverride = function(headers: any, body: Uint8Array) { // tsc
		event.source!.postMessage({
			nonce: event.data.nonce,
			method: "response",
			err: null,
			data: {
				override: true,
				headers,
				body,
			},
		}, "*" as any) // tsc
	}

	// Set up a return value for the favicon.
	if (event.data.data.url === "http://kernel.skynet/favicon.ico") {
		blockForFavicon.then(() => {
			let headers  = [{
				name: "content-type",
				value: "image/png",
			}]
			respondOverride(headers, kernelFavicon)
		})
		return
	}

	// Set up a return value for the auth page.
	if (event.data.data.url === "http://kernel.skynet/auth.html") {
		blockForAuthPage.then(() => {
			let headers  = [{
				name: "content-type",
				value: "text/html; charset=utf8",
			}]
			respondOverride(headers, kernelAuthPage)
		})
		return
	}

	// The override request was not recognized, tell the extension not to
	// override this file.
	event.source.postMessage({
		nonce: event.data.nonce,
		method: "response",
		err: null,
		data: {
			override: false,
		},
	}, "*" as any) // tsc
}

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
				kernelLoaded: bootloaderKernelLoaded,
				logoutComplete: bootloaderLogoutComplete,
			},
		},
		"*" as any // tsc
	)
}
bootloaderSendAuthUpdate()
