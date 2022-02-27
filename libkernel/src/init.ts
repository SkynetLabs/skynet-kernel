// log provides a wrapper for console.log that prefixes 'libkernel'.
var log = function(...inputs: any) {
	console.log("[libkernel]", ...inputs)
}

// logErr provides a wrapper for console.error that prefixes '[libkernel]' to
// the output.
var logErr = function(...inputs: any) {
	console.error("[libkernel]", ...inputs)
}

// Establish a system to test if the bridge script is running. bridgeExists is
// a boolean which establishes whether or not we have already determinied if
// the bridge eixsts, bridgeAvailable is the {resolve, reject} object for a
// promise, and the blockForBridge will resolve/reject when we have determined
// if the bridge exists.
//
// The init() function will use a timeout to decide that the bridge does not
// exist, the hanelMessage function will look for a method called
// "bridgeTestResponse" to determine that the bridge does exist. The init
// script needs to send the bridge a "bridgeTestQuery" message so the bridge
// knows to respond.
interface resolveReject {
	resolve: Function;
	reject: Function;
}
var initialized: boolean
var bridgeExists: boolean
var bridgeAvailable: resolveReject
var blockForBridge: Promise<void> = new Promise((resolve, reject)  => {
	bridgeAvailable = {resolve, reject}
})

// Establish a system for matching messages to the kernel with responses from
// the kernel. The nonce is incremented every time a new message is sent, and
// the queries object is used as a hashmap that maps a given message nonce to
// the {resolve, reject} of a promise that will be resolved/rejected when a
// response to the corresponding message is provided.
var nextNonce = 1
var queries: any = new Object()

// postKernelMessage will send a postMessage to the kernel, handling details
// like the nonce and the resolve/reject upon receiving a response. The inputs
// are a resolve and reject function of a promise that should be resolved when
// the response is received, and the message that is going to the kernel
// itself.
export function postKernelMessage(resolve: Function, reject: Function, message: any) {
	let nonce = nextNonce
	nextNonce++
	queries[nonce] = {resolve, reject}
	window.postMessage({
		method: "kernelMessage",
		nonce,
		kernelMessage: message,
	}, window.location.origin)
}

// handleBridgeTest will handle a response from the bridge indicating that the
// bridge is working.
function handleBridgeResponse() {
	if (bridgeExists !== false) {
		bridgeExists = true
		bridgeAvailable.resolve()
	} else {
		logErr("received late signal from bridge")
	}
}

// handleKernelResponse will parse the kernel's response from the bridge and
// resolve/reject the promise associated with the nonce.
function handleKernelResponse(event: MessageEvent) {
	// Check that we have a promise for the provided nonce.
	if (!(event.data.nonce in queries)) {
		logErr("nonce of kernelResponse not found\n", event, "\n", queries)
		return
	}
	// Check that the response includes a resp and an err.
	let result = queries[event.data.nonce]
	delete queries[event.data.nonce]
	if (!("resp" in event.data) || !("err" in event.data)) {
		logErr("malformed kernel response\n", event)
		return
	}

	// Either resolve or reject the promise associated with this response.
	if (event.data.resp !== null) {
		result.resolve(event.data.resp)
	} else if (event.data.err !== null) {
		result.reject(event.data.err)
	} else {
		logErr("received malformed response from bridge\n", event)
	}
}

// handleMessage will handle a message from the kernel, using the response to
// resolve the appropriate promise in the set of queries.
function handleMessage(event: MessageEvent) {
	// Check the message source.
	if (event.source !== window) {
		return
	}
	// Check that this message is a kernelResponse.
	if (!("data" in event) || !("method" in event.data)) {
		return
	}
	if (event.data.method === "bridgeTestResponse") {
		handleBridgeResponse()
		return
	}
	if (event.data.method === "kernelResponse") {
		handleKernelResponse(event)
		return
	}
}

// init will add an event listener for messages from the kernel bridge. It is
// safe to call init many times, and libkernel will call init before every
// function call to ensure that everything works even if the user did not
// explicitly call init.
export function init(): Promise<void> {
	// Check if init has already happened.
	if (initialized === true) {
		return blockForBridge
	}
	initialized = true

	// Create the listener that will check for messages from the bridge.
	window.addEventListener("message", handleMessage)

	// Send a message checking if the bridge is alive and responding. We
	// use a fake nonce because we don't care about the nonce for the
	// bridge.
	window.postMessage({
		method: "bridgeTestQuery",
		nonce: 0,
	})
	// After 2 seconds, check whether the bridge has responded. If not,
	// fail the bridge.
	setTimeout(function() {
		if (bridgeExists !== true) {
			bridgeExists = false
			bridgeAvailable.reject("bridge unavailable, need skynet extension")
			logErr("bridge did not respond after 2 seconds")
		}
	}, 2000)
	return blockForBridge
}
