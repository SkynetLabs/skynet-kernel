export {}

// content-bridge.ts is a content script that gets injected into all pages. It
// creates a bridge to the background script, which has access to the kernel.
// This allows pages to talk to the kernel without having to load an iframe
// themselves.

declare var browser

// log provides a wrapper for console.log that prefixes 'libkernel'.
function log(...inputs: any) {
	console.log("[libkernel]", ...inputs)
}

// logErr provides a wrapper for console.error that prefixes '[libkernel]' to
// the output.
function logErr(...inputs: any) {
	console.error("[libkernel]", ...inputs)
}

// handleTest will send a response indicating the bridge is alive.
function handleTest(data) {
	window.postMessage({
		namespace: data.namespace,
		nonce: data.nonce,
		method: "response",
		err: null,
		data: {
			version: "v0.0.1",
		},
	})
}

// handleKernelQuery handles messages sent by the page that are intended to
// eventually reach the kernel.
function handleKernelQuery(data) {
	// Check for a kernel query.
	if (!("queryData" in data)) {
		log("'newKernelQuery' requires queryData\n", data)
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
	let wrappedResp = function(response) {
		// Pass the message from the kernel to the page script. Note
		// that the response may itself be a failure, which will be
		// indicated by the 'queryStatus' field of the data.
		window.postMessage({
			namespace: data.namespace,
			nonce: data.nonce,
			method: "response",
			err: null,
			data: {
				response,
			},
		})
	}
	let wrappedErr = function(err) {
		// A kernelResponseErr actually indicates some issue with
		// 'sendMessage', and is expected to be uncommon.
		window.postMessage({
			namespace: data.namespace,
			nonce: data.nonce,
			method: "response",
			err,
		})
	}
	browser.runtime.sendMessage(data.queryData).then(wrappedResp, wrappedErr)
}

// This is the listener for the content script, it will receive messages from
// the page script that it can forward to the kernel.
window.addEventListener("message", function(event) {
	// Authenticate the message as a message from the kernel.
	if (event.source !== window) {
		return
	}
	// Check that a namespace was provided.
	if (!("namespace" in event.data)) {
		logErr("'bridgeToKernelQuery' requires queryData\n", event.data)
		return
	}
	// Check that a nonce and method were both provided.
	if (!("nonce" in event.data) || !("method" in event.data)) {
		return
	}

	// Switch on the method.
	if (event.data.method === "test") {
		handleTest(event.data)
		return
	}
	if (event.data.method === "newKernelQuery") {
		handleKernelQuery(event.data)
		return
	}

	// Log and send an error if the method is not recognized.
	logErr("bridge received message with unrecognized method\n", event.data)
	window.postMessage({
		namespace: event.data.namespace,
		nonce: event.data.nonce,
		method: "response",
		err: "bridge received message with unrecoginzed method: "+JSON.stringify(event.data),
	})
})

log("bridge has loaded")
