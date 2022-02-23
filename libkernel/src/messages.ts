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
var bridgePromise = new Promise((resolve, reject)  => {
	console.log("[libkernel] bridge confirmed to be available")
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
		bridgeExists = true
		bridgeAvailable.resolve()
	} else {
		console.log("[libkernel] ERROR: received late signal from bridge")
	}
}

// handleKernelResponse will parse the kernel's response from the bridge and
// resolve/reject the promise associated with the nonce.
function handleKernelResponse(event: MessageEvent) {
	// Check that the response includes a resp and an err.
	let result = queries[event.data.nonce]
	delete queries[event.data.nonce]
	if (!("resp" in event.data) || !("err" in event.data)) {
		console.log("[libkernel] missing resp or err\n", event)
		return
	}

	// Either resolve or reject the promise associated with this response.
	if (event.data.resp !== null) {
		result.resolve(event.data.resp)
	} else if (event.data.err !== null) {
		result.reject(event.data.err)
	} else {
		console.log("[libkernel] received malformed response from bridge\n", event)
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
	if (!("data" in event) || !("method" in event.data) || !("nonce" in event.data)) {
		return
	}

	// Special case: bridgeTest doesn't need a nonce in 'queries'.
	if (event.data.method === "bridgeTest") {
		handleBridgeTest()
		return
	}

	// Check that we have a promise for the provided nonce.
	if (!(event.data.nonce in queries)) {
		console.log("[libkernel] missing nonce\n", event, "\n", queries)
		return
	}
	if (event.data.method === "kernelResponse") {
		handleKernelResponse(event)
		return
	}
}

// init will add an event listener for messages from the kernel bridge.
export function init(): Promise<void> {
	window.addEventListener("message", handleMessage)

	// Return a promise that will resolve when the bridge responds that it
	// is alive. A timeout is used to reject if the bridge does not respond
	// within 100ms.
	return new Promise((resolve, reject) => {
		let nonce = nextNonce
		nextNonce++
		queries[nonce] = {resolve, reject}
		window.postMessage({
			method: "bridgeTest",
			nonce,
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
	})
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
