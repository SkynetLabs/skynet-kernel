export {}

declare var browser

// content-bridge.ts is a content script that gets injected into all pages. It
// creates a bridge between the page that loaded and the background script,
// allowing the page to communicate to the background script without having to
// load an iframe, giving the page access to the user's kernel in less overall
// loading time.

// handleSkynetKernelResponse is intended to be overwritten by the page to
// handle the responses from the kernel.
var handleSkynetKernelResponse = function(resp: any) {
	console.log(resp)
}

// handleSkynetKernelErr is intended to be overwritten by the page to handle
// the errors from the kernel.
var handleSkynetKernelErr = function(err: any) {
	console.log(err)
}

// messageSkynetKernel will send a message to the Skynet kernel, any page can
// use this to talk to the kernel without opening its own iframe.
function messageSkynetKernel(msg: any) {
	browser.runtime.sendMessage(msg)
	.then(handleSkynetKernelResponse, handleSkynetKernelErr)
}

// This is the listener for the content script, it will receive messages from
// the page script that it can forward to the kernel.
window.addEventListener("message", function(event) {
	// Safety first, make sure this message is actually coming from the
	// page script.
	if (event.source !== window) {
		console.log("received message, but not from the window")
		console.log(event.source)
		console.log(event)
		return
	}

	console.log("received a message from the page script")
	console.log(event)
	messageSkynetKernel(event.data)
})

console.log("content script is ACTIVE")
