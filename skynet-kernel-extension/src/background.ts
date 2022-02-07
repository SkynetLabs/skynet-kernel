export {}

declare var browser

// blockUntilKernelLoaded returns a promise that will not resolve until a
// message is received from the kernel saying that the kernel has loaded.
var kernelLoaded = false
function blockUntilKernelLoaded(): Promise<void> {
	return new Promise(resolve => {
		// Check if the kernel is loaded already.
		if (kernelLoaded) {
			resolve()
			return
		}

		// Wait 20 milliseconds and try again.
		setTimeout(function() {
			blockUntilKernelLoaded()
			.then(() => {
			      resolve()
			})
		}, 20)
	})
}

// Create a listener that will listen for messages from the kernel. The
// responses are keyed by a nonce, the caller passes the nonce to the kernel,
// and the kernel passes the nonce back. Responses are stored in the
// 'responses' object, and are expected to be deleted by the caller once
// consumed. The cpu and memory overheads associated with using an object to
// store responses are unknown.
var responses = new Object()
window.addEventListener("message", (event) => {
	// Ignore all messages that aren't coming from the kernel.
	if (event.origin !== "https://kernel.siasky.net") {
		console.log("received unwanted message from: ", event.origin)
		return
	}

	// Listen for the kernel successfully loading.
	if (event.data.kernelMethod === "skynetKernelLoaded") {
		kernelLoaded = true
		return
	}

	// Listen for a response from the kernel to a requestURL message and
	// store the response in the 'responses' object, keyed by the nonce of
	// the request.
	if (event.data.kernelMethod === "requestURLResponse") {
		responses[event.data.nonce] = event.data.response
		return
	}
}, false)

// blockForKernelResponse will wait until the kernel has responded to a
// particular nonce.
function blockForKernelResponse(nonce: number): Promise<Uint8Array> {
	return new Promise(resolve => {
		if (responses.hasOwnProperty(nonce)) {
			let resp = responses[nonce]
			delete responses[nonce]
			resolve(resp)
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

// getURLFromKernel will ask the kernel for the resource at a given URL,
// block until the kernel responds, and then return the response provided by
// the kernel.
//
// TODO: We need to make sure that the messageNonce is never used twice. I
// believe that the javascript threading model will prevent this from being an
// issue, but someone else should confirm.
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

// Swallow the repsonse headers and set the content-type to text/html. If we
// don't replace the response headers the portal can potentially introduce
// malicious information.
function setResponse(details) {
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
	setResponse,
	{urls: ["https://kernel.siasky.net/*", "https://home.siasky.net/*"]},
	["blocking", "responseHeaders"]
)

// Open an iframe containing the kernel.
var kernelFrame = document.createElement("iframe")
kernelFrame.src = "https://kernel.siasky.net"
kernelFrame.style.width = "0"
kernelFrame.style.height = "0"
kernelFrame.style.border = "none"
kernelFrame.style.position = "absolute"
document.body.appendChild(kernelFrame)
