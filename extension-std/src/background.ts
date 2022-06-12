import { composeErr, dataFn } from "libskynet"

// Need to declare the browser to make typescript happy. 'any' is used as the
// type because typescript didn't seem to recognize the browser type.
declare let browser: any

// Messages cannot be sent to the kernel until the kernel has indicated that it
// is ready to receive messages. We create a promise here that will resovle
// when the kernel sends us a message indicating that it is ready to receive
// messages.
let kernelReadyResolved = false
let kernelReadyResolve: dataFn
let blockForKernel = new Promise((resolve) => {
	kernelReadyResolve = resolve
})

// Create a blocking function to know the auth status of the kernel.
let authStatus: any // matches the data field of the kernelAuthStatus message
let authStatusKnown = false
let authStatusResolve: dataFn
let blockForAuthStatus = new Promise((resolve) => {
	authStatusResolve = resolve
})

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
let queriesNonce = 1
let queries: any = new Object()
function queryKernel(query: any) {
	return new Promise((resolve, reject) => {
		let nonce = queriesNonce
		queriesNonce += 1
		let respond = function (data: any) {
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
		blockForKernel.then(() => {
			// Grab the next nonce and store a promise resolution in the
			// kernelQueries object.
			query.nonce = nonce
			queries[nonce] = respond
			kernelFrame.contentWindow.postMessage(query, "http://kernel.skynet")
		})
	})
}

// handleBridgeMessage and the related functions will receive and handle
// messages coming from the bridge. Note that many instances of the bridge can
// exist across many different web pages.
function handleBridgeMessage(port: any, data: any, domain: string) {
	// Check that the message has a nonce and therefore can receive a response.
	if (!("nonce" in data)) {
		console.error("received message from", domain, "with no nonce")
		return
	}

	// Establish the method that can be used to provide the kernel response and
	// responseUpdates to the caller.
	let respond = function (response: any) {
		port.postMessage(response)
	}

	// If the message is not a queryUpdate, we set the domain of the message
	// and we set the response function in the queries map. The domain needs to
	// be set so that the kernel knows the domain of the app sending the
	// request.
	//
	// These fields can be skipped for a queryUpdate because they were already
	// sent in the original query.
	if (data.method !== "queryUpdate") {
		queries[data.nonce] = respond
		data["domain"] = domain
	}
	kernelFrame.contentWindow.postMessage(data, "http://kernel.skynet")
}
function bridgeListener(port: any) {
	// Grab the domain of the webpage that's connecting to the background
	// page. The kernel needs to know the domain so that it can
	// conditionally apply restrictions or grant priviledges based on the
	// domain. This is especially important for modules, as admin access to
	// control the data of a module is typically only granted to a single
	// web domain.
	let domain = new URL(port.sender.url).hostname

	// Add a listener to grab messages that are sent over the port.
	port.onMessage.addListener(function (data: any) {
		handleBridgeMessage(port, data, domain)
	})

	// Send a message down the port containing the current auth status of the
	// kernel. If a new webpage is just connecting to the kernel it's not going
	// to know the status, we have to tell it.
	blockForAuthStatus.then(() => {
		port.postMessage({
			method: "kernelAuthStatus",
			data: authStatus,
		})
	})
}
// Add a listener that will catch messages from content scripts.
browser.runtime.onConnect.addListener(bridgeListener)

// Create a handler for all kernel responses. The responses are all keyed by a
// nonce, which gets matched to a promise that's been stored in 'queries'.
function handleKernelResponse(event: any) {
	// Ignore all messages that aren't coming from the kernel.
	if (event.origin !== "http://kernel.skynet") {
		return
	}
	if (!("method" in event.data) || typeof event.data.method !== "string") {
		return
	}
	let data = event.data
	let method = data.method

	// Check for the kernel requesting a log event. This infrastructure is
	// in place because calling 'console.log' from the kernel itself does
	// not seem to result in the log actually getting displayed in the
	// console of the background page.
	if (method === "log") {
		if (!("data" in data) || !("isErr" in data.data) || typeof data.data.isErr !== "boolean") {
			console.error("kernel sent a log message with no 'isErr' field", data)
			return
		}
		if (!("message" in data.data)) {
			console.error("kernel sent a log message with no 'message' field", data)
			return
		}
		if (data.data.isErr === false) {
			console.log(data.data.message)
		} else {
			console.error(data.data.message)
		}
		return
	}

	// Process any auth message.
	if (method === "kernelAuthStatus") {
		// TODO: Need to pass this auth message to all ports that are connected
		// to the background.

		// Signal that the auth status is known if this is the first auth
		// status message.
		if (authStatusKnown === false) {
			authStatusKnown = true
			authStatus = data
			authStatusResolve()
		}

		// If the kernel has finished loading, we can unblock the loading
		// promise and start sending kernel messages.
		if (kernelReadyResolved === false) {
			kernelReadyResolved = true
			kernelReadyResolve()
		}

		// If the kernel is signaling that there has been a logout, reload the
		// iframe to reset both the kernel and the background state. A hard
		// refresh isn't strictly necessary but it guarantees that old items
		// are cleaned up properly.
		if (data.logoutComplete === true) {
			window.location.reload()
			return
		}
		return
	}

	// The only other methods we are expecting from the kernel are
	// 'response' and 'responseUpdate'.
	let isResponse = method === "response"
	let isResponseUpdate = method === "responseUpdate"
	let isResponseNonce = method === "responseNonce"
	let isResponseX = isResponse || isResponseUpdate || isResponseNonce
	if (!isResponseX) {
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

// onBeforeRequestListener processes requests that are sent to us by the
// onBeforeRequest hook. The page 'kernel.skynet' is hardcoded and will be
// completely swallowed, returning a blank page. The content script for
// 'kernel.skynet' will inject code that loads the kernel.
//
// For all other pages, the kernel will be consulted. The kernel will either
// indicate that the page should be ignored and therefore loaded as the server
// presents it, or the kernel will indicate that an alternate response should
// be provided.
//
// NOTE: The implementation details for the use of the filterResponseData
// object, in particular around the 'filter.onstart', 'filter.ondata',
// 'filter.onstop', 'filter.write', 'filter.close', and 'filter.disconnect' are
// quite tempermental. It has been my experience that these things don't behave
// quite like explained in the MDN documentation. I also found
// music.youtube.com to be particularly useful when debugging, as it was very
// sensitive to any mistakes that were made in this function.
//
// NOTE: We don't filter.onerror at the moment because there were a bunch of
// 'Channel Redirected' and 'Invalid Request Id' errors. I suspect that those
// errors were coming from other extensions (uMatrix and uBlock Origin) messing
// around with the requests, but I never confirmed what was going on.
// Regardless, all of the errors seemed pretty harmless.
let headers: any = new Object()
function onBeforeRequestListener(details: any) {
	// Set up a promise that will be used by onHeadersReceived to inject
	// the right headers into the response. onHeadersReceived will compare
	// the requestId that it gets to the 'headers' hashmap, and will do
	// nothing unless there's a promise in the hashmap. This code is
	// guaranteed to fire before onHeadersReceived fires.
	let resolveHeaders!: dataFn
	headers[details.requestId] = new Promise((resolve) => {
		resolveHeaders = resolve
	})

	// Grab the filter for this request. As soon as we call it, the
	// behavior of the webpage changes such that no data will be served and
	// the request will hang. It is now our responsibility to ensure that
	// we call filter.write and filter.close.
	//
	// NOTE: In my experience, filter.disconnect didn't work as described
	// in the docs. We therefore avoid its use here and instead make
	// explicit calls to filter.close, using promises to ensure that we
	// don't call filter.close until we've finished writing everything that
	// we intend to write.
	let filter = browser.webRequest.filterResponseData(details.requestId)

	// If the request is specifically for the kernel iframe, we swallow the
	// request entirely. The content scripts will take over and ensure the
	// kernel loads properly.
	if (details.url === "http://kernel.skynet/") {
		resolveHeaders([
			{
				name: "content-type",
				value: "text/html; charset=utf8",
			},
		])
		filter.onstart = function () {
			// Calling filter.close() immediately as the filter
			// starts will ensure that no data is served.
			filter.close()
		}
		return {}
	}

	// Set up a query to the kernel that will ask what response should be
	// used for this page. The kernel will provide information about both
	// what the response body should be, and also what the response headers
	// should be.
	//
	// We need to set filter.onstart and filter.onstop inside of this
	// frame, therefore we cannot set them after the queryKernel promise
	// resolves. But we need to make sure that the code inside of
	// filter.onstart and filter.onstop doesn't run until after we have our
	// response from the kernel, so we need to use a promise to coordinate
	// the timings. The 'blockFilter' promise will block any filter
	// operations until the kernel query has come back.
	let resolveFilter: dataFn
	let blockFilter = new Promise((resolve) => {
		resolveFilter = resolve
	})
	queryKernel({
		method: "requestOverride",
		data: {
			url: details.url,
			method: details.method,
		},
	})
		.then((response: any) => {
			// Check for correct inputs from the kernel. Any error
			// will result in ignoring the request, which we can do
			// by resolving 'null' for the headers promise, and by
			// disconnecting from the filter.
			if (!("data" in response) || !("override" in response.data)) {
				console.error("requestOverride response has no 'override' field\n", response)
				resolveHeaders(null)
				resolveFilter(null)
				return
			}
			if (!("err" in response) || response.err !== null) {
				console.error("requestOverride returned an error\n", response.err)
				resolveHeaders(null)
				resolveFilter(null)
				return
			}
			// If the kernel doesn't explicitly tell us to override
			// this request, then we ignore the request.
			if (response.data.override !== true) {
				resolveHeaders(null)
				resolveFilter(null)
				return
			}
			if (!("body" in response.data)) {
				console.error("requestOverride response is missing 'body' field\n", response)
				resolveHeaders(null)
				resolveFilter(null)
				return
			}
			if (!("headers" in response.data)) {
				console.error("requestOverride response is missing 'headers' field\n", response)
				resolveHeaders(null)
				resolveFilter(null)
				return
			}

			// We have a set of headers and a response body from
			// the kernel, we want to inject them into the
			// response. We resolve the headers promise with the
			// headers provided by the kernel, and we write the
			// response data to the filter. After writing the
			// response data we close the filter so that no more
			// data from the server can get through.
			resolveHeaders(response.data.headers)
			resolveFilter(response.data.body)
		})
		.catch((err) => {
			console.error("requestOverride query to kernel failed:", err)
			resolveHeaders(null)
			resolveFilter(null)
		})

	// Set the filter.ondata and the filter.onstop functions. filter.ondata
	// will block until the kernel query returns, and then it will write
	// the webpage based on what the kernel responds.
	//
	// The blockClose promise will block the call to filter.close until the
	// full data has been written.
	let closeFilter: dataFn
	let blockClose = new Promise((resolve) => {
		closeFilter = resolve
	})
	filter.ondata = function (event: any) {
		blockFilter.then((response) => {
			if (response === null) {
				filter.write(event.data)
			} else {
				filter.write(response)
			}
			closeFilter()
		})
	}
	filter.onstop = function () {
		blockClose.then(() => {
			filter.close()
		})
	}
	return {}
}
browser.webRequest.onBeforeRequest.addListener(onBeforeRequestListener, { urls: ["<all_urls>"] }, ["blocking"])

// onHeadersReceivedListener will replace the headers provided by the portal
// with trusted headers, preventing the portal from providing potentially
// malicious information through the headers.
function onHeadersReceivedListener(details: any) {
	// There is an item for this request. Return a promise that will
	// resolve to updated headers when we know what the updated headers are
	// supposed to be.
	//
	// We aren't going to know until the kernel has finished downloading
	// the original page, this typically completes after we need the
	// headers, which is why we use promises rather than using the desired
	// values directly.
	return new Promise((resolve) => {
		// Do nothing if there's no item for this request in the headers
		// object.
		if (!(details.requestId in headers)) {
			// TODO: If the query was just a headers query, we may
			// need to ask the kernel anyway.
			resolve({ responseHeaders: details.responseHeaders })
			return
		}

		let h = headers[details.requestId]
		delete headers[details.requestId]
		h.then((response: any) => {
			if (response !== null) {
				resolve({ responseHeaders: response })
			} else {
				resolve({ responseHeaders: details.responseHeaders })
			}
		}).catch((err: any) => {
			console.error("headers promise failed", details.url, "\n", err)
			resolve({ responseHeaders: details.responseHeaders })
		})
	})
}
browser.webRequest.onHeadersReceived.addListener(onHeadersReceivedListener, { urls: ["<all_urls>"] }, [
	"blocking",
	"responseHeaders",
])

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
// kernel can specify whether the extension-specific proxies get to take
// priority or not.
function handleProxyRequest(info: any) {
	// Hardcode an exception for 'kernel.skynet'. We need this exception
	// because that's where the kernel exists, and the kernel needs to be
	// loaded before we can ask the kernel whether we should be proxying
	// something.
	//
	// When we return an array of proxy options, the browser will go
	// through the options in order until one of the proxies succeeds. By
	// having a list, we ensure that even if one of the major services is
	// down, the kernel extension and all pages will still work.
	//
	// TODO: Add a default set of proxies the same way that we do for
	// default portals. And really, all of a user's default portals should
	// be included in this list.
	let hostname = new URL(info.url).hostname
	if (hostname === "kernel.skynet") {
		return [
			{ type: "http", host: "localhost", port: 25252 },
			{ type: "http", host: "skynetpro.net", port: 80 },
			{ type: "http", host: "skynetfree.net", port: 80 },
			{ type: "http", host: "siasky.net", port: 80 },
			{ type: "http", host: "fileportal.org", port: 80 },
		]
	}

	// Ask the kernel whether there should be a proxy for this url.
	let query = queryKernel({
		method: "proxyInfo",
		data: { url: info.url },
	})
	query
		.then((response: any) => {
			// Input sanitization.
			if (!("data" in response)) {
				console.error("kernel did not include a 'data' field in the data\n", response)
				return { type: "direct" }
			}
			let data = response.data
			if (!("proxy" in data) || typeof data.proxy !== "boolean") {
				console.error("kernel did not include a 'proxy' in the data\n", response)
				return { type: "direct" }
			}
			if (data.proxy === false) {
				return { type: "direct" }
			}
			if (!("proxyValue" in data)) {
				console.error("kernel did not include a proxyValue in the data\n", response)
				return { type: "direct" }
			}
			return data.proxyValue
		})
		.catch((errQK) => {
			console.error("error after sending proxyInfo message:", errQK)
			return { type: "direct" }
		})
}
browser.proxy.onRequest.addListener(handleProxyRequest, { urls: ["<all_urls>"] })

// Open an iframe containing the kernel.
let kernelFrame: any = document.createElement("iframe")
kernelFrame.src = "http://kernel.skynet"
document.body.appendChild(kernelFrame)
