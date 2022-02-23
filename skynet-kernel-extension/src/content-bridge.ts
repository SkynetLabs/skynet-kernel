export {}

// content-bridge.ts is a content script that gets injected into all pages. It
// creates a bridge to the background script, which has access to the kernel.
// This allows pages to talk to the kernel without having to load an iframe
// themselves.

declare var browser

// handleBridgeTest will respond to a test method and let the caller know that
// the bridge is running.
function handleBridgeTest(event) {
	window.postMessage({
		method: "bridgeTestResponse",
	}, event.source)
}

// handleKernelResp handles a successful response from the kernel.
function handleKernelResp(resp, err, nonce, target) {
	window.postMessage({
		method: "kernelResponse",
		nonce,
		resp: resp,
		err: err,
	}, target)
}

// handleKernelMessage handles messages sent using the method 'kernelMessage'.
// A nonce needs to be included in the request to the bridge, but not in the
// request to the kernel.
function handleKernelMessage(event) {
	// Check for a kernel message.
	if (!("kernelMessage" in event.data) || !("nonce" in event.data)) {
		console.error("[skynet bridge] method 'kernelMessage' requires both a nonce and a kernelMessage\n", event.data, "\n", event)
		return
	}

	// Send the message to the background script. We don't need to use any
	// nonce magic here because the events are directly correlated, however
	// we do need to pass the nonce to the handler so it knows what nonce
	// to tell the 
	let wrappedResp = function(resp) {
		handleKernelResp(resp, null, event.data.nonce, event.source)
	}
	let wrappedErr = function(err) {
		handleKernelResp(null, err, event.data.nonce, event.source)
	}
	browser.runtime.sendMessage(event.data.kernelMessage).then(wrappedResp, wrappedErr)
}

// This is the listener for the content script, it will receive messages from
// the page script that it can forward to the kernel.
window.addEventListener("message", function(event) {
	// Authenticate the message as a message from the kernel.
	if (event.source !== window) {
		return
	}
	if (!("data" in event) || !("method" in event.data)) {
		return
	}

	// Check for a bridge test, which does not require a nonce.
	if (event.data.method === "bridgeTestQuery") {
		handleBridgeTest(event)
		return
	}

	// Check for messages aimed at the kernel.
	if (event.data.method === "kernelMessage") {
		handleKernelMessage(event)
		return
	}
	//  NOTE: More method types can be added here later.
})

console.log("[skynet bridge] bridge has loaded")
