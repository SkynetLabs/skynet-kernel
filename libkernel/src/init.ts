// log provides a wrapper for console.log that prefixes 'libkernel'.
export function log(...inputs: any) {
	console.log("[libkernel]", ...inputs)
}

// logErr provides a wrapper for console.error that prefixes '[libkernel]' to
// the output.
export function logErr(...inputs: any) {
	console.error("[libkernel]", ...inputs)
}

// Establish a hashmap for matching queries to their responses by their nonces.
// nextNonce needs to start at '1' because '0' is reserved for the bridgeTest
// method performed at init.
var nextNonce = 1
var queries: any = new Object()

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

// postKernelQuery will send a postMessage to the kernel, handling details like
// the nonce and the resolve/reject upon receiving a response. The inputs are a
// resolve and reject function of a promise that should be resolved when the
// response is received, and the message that is going to the kernel itself.
export function postKernelQuery(queryData: any): Promise<any> {
	return new Promise((resolve, reject) => {
		let nonce = nextNonce
		nextNonce++
		queries[nonce] = {resolve, reject}
		window.postMessage({
			method: "bridgeToKernelQuery",
			nonce,
			queryData,
		})
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
function handleKernelResponse(data: any, promise: resolveReject) {
	// Check that the response is well formed.
	if (!("response" in data) || !("err" in data)) {
		logErr("received a malformed bridgeToKernelResponse\n", data)
		promise.reject("received a malformed bridgeToKernelResponse: "+JSON.stringify(data))
		return
	}
	if (data.response !== null) {
		promise.resolve(data.response)
		return
	}
	promise.reject(data.err)
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
	// Check that the method is a string.
	if (typeof event.data.method !== "string") {
		return
	}
	// Check that the method is an inbound method.
	if (!((event.data.method.endsWith("Response")) || (event.data.method.endsWith("ResponseUpdate")))) {
		return
	}
	// Check that we have a nonce for this message.
	if (!(event.data.nonce in queries)) {
		logErr("message received with no matching nonce\n", event.data, "\n", queries)
		return
	}

	// Check for a bridgeTestResponse.
	if (event.data.method === "bridgeTestResponse") {
		if (event.data.nonce === 0) {
			handleBridgeResponse(event.data)
			return
		} else {
			logErr("received bridgeTestResponse with incorrect nonce")
			return
		}
	}

	let promise = queries[event.data.nonce]
	delete queries[event.data.nonce]
	if (event.data.method === "bridgeToKernelResponse") {
		handleKernelResponse(event.data, promise)
		return
	}
	logErr("received message with unrecognized method\n", event.data)
	promise.reject("received message with unrecognized method: "+JSON.stringify(event.data))
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

	// Send a message checking if the bridge is alive and responding. The
	// nonce '0' is kept available explicitly for this purpose.
	window.postMessage({
		method: "bridgeTestQuery",
		nonce: 0,
	})
	queries[0] = bridgeAvailable

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
