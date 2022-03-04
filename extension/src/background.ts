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
			kernelFrame.contentWindow.postMessage(query, "http://kernel.skynet")
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
	// Grab the domain and add it to the message. The domain is important
	// to the kernel modules because they can selectively enable or disable
	// API endpoints based on the original domain of the caller. The
	// kernel itself will have to be responsible for checking that the
	// message is coming from the right browser extension.
	let domain = new URL(sender.url).hostname
	message.domain = domain
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
	// For UX, waiting 300 milliseconds is not ideal, but this should only
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
	}, 300)
}

// Create a handler for all kernel responses. The responses are all keyed by a
// nonce, which gets matched to a promise that's been stored in
// 'kernelQueries'.
function handleKernelResponse(event) {
	// Ignore all messages that aren't coming from the kernel.
	if (event.origin !== "http://kernel.skynet") {
		return
	}
	if (!("kernelMethod" in event.data) || typeof event.data.kernelMethod !== "string") {
		console.log("received message without a kernelMethod\n", event.data)
		return
	}
	let method = event.data.kernelMethod

	// Check for the kernel requesting a log event. This infrastructure is
	// in place because calling 'console.log' from the kernel itself does
	// not seem to result in the log actually getting displayed in the
	// console of the background page.
	if (method === "log") {
		console.log(event.data.message)
		return
	}
	if (method === "logErr") {
		console.error(event.data.message)
		return
	}

	// If the kernel is reporting anything to indicate a change in auth
	// status, reload the extension.
	if (method === "authStatusChanged") {
		console.log("received authStatusChanged signal, reloading the kernel")
		reloadKernel()
		return
	}

	// Listen for the kernel successfully loading. If we know that a
	// reloading signal was received, we will ignore messages indicating
	// that the kernel has loaded, because those messages are from the
	// previous kernel, which we have already reset.
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
		console.log("received a kernel message with no query status", event.data)
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
	if (details.url === "http://kernel.skynet/") {
		console.log("emtpying things out")
		let filter = browser.webRequest.filterResponseData(details.requestId)
		filter.onstart = event => {
			filter.close()
		}
		return {}
	}

	// Ignore all requests that aren't pointed at the skynet TLD.
	//
	// TODO: Adjust this so that instead the kernel can respond with a
	// message indicating that it's an ignored TLD.
	let isSkynetTLD = new URL(details.url).hostname.endsWith("skynet")
	if (!isSkynetTLD) {
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
	})

	// Grab the response data and replace it with the response from the
	// kernel.
	let filter = browser.webRequest.filterResponseData(details.requestId)
	filter.onstart = event => {
		query.then((response: any) => {
			filter.write(response.response)
			filter.close()
		})
		.catch(err => {
			console.log("requestGET query to kernel failed:", err)
		})
	}
}
browser.webRequest.onBeforeRequest.addListener(
	onBeforeRequestListener,
	{urls: ["<all_urls>"]},
	["blocking"]
)

// onHeadersReceivedListener will replace the headers provided by the portal
// with trusted headers, preventing the portal from providing potentially
// malicious information through the headers.
//
// TODO: Adjust this function with calls to the kernel so that the kernel is
// making the ultimate decisions on what headers are being injected and
// replaced.
function onHeadersReceivedListener(details) {
	// Ignore anything thats not from the target URLs.
	if (!(new URL(details.url).hostname.endsWith("skynet"))) {
		return details.responseHeaders
	}

	// Replace the headers.
	//
	// TODO: We're going to need to modify this function to look at the
	// skylink in the response so that we know what headers should be in
	// place.
	console.log("replacing headers for:", details.url)
	let newHeaders = [
		{
			name: "content-type",
			value: "text/html; charset=utf8"
		}
	]
	return {responseHeaders: newHeaders}
}
browser.webRequest.onHeadersReceived.addListener(
	onHeadersReceivedListener,
	{urls: ["<all_urls>"]},
	["blocking", "responseHeaders"]
)

// Establish a proxy that enables the user to visit non-existent TLDs, such as
// '.hns' and '.eth' and '.skynet'. The main idea behind this proxy is that we
// proxy non-existant URLs to a URL that does exist, so that the page still
// loads.
//
// We use proxies as a workaround for a fundamental limitation of
// onBeforeRequest - you cannot replace or inject a webpage that does not
// exist. We can't support imaginary domains like 'kernel.skynet' without a
// proxy because they don't actually exist, which means any calls to
// 'filter.write()' in an 'onBeforeRequest' response will fail. If we could
// cancel a request in onBeforeRequest while also still being able to write a
// response and injecting headers with 'onHeadersReceived', we could drop the
// proxy requirement.
//
// Similary, we need to use 'type: "http"' instead of 'type: "https"' because
// the proxy server does not have TLS certs for the imaginary domains. This
// will result in the user getting an insecure icon in the corner of their
// browser. Even though the browser thinks the communication is insecure, the
// truth is that the whole page is being loaded from a secure context (the
// kerenl) and is being authenticated and often (though not always) encrypted
// over transport. So the user is safe from MitM attacks and some forms of
// snooping despite the insecure warning.
//
// The proxy itself has a hard-coded carve-out for 'kernel.skynet' to allow the
// kernel to load, and all other requests are routed to the kernel so that the
// kernel can decide whether a proxy should be used for that page.
//
// TODO: We need a kernel level ability for the user to change which proxy they
// use by default for all of their machines. We also need an extension level
// override for this default so the user can make a change for just one
// machine. We may be able to do that with kernel messages as well. For now,
// there is no configurability.
function handleProxyRequest(info) {
	// Hardcode an exception for 'kernel.skynet'. We need this exception
	// because that's where the kernel exists, and the kernel needs to be
	// loaded before we can ask the kernel whether we should be proxying
	// something.
	let hostname = new URL(info.url).hostname
	if (hostname === "kernel.skynet") {
		return {type: "http", host: "siasky.net", port: 80}
	}

	// Ask the kernel whether there should be a proxy for this url. We use
	// the empty string as the domain of the query because the kernel is
	// going to ignore that value anyway.
	let query = queryKernel({
		kernelMethod: "requestDNS",
		url: info.url,
	})
	query.then((response: any) => {
		// Input sanitization.
		if (!("proxy" in response)) {
			console.error("kernel did not include a 'proxy' in the response")
			return {type: "direct"}
		}
		if (response.proxy === true) {
			return {type: "http", host: "siasky.net", port: 80}
		} else {
			return {type: "direct"}
		}
	})
	.catch(errQK => {
		console.error("error after sending requestDNS message:", errQK)
		return {type: "direct"}
	})
}
browser.proxy.onRequest.addListener(handleProxyRequest, {urls: ["<all_urls>"]})

// Open an iframe containing the kernel.
var kernelFrame = document.createElement("iframe")
kernelFrame.src = "http://kernel.skynet"
document.body.appendChild(kernelFrame)
