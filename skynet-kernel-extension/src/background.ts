export {}

declare var browser

// TODO: The way that we are providing the kernel responses is insufficient. We
// can strip the nonce, but everything else should stay. Right now it's more
// ad-hoc.

// blockUntilKernelLoaded returns a promise that will not resolve until a
// message is received from the kernel saying that the kernel has loaded.
var kernelLoadedResolve
var kernelLoadedPromise = new Promise((resolve, reject) => {
	kernelLoadedResolve = resolve
})
function blockUntilKernelLoaded() {
	return kernelLoadedPromise
}

// blockForKernelResponse will wait until the kernel has responded to a
// particular nonce. The response will be stored in the object with the nonce
// as the key.
//
// TODO: I'm not confident this is memory efficient. Responses can get large.
// We delete the responses from the object, but if that doesn't actually clear
// up the memory we have a substantial memory leak in the extension. It'd also
// be nice to eliminate the timeout that sleeps 20 milliseconds at a time, but
// I'm not sure how to accomplish that.
var responses = new Object()
function blockForKernelResponse(nonce: number): Promise<Uint8Array> {
	return new Promise(resolve => {
		if (responses.hasOwnProperty(nonce)) {
			let resp = responses[nonce]
			delete responses[nonce]
			resolve(resp)
			console.log("resolved\n", nonce, "\n", resp)
		} else {
			setTimeout(function() {
				blockForKernelResponse(nonce)
				.then(x => {
				      resolve(x)
				})
			}, 20)
		}
	})
}

// contentScriptListener will receive and handle messages coming from content
// scripts. This is largely a passthrough function which sends messages to the
// kernel, and then relays the responses back to the content script.
function contentScriptListener(message, sender, sendResponse) {
	blockUntilKernelLoaded()
	.then(x => {
		let nonce = messageNonce
		messageNonce++
		message.nonce = nonce
		kernelFrame.contentWindow.postMessage(message, "https://kernel.siasky.net")

		console.log("blocking for nonce", nonce)
		blockForKernelResponse(nonce)
		.then(resp => {
			console.log("sending a response for nonce", nonce)
			sendResponse(resp)
		})
	})
	console.log("existing main thread")
	return true
}

// getURLFromKernel will ask the kernel for the resource at a given URL,
// block until the kernel responds, and then return the response provided by
// the kernel.
var messageNonce = 0
function getURLFromKernel(url: string): Promise<Uint8Array> {
	return new Promise(resolve => {
		// All requests need to stall until the kernel has loaded.
		blockUntilKernelLoaded()
		.then(x => {
			// Send a mesasge to the kernel asking for the
			// resource.
			let nonce = messageNonce
			messageNonce++
			kernelFrame.contentWindow.postMessage({
				kernelMethod: "requestURL",
				nonce: nonce,
			}, "https://kernel.siasky.net")

			// Wait for a response from the kernel, and then
			// resolve with the response.
			blockForKernelResponse(nonce)
			.then(resp => {
				resolve(resp)
			})
		})
	})
}

// onBeforeRequestListener will handle calls from onBeforeRequest. Calls to the
// kernel will be swallowed and replaced by a content script. Calls to pages
// other than the kernel will be passed to the kernel, and the kernel will
// decide what response is appropriate for the provided call.
function onBeforeRequestListener(details) {
	// TODO: This should eventually only check for the kernel, allowing all
	// other calls to pass through. The current architecture hard-codes
	// several pages in the extension, and we haven't migrated them out
	// yet.
	if (details.url !== "https://test.siasky.net/") {
		let filter = browser.webRequest.filterResponseData(details.requestId)
		filter.onstart = event => {
			filter.close()
		}
		return {}
	}

	// Ask the kernel what the appropriate response for this URL is.
	let filter = browser.webRequest.filterResponseData(details.requestId)
	filter.ondata = event => {
		getURLFromKernel(details.url)
		.then(response => {
			filter.write(response)
			filter.close()
		})
	}
}

// onHeadersReceivedListener will replace the headers provided by the portal
// with trusted headers, preventing the portal from providing potentially
// malicious information through the headers.
function onHeadersReceivedListener(details) {
	let newHeaders = [
		{
			name: "content-type",
			value: "text/html; charset=utf8"
		}
	]
	return {responseHeaders: newHeaders}
}

// Intercept all requests to kernel.siasky.net and home.siasky.net so that they
// can be replaced with trusted code. We need to be confident about the exact
// code that is running at these URLs, as the user will be trusting their data
// and crypto keys to these webpages.
//
// TODO: I believe that we need to catch any http requests and either redirect
// or cancel them.
browser.webRequest.onBeforeRequest.addListener(
	onBeforeRequestListener,
	{urls: ["https://kernel.siasky.net/*", "https://home.siasky.net/*", "https://test.siasky.net/*"]},
	["blocking"]
)

// Intercept the headers for all requests to kernel.siasky.net and
// home.siasky.net so that they can be replaced with the correct headers.
// Without this step, a portal can insert malicious headers that may alter how
// the code at these URLs behaves.
browser.webRequest.onHeadersReceived.addListener(
	onHeadersReceivedListener,
	{urls: ["https://kernel.siasky.net/*", "https://home.siasky.net/*"]},
	["blocking", "responseHeaders"]
)

// Add a listener that will catch messages from content scripts.
browser.runtime.onMessage.addListener(contentScriptListener)

// Create a listener that will listen for messages from the kernel. The
// responses are keyed by a nonce, the caller passes the nonce to the kernel,
// and the kernel passes the nonce back. Responses are stored in the
// 'responses' object, and are expected to be deleted by the caller once
// consumed. The cpu and memory overheads associated with using an object to
// store responses are unknown.
//
// TODO: Need some way to distinguish between responses that need to be added
// to the response object, and responses that can be directly forwarded to some
// caller. And I guess we need to know what caller we are forwarding things to.
window.addEventListener("message", (event) => {
	// Ignore all messages that aren't coming from the kernel.
	if (event.origin !== "https://kernel.siasky.net") {
		console.log("received unwanted message from: ", event.origin)
		console.log(event)
		return
	}

	if (!("kernelMethod" in event.data)) {
		console.log("received message without a kernelMethod")
		return
	}

	// Listen for the kernel successfully loading.
	if (event.data.kernelMethod === "skynetKernelLoaded") {
		console.log("background script kernel has loaded")
		kernelLoadedResolve()
		return
	}

	// Check that the response has a nonce.
	if (!("nonce" in event.data)) {
		console.log("received a kernel message without a nonce")
		return
	}

	// All other kernel requests are assumed to be associeted with a
	// response.
	console.log("setting nonce\n", event.data.nonce, "\n", event.data.response, "\n", event.data)
	responses[event.data.nonce] = event.data.response
}, false)

// Open an iframe containing the kernel.
var kernelFrame = document.createElement("iframe")
kernelFrame.src = "https://kernel.siasky.net"
kernelFrame.style.width = "0"
kernelFrame.style.height = "0"
kernelFrame.style.border = "none"
kernelFrame.style.position = "absolute"
document.body.appendChild(kernelFrame)
