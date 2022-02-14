export {}

// content-bridge.ts is a content script that gets injected into all pages. It
// creates a bridge to the background script, which has access to the kernel.
// This allows pages to talk to the kernel without having to load an iframe
// themselves.

declare var browser

// handleKernelResp handles a successful response from the kernel.
function handleKernelResp(resp, nonce) {
	window.postMessage({
		method: "kernelResponse",
		nonce,
		resp: resp,
		err: null,
	}, "*")
}

// handleKernelErr handles a failed response from the kernel.
function handleKernelErr(err, nonce) {
	console.log("kernel returned an error:\n", err)
	window.postMessage({
		method: "kernelResponse",
		nonce,
		resp: null,
		err: err,
	}, "*")
}

// handleMethodKernelMessage handles messages sent using the method
// 'kernelMessage'. A nonce is expected, and the message to the kernel itself
// is expected. The kernel message does not need to contain a nonce.
function handleMethodKernelMessage(event) {
	// Check for a nonce.
	if (!event.data.nonce) {
		console.log("received a kernelMessage that does not have a nonce\n", event)
		return
	}
	// Check for a kernel message.
	if (!event.data.kernelMessage) {
		console.log("received a kernelMessage that does not have kernel data\n", event)
		return
	}

	// Send the message to the background script. We don't need to use any
	// nonce magic here because the events are directly correlated, however
	// we do need to pass the nonce to the handler so it knows what nonce
	// to tell the 
	let wrappedResp = function(resp) {
		handleKernelResp(resp, event.data.nonce)
	}
	let wrappedErr = function(err) {
		handleKernelErr(err, event.data.nonce)
	}
	browser.runtime.sendMessage(event.data.kernelMessage).then(wrappedResp, wrappedErr)
}

// This is the listener for the content script, it will receive messages from
// the page script that it can forward to the kernel.
window.addEventListener("message", function(event) {
	// Check that the message is coming from the page script.
	if (event.source !== window) {
		return
	}
	// Check that a method was supplied.
	if (!("data" in event) || !("method" in event.data)) {
		return
	}

	// Check for the 'kernelMessage' method.
	if (event.data.method === "kernelMessage") {
		handleMethodKernelMessage(event)
		return
	}
	//  NOTE: More method types can be added here later.
})
