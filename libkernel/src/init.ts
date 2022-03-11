// log provides a wrapper for console.log that prefixes 'libkernel'.
export function log(...inputs: any) {
	console.log("[libkernel]", ...inputs)
}

// logErr provides a wrapper for console.error that prefixes '[libkernel]' to
// the output.
export function logErr(...inputs: any) {
	console.error("[libkernel]", ...inputs)
}

// composeErr takes a series of inputs and composes them into a single string.
// Each element will be separated by a newline. If the input is not a string,
// it will be transformed into a string with JSON.stringify.
//
// Any object that cannot be stringified will be skipped, though an error will
// be logged.
export function composeErr(...inputs: any): string {
	let result = "";
	for (let i = 0; i < inputs.length; i++) {
		// Prepend a newline if this isn't the first element.
		if (i !== 0) {
			result += "\n"
		}
		// Strings can be added without modification.
		if (typeof inputs[i] === "string") {
			result += inputs[i]
			continue
		}
		// Everything else needs to be stringified, log an error if it
		// fails.
		try {
			let str = JSON.stringify(inputs[i])
			result += str
		} catch {
			logErr("unable to stringify input to composeErr")
		}
	}
	return result
}

// queryHandler is the data type that gets stored in the 'queries' map. There's
// a resolve and reject function associated with a promise that is blocking
// until the query is complete, and then there's an 'update' function which
// gets called if the query receives a 'responseUpdate', as well as a 'handle'
// function which gets called when the query receives a 'response'.
interface queryHandler {
	resolve: Function;
	reject: Function;
	update: Function;
	handle: Function;
}

// Establish a hashmap for matching queries to their responses by their nonces.
// nextNonce needs to start at '1' because '0' is reserved for the bridgeTest
// method performed at init.
const namespace = "libkernel-v0"
var nextNonce = 1
var queries: any = new Object()

// handleBridgeResponse will handle a response from the bridge indicating that
// the bridge is working. This needs to be declared before the remaining bridge
// variables because they need to reference it as a handler.
function handleBridgeResponse(resolve: Function, reject: Function, data: any) {
	// Check whether the timeout for the bridge has already fired. If so,
	// log that the bridge is available but late.
	if (bridgeExists === false) {
		logErr("received late signal from bridge")
		reject("received late signal from bridge")
		return
	}
	bridgeExists = true

	// Check whether the version is available in the data.
	if ("version" in data) {
		resolve(data.version)
	} else {
		resolve("bridge did not report a version")
	}
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
var initialized: boolean
var bridgeExists: boolean
var bridgeAvailable: queryHandler
var blockForBridge: Promise<string> = new Promise((resolve, reject)  => {
	bridgeAvailable = {resolve, reject, update: null as any, handle: handleBridgeResponse}
})

// newKernelQuery will send a postMessage to the kernel, handling details like
// the nonce and the resolve/reject upon receiving a response.
//
// The first return value is a function that can be called to send a
// 'queryUpdate' to the kernel for that nonce.
export function newKernelQuery(data: any, update: Function): [Function, Promise<any>] {
	let nonce = nextNonce
	nextNonce++
	let sendUpdate = function(data: any) {
		queryUpdate(nonce, data)
	}
	let p = new Promise((resolve, reject) => {
		queries[nonce] = {resolve, reject, update, handle: handleKernelResponse}
		window.postMessage({
			namespace,
			method: "newKernelQuery",
			nonce,
			data,
		})
	})
	return [sendUpdate, p]
}

// queryUpdate is a function that can be called to send a queryUpdate to an
// existing query.
function queryUpdate(nonce: number, data: any) {
	window.postMessage({
		namespace,
		method: "queryUpdate",
		nonce,
		data,
	})
}

// handleKernelResponse will parse the kernel's response from the bridge and
// resolve/reject the promise associated with the nonce.
function handleKernelResponse(resolve: Function, reject: Function, data: any) {
	resolve(data)
}

// handleMessage will handle a message from the kernel, using the response to
// resolve the appropriate promise in the set of queries.
function handleMessage(event: MessageEvent) {
	// Check the message source.
	if (event.source !== window) {
		return
	}
	// Check that this message is a response targeting libkernel.
	if (event.data.namespace !== namespace) {
		return
	}
	if (!("method" in event.data) || typeof event.data.method !== "string") {
		logErr("received message targeting our namespace with malformed method", event.data)
		return
	}
	if (event.data.method !== "response" && event.data.method !== "responseUpdate") {
		// We don't log here because that would catch outbound messages
		// from ourself.
		return
	}
	// Check that we have a nonce for this message.
	if (!(event.data.nonce in queries)) {
		logErr("message received with no matching nonce\n", event.data, "\n", queries)
		return
	}

	// If this is a responseUpdate, pass the data to the update handler.
	if (event.data.method === "responseUpdate") {
		let handler = queries[event.data.nonce]
		if (!("update" in handler) || typeof handler.update !== "function") {
			logErr("responseUpdate received, but no update method defined in handler")
			return
		}
		if (!("data" in event.data)) {
			logErr("responseUpdate received, but no data provided: "+JSON.stringify(event.data))
			return
		}
		handler.update(event.data.data)
		return
	}

	// The method is "response", meaning the query is closed out can can be
	// deleted.
	let handler = queries[event.data.nonce]
	delete queries[event.data.nonce]
	if (!("err" in event.data)) {
		handler.reject("no err field provided in response: "+JSON.stringify(event.data))
		return
	}
	if (event.data.err !== null) {
		handler.reject(event.data.err)
		return
	}
	if (!("data" in event.data)) {
		handler.reject("no data field provided in query: "+JSON.stringify(event.data))
		return
	}
	handler.handle(handler.resolve, handler.reject, event.data.data)
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
		namespace,
		nonce: 0,
		method: "test",
	})
	queries[0] = bridgeAvailable

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
