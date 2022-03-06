export {}

declare var browser

// composeErr takes a series of inputs and composes them into a single string.
// Each element will be separated by a newline. If the input is not a string,
// it will be transformed into a string with JSON.stringify.
//
// Any object that cannot be stringified will be skipped, though an error will
// be logged.
function composeErr(...inputs: any): string {
	let result = "";
	for (let i = 0; i < inputs.length; i++) {
		// Prepend a newline if this isn't the first element.
		if (i !== 0) {
			result += "\n"
		}
		// Strings can be added without modification.
		if (typeof inputs[i] === "string") {
			result += inputs[i]
			continue
		}
		// Everything else needs to be stringified, log an error if it
		// fails.
		try {
			let str = JSON.stringify(inputs[i])
			result += str
		} catch {
			console.error("unable to stringify input to composeErr")
		}
	}
	return result
}

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
//
// NOTE: the queriesNonce and queries object is also shared by the
// bridgeListener.
//
// NOTE: queryKernel cannot be used if you need queryUpdates or
// responseUpdates, it's only intended to be used with single-message queries.
var queriesNonce = 1
var queries = new Object()
function queryKernel(query) {
	return new Promise((resolve, reject) => {
		let nonce = queriesNonce
		queriesNonce += 1
		let respond = function(data) {
			if (!("method" in data)) {
				console.error("received response without a method field", data)
				let cErr = composeErr("received response without a method field", data)
				reject(cErr)
				return
			}
			if (data.method !== "response") {
				console.error("received bad method, incompatible with queryKernel", data)
				let cErr = composeErr("received bad method in queryKernel", data)
				reject(cErr)
				return
			}
			if (!("err" in data)) {
				let cErr = composeErr("received response with no defined error", data)
				console.error("received response with no defined error", data)
				reject(cErr)
				return
			}
			if (data.err !== null) {
				let cErr = composeErr("queryKernel received an error", data.err)
				reject(cErr)
				return
			}
			resolve(data)
		}
		blockUntilKernelLoaded
		.then(x => {
			// Grab the next nonce and store a promise resolution in the
			// kernelQueries object.
			query.nonce = nonce
			queries[nonce] = respond
			kernelFrame.contentWindow.postMessage(query, "http://kernel.skynet")
		})
	})
}

// bridgeBridgeMessage and the related functions will receive and handle
// messages coming from the bridge. Note that many instances of the bridge can
// exist across many different web pages.
function handleBridgeMessage(port: any, data: any, domain: string) {
	// Input sanitization.
	if (!("nonce" in data)) {
		console.error("received message from", domain, "with no nonce")
		return
	}
	let originalNonce = data.nonce

	// Build the functions that will respond to any messages that come from
	// the kernel.
	//
	// NOTE: This has been structured so that you can use the same function
	// for both responseUpdate messages and also response messages.
	let respond = function(response) {
		response.nonce = originalNonce
		port.postMessage(response)
	}

	blockUntilKernelLoaded
	.then(x => {
		// Grab the next nonce and store a promise resolution in the
		// queries object.
		let nonce = queriesNonce
		queriesNonce += 1
		queries[nonce] = respond
		data.nonce = nonce
		kernelFrame.contentWindow.postMessage(data, "http://kernel.skynet")
	})
}
function bridgeListener(port) {
	// Grab the domain of the webpage that's connecting to the background
	// page. The kernel needs to know the domain so that it can
	// conditionally apply restrictions or grant priviledges based on the
	// domain. This is especially important for modules, as admin access to
	// control the data of a module is typically only granted to a single
	// web domain.
	let domain = new URL(port.sender.url).hostname
	port.onMessage.addListener(function(data) { handleBridgeMessage(port, data, domain) })
}
// Add a listener that will catch messages from content scripts.
browser.runtime.onConnect.addListener(bridgeListener)

// reloadKernel gets called if the kernel issues a signal indicating that it
// should be reloaded. That will be the last message emitted by the kernel
// until it is reloaded.
var reloading = false
function reloadKernel() {
	// Reset the kernel loading variables. This will cause all new messages
	// to block until the reload is complete.
	kernelLoadedResolved = false
	blockUntilKernelLoaded = new Promise(x => { kernelLoaded = x })
	queriesNonce = 1

	// Reset the queries array. All open queries need to be rejected, as
	// the kernel will no longer be processing them.
	Object.keys(queries).forEach((key, i) => {
		queries[key].respond({
			nonce: queries[key].nonce,
			method: "response",
			err: "kernel was refreshed due to auth event, query has been cancelled",
		})
		delete queries[key]
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
// nonce, which gets matched to a promise that's been stored in 'queries'.
function handleKernelResponse(event) {
	// Ignore all messages that aren't coming from the kernel.
	if (event.origin !== "http://kernel.skynet") {
		console.log("ignoring a message for not coming from the kernel", event.data)
		return
	}
	if (!("method" in event.data) || typeof event.data.method !== "string") {
		console.log("received message without a method\n", event.data)
		return
	}
	let method = event.data.method

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

	// The only other methods we are expecting from the kernel are
	// 'response' and 'responseUpdate'.
	if (method !== "response" && method !== "responseUpdate") {
		console.error("received a message from the kernel with unrecognized method:", event.data)
		return
	}

	// Grab the nonce, determine the status of the response, and then
	// resolve or reject accordingly.
	if (!("nonce" in event.data) || typeof event.data.nonce !== "number") {
		console.log("received a kernel message without a nonce\n", event.data)
		return
	}
	if (!(event.data.nonce in queries)) {
		console.log("received a kernel message without a corresponding query\n", event.data)
		return
	}
	let result = queries[event.data.nonce]
	if (method === "response") {
		delete queries[event.data.nonce]
	}
	result(event.data)
}
// Create a listener to handle responses coming from the kernel.
window.addEventListener("message", handleKernelResponse)

// onBeforeRequestListener will handle calls from onBeforeRequest. Calls to the
// kernel will be swallowed and replaced by a content script. Calls to pages
// other than the kernel will be passed to the kernel, and the kernel will
// decide what response is appropriate for the provided call.
let headers: any = new Object()
function onBeforeRequestListener(details) {
	// If the request is specifically for the kernel iframe, we need to
	// swallow the request and let the content script do all of the work.
	if (details.url === "http://kernel.skynet/") {
		let filter = browser.webRequest.filterResponseData(details.requestId)
		filter.onstart = event => {
			filter.close()
		}
		return {}
	}

	// Ask the kernel what data should be loaded before grabbing the
	// response filter. The response filter can often take a while to
	// become active, so we can start the process of fetching the trusted
	// response from the kernel to keep things parallelized.
	let query = queryKernel({
		method: "requestOverride",
		data: {
			url: details.url,
			method: details.method,
		},
	})

	// Grab the response data and replace it with the response from the
	// kernel.
	let filter = browser.webRequest.filterResponseData(details.requestId)
	filter.onstart = event => {
		query.then((response: any) => {
			if (!("data" in response) || !("override" in response.data)) {
				console.error("requestOverride response has no 'override' field\n", response)
				filter.disconnect()
				return
			}
			if (response.data.override !== "true") {
				filter.disconnect()
				return
			}
			if (!("body" in response.data)) {
				console.error("requestOverride response is missing 'body' field\n", response)
				filter.disconnect()
				return
			}
			if (!("headers" in response.data)) {
				console.error("requestOverride response is missing 'headers' field\n", response)
				filter.disconnect()
				return
			}
			filter.write(response.body)
			filter.close()
			headers[details.requestId] = response.headers
		})
		.catch(err => {
			console.log("requestOverride query to kernel failed:", err)
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
	// Check if a prior lookup to the kernel established some headers for
	// this request.
	if (!(details.requestId in headers)) {
		return
	}
	let h = headers[details.requestId]
	delete headers[details.requestId]
	return {responseHeaders: h}
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
// TODO: Need to add an extension-level override for the proxy destination. The
// kernel reports one option for where the proxy should go, but for example you
// can massively speed up skynet by setting up a proxy server on localhost and
// pointing to that. The kernel is global, but the proxy server will only be
// available on one machine. Therefore, you need to be able to configure on a
// per-machine level (meaning, through the extension not through the kernel)
// where the proxies should redirect to. Defintely a post-launch sort of thing.
function handleProxyRequest(info) {
	// Hardcode an exception for 'kernel.skynet'. We need this exception
	// because that's where the kernel exists, and the kernel needs to be
	// loaded before we can ask the kernel whether we should be proxying
	// something.
	//
	// TODO: We need some sort of failover resiliency here. The major
	// challenge that I see is identifying when the primary destination is
	// down / unusable. If we can easily know if it's up or down, we can
	// easily swap in a failover url. And we will also want some sort of
	// in-extenion UI that allows the user to set their failover options.
	// And we'll also want to load the set of failover options from
	// localstorage, and get that list of failover options from the kernel.
	let hostname = new URL(info.url).hostname
	if (hostname === "kernel.skynet") {
		return {type: "http", host: "skynetfree.net", port: 80}
	}

	// Ask the kernel whether there should be a proxy for this url. We use
	// the empty string as the domain of the query because the kernel is
	// going to ignore that value anyway.
	let query = queryKernel({
		method: "proxyInfo",
		data: { url: info.url },
	})
	query.then((response: any) => {
		// Input sanitization.
		if (!("data" in response)) {
			console.error("kernel did not include a 'data' field in the data\n", response)
			return {type: "direct"}
		}
		let data = response.data
		if (!("proxy" in data) || typeof data.proxy !== "boolean") {
			console.error("kernel did not include a 'proxy' in the data\n", response)
			return {type: "direct"}
		}
		if (data.proxy === false) {
			return {type: "direct"}
		}
		if (!("destinationType" in data) || typeof data.destinationType !== "string") {
			console.error("kernel did not include a destinationType in the data\n", response)
			return {type: "direct"}
		}
		if (!("destinationHost" in data) || typeof data.destinationHost !== "string") {
			console.error("kernel did not include a destinationHost in the data\n", response)
			return {type: "direct"}
		}
		if (!("destinationPort" in data) || typeof data.destinationPort !== "number") {
			console.error("kernel did not include a destinationPort in the data\n", response)
			return {type: "direct"}
		}
		return {
			type: data.destinationType,
			host: data.destinationHost,
			port: data.destinationPort,
		}
	})
	.catch(errQK => {
		console.error("error after sending proxyInfo message:", errQK)
		return {type: "direct"}
	})
}
browser.proxy.onRequest.addListener(handleProxyRequest, {urls: ["<all_urls>"]})

// Open an iframe containing the kernel.
var kernelFrame = document.createElement("iframe")
kernelFrame.src = "http://kernel.skynet"
document.body.appendChild(kernelFrame)
