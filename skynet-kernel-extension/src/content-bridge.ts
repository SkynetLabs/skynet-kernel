export {}

// content-bridge.ts is a content script that gets injected into all pages. It
// creates a bridge to the background script, which has access to the kernel.
// This allows pages to talk to the kernel without having to load an iframe
// themselves.

// TODO: Need to establish nonce handling.

declare var browser

// handleKernelResp handles a successful response from the kernel.
function handleKernelResp(resp, nonce) {
	window.postMessage({
		method: "kernelResponse",
		nonce,
		resp: resp,
	}, "*")
}

// handleKernelErr handles a failed response from the kernel.
function handleKernelErr(err) {
	console.log("kernel returned an error:\n", err)
}

// This is the listener for the content script, it will receive messages from
// the page script that it can forward to the kernel.
//
// Messages sent to the content script need to have:
//    + 'method' set to 'kernelMessage'
//    + 'nonce' set to a unique number
//    + 'msg' which contains the message for the kernel
//
// Within the kernel message, the 'nonce' does not need to be set.
window.addEventListener("message", function(event) {
	// Check that the message is coming from the page script.
	if (event.source !== window) {
		console.log("received message, but not from the window\n", event)
		return
	}
	// If there's no data associated with the message, do nothing. The
	// example code I was referenceing had a similar check.
	if (!event.data) {
		console.log("received message with no data\n", event)
		return
	}
	// Ignore all messages that don't have the method set to
	// 'kernelMessage'.
	if (!event.data.method) {
		return
	}
	if (event.data.method !== "kernelMessage") {
		return
	}
	// Check for a nonce.
	if (!event.data.nonce) {
		console.log("received a kernelMessage that does not have a nonce\n", event)
		return
	}
	if (!event.data.kernelData) {
		console.log("received a kernelMessage that does not have kernel data\n", event)
		return
	}

	// Send the message to the background script. We don't need to use any
	// nonce magic here because the events are directly correlated, however
	// we do need to pass the nonce to the handler so it knows what nonce
	// to tell the 
	browser.runtime.sendMessage(event.data.kernelData).then(function(resp) {
		handleKernelResp(resp, event.data.nonce)
	}, handleKernelErr)
})
