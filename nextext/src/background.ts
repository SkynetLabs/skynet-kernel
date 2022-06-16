// The background is the background script that runs for the duration of the
// kernel's life. It is responsible for passing messages between pages calling
// the kernel and the kernel itself. We use a background page so that there
// only needs to be a single kernel for the whole browser, instead of requiring
// each webpage to open an iframe.
//
// There are a few places where we need to use 'any' instead of a real type
// because this is a browser extension and not all of the types are recognized
// by typescript. If you know how to get rid of any of these, please let us
// know. These areas are marked with a 'tsc' comment.

import { dataFn, errTuple, kernelAuthStatus, requestOverrideResponse, tryStringify } from "libskynet"

declare var browser: any // tsc

// Set up the code for handling queries and ports. They are both objects that
// can suffer memory leaks, so we declare them together alongside a tracker
// that will log when it appears like there's a memory leak.
//
// TODO: Ports will be in use later.
let queriesNonce = 1
let queries: any = new Object()
let portsNonce = 0
let openPorts = {} as any
function logLargeObjects() {
	let queriesLen = Object.keys(queries).length
	let portsLen = Object.keys(openPorts).length
	if (queriesLen > 500) {
		console.error("queries appears to be leaking:", queriesLen)
	}
	if (portsLen > 50) {
		console.error("ports appears to be leaking:", portsLen)
	}
	setTimeout(logLargeObjects, 60000)
}
setTimeout(logLargeObjects, 60000)

// Create a promise that will resolve when the bootloader is ready to receive
// messages. We'll also track the auth info here, since the bootloader lets us
// know that it is ready to receive messages by sengind the auth info.
let authStatus: kernelAuthStatus
let authStatusKnown = false
let authStatusResolve: dataFn
let blockForBootloader = new Promise((resolve) => {
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
function queryKernel(query: any): Promise<any> {
	// Return the promise that will resolve once we receive a message from the
	// kernel.
	return new Promise((resolve) => {
		// Define the callback which will be called when a response is recieved
		// from the kernel.
		let receiveResponse = function (data: any) {
			resolve(data)
		}

		// Wait until the bootloader is ready, then send the query to the
		// bootloader.
		blockForBootloader.then(() => {
			let nonce = queriesNonce
			queriesNonce += 1
			query.nonce = nonce
			queries[nonce] = receiveResponse
			kernelFrame.contentWindow!.postMessage(query, "http://kernel.skynet")
		})
	})
}

// handleKernelMessage will handle messages from the kernel.
//
// The kernel is considered trusted so there is no type checking on the inputs.
function handleKernelMessage(event: MessageEvent) {
	// Ignore all messages that aren't coming from the kernel.
	if (event.origin !== "http://kernel.skynet") {
		return
	}
	let data = event.data.data

	// Check if the kernel is trying to get a log message written.
	if (event.data.method === "log") {
		if (data.isErr === false) {
			console.log(data.message)
		} else {
			console.error(data.message)
		}
		return
	}

	// Check if the kernel has sent an auth status message.
	if (event.data.method === "kernelAuthStatus") {
		authStatus = data
		if (authStatusKnown === false) {
			authStatusResolve()
			authStatusKnown = true
			console.log("bootloader is now initialized")
		}
		return
	}

	// If the message is a response, match it to the corresponding query and
	// pass along the data.
	if (event.data.method === "response") {
		let receiveResult = queries[event.data.nonce]
		delete queries[event.data.nonce]
		receiveResult(data)
	}
}
window.addEventListener("message", handleKernelMessage)

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
// kernel to load. It communicates with the kernel to determine what other
// pages to proxy.
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
	let start = performance.now()
	let hostname = new URL(info.url).hostname
	if (hostname === "kernel.skynet") {
		return [
			{ type: "http", host: "localhost", port: 25252 },
			{ type: "http", host: "skynetpro.net", port: 80 },
			{ type: "http", host: "skynetfree.net", port: 80 },
			{ type: "http", host: "siasky.net", port: 80 },
			{ type: "http", host: "web3portal.com", port: 80 },
		]
	}

	return { type: "direct" }
}
browser.proxy.onRequest.addListener(handleProxyRequest, { urls: ["<all_urls>"] })

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
function onBeforeRequestListener(details: any) {
	// For the kernel, we swallow the entire page. The 'bootloader' content
	// script will everything that we need.
	if (details.url === "http://kernel.skynet/") {
		// Get the filter and swallow any response from the server.
		let filter = browser.webRequest.filterResponseData(details.requestId)
		filter.onstart = () => {
			filter.close()
		}
		filter.onerror = (err: any) => {
			console.error("bootloader filter error:", err)
		}
		return
	}

	// For the favicon, we make a request to a content script that has access
	// to the favicon.
	if (details.url === "http://kernel.skynet/favicon.ico") {
		// Send a message to the kernel requesting an override for the
		// favicon.ico. The kernel is itself loading this favicon from the
		// browser, I just wasn't certain how to get binary objects directly to
		// the background page, so we fetch it via a content script instead.
		let faviconPromise = queryKernel({
			method: "requestOverride",
			data: {
				url: details.url,
				method: details.method,
			},
		})

		// Get the filter and swallow any response from the server. Setting
		// 'onData' to a blank function will swallow all data from the server.
		let filter = browser.webRequest.filterResponseData(details.requestId)
		filter.ondata = () => { }
		filter.onstop = (event: any) => {
			faviconPromise.then((result: requestOverrideResponse) => {
				filter.write(result.body)
				filter.close()
			})
		}
		filter.onerror = (err: any) => {
			console.error("favicon filter error:", err)
		}
		return
	}

	// For the favicon, we make a request to a content script that has access
	// to the favicon.
	if (details.url === "http://kernel.skynet/auth.html") {
		// Send a message to the kernel requesting an override for the auth
		// page. The kernel is itself loading the auth page from the browser, I
		// just wasn't certain how to get binary objects directly to the
		// background page, so we fetch it via a content script instead.
		let authPagePromise = queryKernel({
			method: "requestOverride",
			data: {
				url: details.url,
				method: details.method,
			},
		})

		// Get the filter and swallow any response from the server. Setting
		// 'onData' to a blank function will swallow all data from the server.
		let filter = browser.webRequest.filterResponseData(details.requestId)
		filter.ondata = () => { }
		filter.onstop = (event: any) => {
			authPagePromise.then((result: requestOverrideResponse) => {
				filter.write(result.body)
				filter.close()
			})
		}
		filter.onerror = (err: any) => {
			console.error("favicon filter error:", err)
		}
		return
	}

	// Otherwise do nothing.
	return {}
}
browser.webRequest.onBeforeRequest.addListener(onBeforeRequestListener, { urls: ["<all_urls>"] }, ["blocking"])

// onHeadersReceivedListener will replace the headers provided by the portal
// with trusted headers, preventing the portal from interfering with the kernel
// by providing bad headers.
function onHeadersReceivedListener(details: any) {
	// For kernel.skynet, replace the response headers with trusted headers.
	if (details.url === "http://kernel.skynet/" || details.url === "http://kernel.skynet/auth.html") {
		let headers = [
			{
				name: "content-type",
				value: "text/html; charset=utf8",
			},
		]
		return { responseHeaders: headers }
	}

	// For the favicon, replace the headers with png headers.
	if (details.url === "http://kernel.skynet/favicon.ico") {
		let headers = [
			{
				name: "content-type",
				value: "image/png",
			},
		]
		return { responseHeaders: headers }
	}

	// For everything else, use the standard headers.
	return { responseHeaders: details.responseHeaders }
}
browser.webRequest.onHeadersReceived.addListener(onHeadersReceivedListener, { urls: ["<all_urls>"] }, [
	"blocking",
	"responseHeaders",
])

// Open an iframe containing the kernel.
let kernelFrame: HTMLIFrameElement = document.createElement("iframe")
kernelFrame.src = "http://kernel.skynet"
document.body.appendChild(kernelFrame)
