export {}

// content-bridge.ts is a content script that gets injected into all pages. It
// creates a bridge to the background script, which has access to the kernel.
// This allows pages to talk to the kernel without having to load an iframe
// themselves.

declare var browser

// handleBridgeTest will send a response indicating the bridge is alive.
function handleBridgeTest(event) {
	window.postMessage({
		method: "bridgeTestResponse",
		nonce: event.data.nonce,
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
function handleKernelMessage(event) {
	// Check for a kernel message.
	if (!("kernelMessage" in event.data)) {
		console.error("[skynet bridge] method 'kernelMessage' requires a kernelMessage\n", event.data, "\n", event)
		return
	}

	// browser.runtime.sendMessage is unique and a bit frustrating to work
	// with. The receiving end must always call 'resolve' even if there was
	// an error. This is because a 'reject' is supposed to mean that the
	// browser couldn't connect to the extension for some reason. It
	// hijacks the error output, preventing the receiver from returning an
	// error if the receiver chooses to reject.
	//
	// To get around this, the background script will always resolve,
	// adding 'resp.resp' as a field to indicate success, and 'resp.err' as
	// a field to indicate a failure. We still need to listen for an error
	// though, because those can happen if the extension is unavailable.
	let wrappedResp = function(resp) {
		if (resp.err !== null) {
			handleKernelResp(null, resp.err, event.data.nonce, event.source)
		} else if (resp.resp !== null) {
			handleKernelResp(resp.resp, null, event.data.nonce, event.source)
		} else {
			handleKernelResp(null, "malformed response from background", event.data.nonce, event.source)
		}
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
	// Check that a method and nonce were both provided.
	if (!("method" in event.data) || !("nonce" in event.data)) {
		return
	}

	// Switch on the method.
	if (event.data.method === "bridgeTestQuery") {
		handleBridgeTest(event)
		return
	}
	if (event.data.method === "kernelMessage") {
		handleKernelMessage(event)
		return
	}
})

console.log("[skynet bridge] bridge has loaded")
