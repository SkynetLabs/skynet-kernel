export {}

// TODO: Need to refresh the background script upon login. Need to make sure
// all other pages also refresh.

declare var browser

// blockUntilKernelLoaded is a promise that will resolve when the kernel sends
// a message indicating it has loaded. We store the resolve function in a
// global variable so the promise can be resolved by another frame.
var kernelLoaded
var kernelLoadedResolved = false
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

// Create a handler for all kernel responses. The responses are all keyed by a
// nonce, which gets matched to a promise that's been stored in
// 'kernelQueries'.
var reloading = false
function handleKernelResponse(event) {
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

	// If the kernel is reporting anything to indicate a change in auth
	// status, reload the extension.
	if (event.data.kernelMethod === "authFailedAfterLoad") {
		console.log("background is reloading because the auth failed after load")
		if (reloading === false) {
			setTimeout(browser.runtime.reload(), 100)
			reloading = true
		}
		return
	}
	if (event.data.kernelMethod === "authCompleted") {
		console.log("background is reloading because the auth has completed")
		if (reloading === false) {
			setTimeout(browser.runtime.reload(), 100)
			reloading = true
		}
		return
	}
	if (event.data.kernelMethod === "logOutSuccess") {
		console.log("background is reloading because the user has logged out")
		if (reloading === false) {
			setTimeout(browser.runtime.reload(), 100)
			reloading = true
		}
		return
	}

	// Listen for the kernel successfully loading.
	if (event.data.kernelMethod === "skynetKernelLoaded" || event.data.kernelMethod === "authFailed") {
		console.log("kernel has loaded")
		if (kernelLoadedResolved !== true) {
			kernelLoaded() // This is resolving a promise
			kernelLoadedResolved = true
		}
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

	// Resolve or reject the request based on the query status.
	if (!("queryStatus" in event.data)) {
		console.log("received a kernel message with no query status")
		return
	}
	if (event.data.queryStatus === "resolve") {
		result.resolve(event.data)
		return
	}
	if (event.data.queryStatus === "reject") {
		result.reject(event.data)
		return
	}
	console.log("received an invalid query status:", event.data.queryStatus)
}

// Create a listener to handle responses coming from the kernel.
window.addEventListener("message", handleKernelResponse)

// onBeforeRequestListener will handle calls from onBeforeRequest. Calls to the
// kernel will be swallowed and replaced by a content script. Calls to pages
// other than the kernel will be passed to the kernel, and the kernel will
// decide what response is appropriate for the provided call.
function onBeforeRequestListener(details) {
	// If the request is specifically for the kernel iframe, we need to
	// swallow the request and let the content script do all of the work.
	if (details.url === "https://kernel.siasky.net/") {
		let filter = browser.webRequest.filterResponseData(details.requestId)
		filter.onstart = event => {
			filter.close()
		}
		return {}
	}

	// Ignore all requests that are not GET requests - we let these
	// requests complete like normal.
	//
	// NOTE: We intend to intercept all other types of requests as well in
	// the future, but for now we're only worrying about GET requests to
	// keep things simpler.
	if (details.method !== "GET") {
		return
	}

	// Ask the kernel what the appropriate response for this URL is.
	//
	// TODO: Need to conform this to the new messaging style.
	console.log("doing an injection\n", details.originUrl, "\n", details.url)
	let filter = browser.webRequest.filterResponseData(details.requestId)
	filter.ondata = event => {
		console.log("filtering for request")
		queryKernel({
			kernelMethod: "requestGET",
			url: details.url,
		})
		.then(response => {
			console.log("got a response for homepage")
			console.log(response)
			let resp = <any>response // TypeScript was being dumb.
			filter.write(resp.response)
			filter.close()
		})
		.catch(err => {
			console.log("requestGET query to kernel failed:", err)
		})
		console.log("queryKernel has been called")
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
	{urls: ["https://kernel.siasky.net/*", "https://home.siasky.net/*", "https://test.siasky.net/*"]},
	["blocking", "responseHeaders"]
)

// Open an iframe containing the kernel.
var kernelFrame = document.createElement("iframe")
kernelFrame.src = "https://kernel.siasky.net"
document.body.appendChild(kernelFrame)
