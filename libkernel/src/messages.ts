// Establish a system to test if the bridge script is running. bridgeExists is
// a boolean which establishes whether or not we have already determinied if
// the bridge eixsts, bridgeAvailable is the {resolve, reject} object for a
// promise, and the bridgePromise will resolve/reject when we have determined
// if the bridge exists.
//
// The init() function will use a timeout to decide that the bridge does not
// exist, the hanelMessage function will look for a method called "bridgeTest"
// to determine that the bridge does exist. The init script needs to send the
// bridge a "bridgeTest" message so the bridge knows to respond.
interface resolveReject {
	resolve: Function;
	reject: Function;
}
var bridgeExists: boolean
var bridgeAvailable: resolveReject
var bridgePromise: Promise<void> = new Promise((resolve, reject)  => {
	bridgeAvailable = {resolve, reject}
})
function blockUntilBridgeLoaded() {
	return bridgePromise;
}

// Establish a system for matching messages to the kernel with responses from
// the kernel. The nonce is incremented every time a new message is sent, and
// the queries object is used as a hashmap that maps a given message nonce to
// the {resolve, reject} of a promise that will be resolved/rejected when a
// response to the corresponding message is provided.
var nextNonce = 1
var queries: any = new Object()

// handleBridgeTest will handle a response from the bridge indicating that the
// bridge is working.
function handleBridgeTest() {
	if (bridgeExists !== false) {
		console.log("[libkernel] bridge confirmed to be available")
		bridgeExists = true
		bridgeAvailable.resolve()
	} else {
		console.error("[libkernel] received late signal from bridge")
	}
}

// handleKernelResponse will parse the kernel's response from the bridge and
// resolve/reject the promise associated with the nonce.
function handleKernelResponse(event: MessageEvent) {
	// Check that we have a promise for the provided nonce.
	if (!("nonce" in event.data) || !(event.data.nonce in queries)) {
		console.error("[libkernel] nonce of kernelResponse not found\n", event, "\n", queries)
		return
	}
	// Check that the response includes a resp and an err.
	let result = queries[event.data.nonce]
	delete queries[event.data.nonce]
	if (!("resp" in event.data) || !("err" in event.data)) {
		console.error("[libkernel] malformed kernel response\n", event)
		return
	}

	// Either resolve or reject the promise associated with this response.
	if (event.data.resp !== null) {
		result.resolve(event.data.resp)
	} else if (event.data.err !== null) {
		result.reject(event.data.err)
	} else {
		console.error("[libkernel] received malformed response from bridge\n", event)
	}
}

// handleMessage will handle a message from the kernel, using the reponse to
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

	// Special case: bridgeTest doesn't need a nonce in 'queries'.
	if (event.data.method === "bridgeTest") {
		handleBridgeTest()
		return
	}

	if (event.data.method === "kernelResponse") {
		handleKernelResponse(event)
		return
	}
}

// init will add an event listener for messages from the kernel bridge.
export function init(): Promise<void> {
	// Create the listener that will check for messages from the bridge.
	window.addEventListener("message", handleMessage)

	// Send a message 
	window.postMessage({
		method: "bridgeTest",
	})

	// After 100ms, check whether the bridge has responded. If not,
	// fail the bridge.
	setTimeout(function() {
		if (bridgeExists !== true) {
			bridgeExists = false
			bridgeAvailable.reject()
			console.log("[libkernel] bridge not found")
		}
	}, 100)
	return bridgePromise
}

// kernelRequestTest will send a message to the bridge asking for a kernel
// test.
export function testMessage() {
	return new Promise((resolve, reject) => {
		blockUntilBridgeLoaded()
		.then(x => {
			let nonce = nextNonce
			nextNonce++
			queries[nonce] = {resolve, reject}
			window.postMessage({
				method: "kernelMessage",
				nonce,
				kernelMessage: {
					kernelMethod: "requestTest",
				},
			}, window.location.origin)
		})
		.catch(x => {
			reject(x)
		})
	})
}
