export {}

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
function queryKernel(query, domain) {
	return new Promise((resolve, reject) => {
		blockUntilKernelLoaded
		.then(x => {
			// Grab the next nonce and store a promise resolution in the
			// kernelQueries object.
			let nonce = kernelQueriesNonce
			kernelQueriesNonce++
			query.nonce = nonce
			query.domain = domain
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
	// Grab the domain and pass it to the query function. The domain is
	// important to the kernel modules because they can selectively enable
	// or disable API endpoints based on the original domain of the caller.
	// The kernel itself will have to be responsible for checking that the
	// message is coming from the right browser extension.
	let domain = new URL(sender.url).hostname
	return new Promise((resolve, reject) => {
		// The kernel data already includes a 'queryStatus' which
		// indicates whether the content script should resolve or
		// reject. The content script is going to need to know to check
		// that status when picking a result for the corresponding
		// promise.
		queryKernel(message, domain)
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

// reloadKernel gets called if the kernel issues a signal indicating that it
// should be reloaded. That will be the last message emitted by the kernel
// until it is reloaded.
var reloading = false
function reloadKernel() {
	// Reset the kernel loading variables. This will cause all new messages
	// to block until the reload is complete.
	kernelLoadedResolved = false
	blockUntilKernelLoaded = new Promise(x => { kernelLoaded = x })
	kernelQueriesNonce = 1

	// Reset the kernelQueries array. All open queries need to be rejected,
	// as the kernel will no longer be processing them.
	Object.keys(kernelQueries).forEach((key, i) => {
		kernelQueries[key].reject("kernel was refreshed due to auth event")
		delete kernelQueries[key]
	})

	// If we reset the kernel immediately, there is a race condition where
	// the old kernel may have emitted a 'skynetKernelLoaded' message that
	// hasn't been processed yet. If that message gets processed before the
	// new kernel has loaded, we may start sending messages that will get
	// lost.
	//
	// To mitigate this risk, we wait a full second before reloading the
	// kernel. This gives the event loop a full second to reach any
	// messages which may be from the old kernel indicating that the kernel
	// finished loading. If a 'skynetKernelLoaded' message is received
	// while 'reloading' is set to false, it will be ignored.
	//
	// For UX, waiting a full second is not ideal, but this should only
	// happen in the rare event of a login or log out, something that a
	// user is expected to do less than once a month. I could not find any
	// other reliable way to ensure a 'skynetKernelLoaded' message would
	// not be processed incorrectly, and even this method is not totally
	// reliable.
	reloading = true
	setTimeout(function() {
		reloading = false
		// This is a neat trick to reload the iframe.
		kernelFrame.src += ''
	}, 1000)
}

// Create a handler for all kernel responses. The responses are all keyed by a
// nonce, which gets matched to a promise that's been stored in
// 'kernelQueries'.
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
	let method = event.data.kernelMethod

	// Check for the kernel requesting a log event.
	if (method === "log") {
		console.log(event.data.message)
		return
	}

	// If the kernel is reporting anything to indicate a change in auth
	// status, reload the extension.
	if (method === "authStatusChanged") {
		console.log("received authStatusChanged signal, reloading the kernel")
		reloadKernel()
		return
	}

	// Listen for the kernel successfully loading.
	if ((method === "skynetKernelLoaded" || method === "skynetKernelLoadedAuthFailed") && reloading === false) {
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
	if (!(event.data.nonce in kernelQueries)) {
		console.log("received a kernel message without a corresponding query\n", event.data)
		return
	}
	let result = kernelQueries[event.data.nonce]
	delete kernelQueries[event.data.nonce]
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
		console.log("swallowing kernel", details.url)
		let filter = browser.webRequest.filterResponseData(details.requestId)
		filter.onstart = event => {
			filter.close()
		}
		return {}
	}

	// Ignore all requests that aren't pointed at the skynet TLD.
	let domain = new URL(details.url).hostname
	let isSkynetTLD = domain.endsWith("skynet")
	let isKernelAuth = details.url === "https://kernel.siasky.net/auth.html"
	let isKernel = details.url === "https://kernel.siasky.net/"
	let isHome = details.url === "https://home.siasky.net/"
	if (!isSkynetTLD && !isKernelAuth && !isKernel && !isHome) {
		return
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

	// Ask the kernel what data should be loaded before grabbing the
	// response filter. The response filter can often take a while to
	// become active, so we can start the process of fetching the trusted
	// response from the kernel to keep things parallelized.
	console.log("asking kernel for", details.url)
	let query = queryKernel({
		kernelMethod: "requestGET",
		url: details.url,
	}, domain)

	// Grab the response data and replace it with the response from the
	// kernel.
	let filter = browser.webRequest.filterResponseData(details.requestId)
	filter.onstart = event => {
		query.then(response => {
			let resp = <any>response // TypeScript was being dumb.
			console.log("kernel gave us", resp.response)
			filter.write(resp.response)
			filter.close()
		})
		.catch(err => {
			console.log("requestGET query to kernel failed:", err)
		})
	}
}

// onHeadersReceivedListener will replace the headers provided by the portal
// with trusted headers, preventing the portal from providing potentially
// malicious information through the headers.
function onHeadersReceivedListener(details) {
	// Ignore anything thats not from the target URLs.
	if (!(new URL(details.url).hostname.endsWith("skynet")) && details.url !== "https://kernel.siasky.net/" && details.url !== "https://home.siasky.net/" && details.url !== "https://kernel.siasky.net/auth.html") {
		return details.responseHeaders
	}

	// For everything else, replace the headers.
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
	{urls: ["<all_urls>"]},
	["blocking"]
)

// Intercept the headers for all requests to kernel.siasky.net and
// home.siasky.net so that they can be replaced with the correct headers.
// Without this step, a portal can insert malicious headers that may alter how
// the code at these URLs behaves.
browser.webRequest.onHeadersReceived.addListener(
	onHeadersReceivedListener,
	{urls: ["<all_urls>"]},
	["blocking", "responseHeaders"]
)

// TODO: To help protect the privacy of users, we may also want to make
// something like an onBeforeSendHeaders listener that will swallow all headers
// being sent from the browser. We want the proxy server receiving as little
// information as possible.
//
// The ideal situation would be to swallow the request entirely and send no
// data at all, but I haven't figured out how to do that in a way that still
// allows the kernel to inject a response.

// Open an iframe containing the kernel.
var kernelFrame = document.createElement("iframe")
kernelFrame.src = "https://kernel.siasky.net"
document.body.appendChild(kernelFrame)
