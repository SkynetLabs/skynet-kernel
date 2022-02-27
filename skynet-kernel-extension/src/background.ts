export {}

declare var browser

// blockUntilKernelLoaded is a promise that will resolve when the kernel sends
// a message indicating it has loaded. We store the resolve function in a
// global variable so the promise can be resolved by another frame.
var kernelLoaded
var blockUntilKernelLoaded = new Promise(x => { kernelLoaded = x })

// queryKernel returns a promise that will resolve when the kernel has
// responded to the query. The resolve function is stored in the kernelQueries
// object using the nonce as the key. It will be called by the listener that
// receives the kernel's response.
var kernelQueriesNonce = 1
var kernelQueries = new Object()
function queryKernel(query) {
	return new Promise((resolve, reject) => {
		blockUntilKernelLoaded
		.then(x => {
			// Grab the next nonce and store a promise resolution in the
			// kernelQueries object.
			let nonce = kernelQueriesNonce
			kernelQueriesNonce++
			query.nonce = nonce
			kernelQueries[nonce] = {resolve, reject}
			kernelFrame.contentWindow.postMessage(query, "https://kernel.siasky.net")
		})
	})
}

// contentScriptListener will receive and handle messages coming from content
// scripts. This is largely a passthrough function which sends messages to the
// kernel, and then relays the responses back to the content script.
//
// Because we communicate to the content script through runtime.sendmessage, we
// actaully cannot call 'reject' on the promise - if we do, the error will be
// corrupted as it gets swallowed and replaced by another error related to the
// background script being available. Instead, we call 'resolve' in both cases,
// but send an object that indicates an error.
//
// TODO: This might actually be a bug with Firefox, intuitively it seems like
// (including from reading the spec) we should be able to call 'reject' in the
// .catch and have the error pass through correctly. But it's not, we get a
// clone error even for simple objects like strings.
function contentScriptListener(message, sender) {
	return new Promise((resolve, reject) => {
		// The kernel data already includes a 'queryStatus' which
		// indicates whether the content script should resolve or
		// reject. The content script is going to need to know to check
		// that status when picking a result for the corresponding
		// promise.
		queryKernel(message)
		.then(resp => {
			resolve(resp)
		})
		.catch(err => {
			resolve(err)
		})
	})
}

// Add a listener that will catch messages from content scripts.
browser.runtime.onMessage.addListener(contentScriptListener)

// Create a listener that will listen for messages from the kernel. The
// responses are keyed by a nonce, the caller passes the nonce to the kernel,
// and the kernel passes the nonce back. Responses are stored in the
// 'responses' object, and are expected to be deleted by the caller once
// consumed. The cpu and memory overheads associated with using an object to
// store responses are unknown.
window.addEventListener("message", (event) => {
	// Ignore all messages that aren't coming from the kernel.
	if (event.origin !== "https://kernel.siasky.net") {
		console.log("received unwanted message from: ", event.origin, "\n", event)
		return
	}
	if (!("kernelMethod" in event.data) || typeof event.data.kernelMethod !== "string") {
		console.log("received message without a kernelMethod\n", event.data)
		return
	}
	if (event.data.kernelMethod === "log") {
		console.log(event.data.message)
		return
	}

	// Listen for the kernel successfully loading.
	if (event.data.kernelMethod === "skynetKernelLoaded") {
		console.log("kernel has loaded")
		kernelLoaded() // This is resolving a promise
		return
	}

	// Grab the nonce, determine the status of the response, and then
	// resolve or reject accordingly.
	if (!("nonce" in event.data) || typeof event.data.nonce !== "number") {
		console.log("received a kernel message without a nonce\n", event.data)
		return
	}
	let result = kernelQueries[event.data.nonce]
	delete kernelQueries[event.data.nonce]
	if (event.data.queryStatus === "resolve") {
		result.resolve(event.data)
		return
	}
	if (event.data.queryStatus === "reject") {
		result.reject(event.data)
		return
	}
}, false)

// onBeforeRequestListener will handle calls from onBeforeRequest. Calls to the
// kernel will be swallowed and replaced by a content script. Calls to pages
// other than the kernel will be passed to the kernel, and the kernel will
// decide what response is appropriate for the provided call.
//
// TODO: Needs work. Only kernel.siasky.net should be excluded, plus maybe an
// auth page. Need to be able to process all types of requests, not just GET
// requests.
function onBeforeRequestListener(details) {
	// TODO: Switch to checking === kernel.siasky.net
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
		queryKernel({
			kernelMethod: "requestURL",
			url: details.url,
		})
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

// Open an iframe containing the kernel.
var kernelFrame = document.createElement("iframe")
kernelFrame.src = "https://kernel.siasky.net"
kernelFrame.style.width = "0"
kernelFrame.style.height = "0"
kernelFrame.style.border = "none"
kernelFrame.style.position = "absolute"
document.body.appendChild(kernelFrame)
