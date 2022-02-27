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
var blockForBridge: Promise<string> = new Promise((resolve, reject)  => {
	bridgeAvailable = {resolve, reject}
})

// Establish a system for matching messages to the kernel with responses from
// the kernel. The nonce is incremented every time a new message is sent, and
// the queries object is used as a hashmap that maps a given message nonce to
// the {resolve, reject} of a promise that will be resolved/rejected when a
// response to the corresponding message is provided.
var nextNonce = 1
var queries: any = new Object()

// postKernelQuery will send a postMessage to the kernel, handling details like
// the nonce and the resolve/reject upon receiving a response. The inputs are a
// resolve and reject function of a promise that should be resolved when the
// response is received, and the message that is going to the kernel itself.
export function postKernelQuery(kernelQuery: any): Promise<any> {
	return new Promise((resolve, reject) => {
		let nonce = nextNonce
		nextNonce++
		queries[nonce] = {resolve, reject}
		window.postMessage({
			method: "kernelQuery",
			nonce,
			kernelQuery,
		}, window.location.origin)
	})
}

// handleBridgeResponse will handle a response from the bridge indicating that
// the bridge is working.
function handleBridgeResponse(data: any) {
	// Check whether the timeout for the bridge has already fired. If so,
	// log that the bridge is available but late.
	if (bridgeExists === false) {
		logErr("received late signal from bridge")
		return
	}
	bridgeExists = true

	// Check whether the version is available in the data.
	if (!("version" in data)) {
		bridgeAvailable.resolve("bridge did not report a version")
	} else {
		bridgeAvailable.resolve(data.version)
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
	let result = queries[event.data.nonce]
	delete queries[event.data.nonce]

	// Check the status and then resolve or reject accordingly.
	if (!("response" in event.data) || !("queryStatus" in event.data.response)) {
		logErr("malformed kernel response\n", event)
		return
	}
	if (event.data.response.queryStatus === "resolve") {
		result.resolve(event.data.response)
	} else if (event.data.response.queryStatus === "reject") {
		result.reject(event.data.response)
	} else {
		logErr("malformed queryStatus")
	}
}

// handleKernelResponseErr is a special handler for situations where the
// content script was unable to communicate with the background script.
function handleKernelResponseErr(event: MessageEvent) {
	let reject = queries[event.data.nonce]
	delete queries[event.data.nonce]
	if (!("err" in event.data) || typeof event.data.err !== "string") {
		logErr("malformed error received from bridge")
		return
	}
	logErr(event.data.err)
	reject(event.data.err)
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
		handleBridgeResponse(event.data)
		return
	}
	if (event.data.method === "kernelResponse") {
		handleKernelResponse(event)
		return
	}
	if (event.data.method === "kernelResponseErr") {
		handleKernelResponseErr(event)
		return
	}
}

// init will add an event listener for messages from the kernel bridge. It is
// safe to call init many times, and libkernel will call init before every
// function call to ensure that everything works even if the user did not
// explicitly call init.
export function init(): Promise<string> {
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
			bridgeAvailable.reject(new Error("bridge unavailable, need skynet extension"))
			logErr("bridge did not respond after 2 seconds")
		}
	}, 2000)
	return blockForBridge
}
