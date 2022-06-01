export {}

// content-bridge.ts is a content script that gets injected into all pages. It
// creates a bridge to the background script, which has access to the kernel.
// This allows pages to talk to the kernel without having to load an iframe
// themselves.

declare var browser

// Create the promise that tracks the kernel auth status.
var authStatusKnown
var blockForAuthStatus = new Promise(resolve => {authStatusKnown = resolve})

// Establish a system for matching queries with their responses. We need a map
// that maps from a background nonce to a page nonce, and we need a map that
// maps from a page nonce to a background nonce.
var queriesNonce = 0
var queries = new Object()
var reverseQueries = new Object()

// log provides a wrapper for console.log that prefixes '[libkernel]' to the
// output.
function log(...inputs: any) {
	console.log("[skynet-bridge]", ...inputs)
}

// logErr provides a wrapper for console.error that prefixes '[libkernel]' to
// the output.
function logErr(...inputs: any) {
	console.error("[skynet-bridge]", ...inputs)
}

// Create the handler for messages from the background page. The background
// will be exclusively relaying messages from the bridge to the kernel.
function handleBackgroundMessage(data) {
	// Check for a method field.
	if (!("method" in data)) {
		logErr("received message from background with no method")
		return
	}
	// Check for a data field.
	if (!("data" in data)) {
		logErr("received message from background with no data field", data)
		return
	}

	// Check whether this is an auth message. If so, forward the auth
	// message.
	//
	// TODO: Might need to check that we aren't receiving multiple auth
	// status messages. Or if we are, we might need to handle it.
	if (data.method === "kernelAuthStatus") {
		if (!("userAuthorized" in data.data)) {
			logErr("received kernelAuthStatus with no userAuthorized field")
			return
		}
		authStatusKnown(data.data.userAuthorized)
		return
	}

	// Check what query this message maps to.
	if (!("nonce" in data)) {
		logErr("received message from background with no nonce: "+JSON.stringify(data))
		return
	}
	if (!(data.nonce in queries)) {
		logErr("no record of that nonce : "+JSON.stringify(data)+"\n"+JSON.stringify(queries))
		return
	}

	// Grab the info for this query. If the method is 'response' then this
	// query is done and can be deleted.
	let info = queries[data.nonce]
	if (data.method === "response") {
		delete queries[data.nonce]
		delete reverseQueries[info.nonce]
	}
	let query = ({
		nonce: info.nonce,
		method: data.method,
	})

	// Check that an error was included.
	if ("data" in data) {
		query["data"] = data.data
	}
	if (data.method === "response") {
		if (!("err" in data)) {
			query["err"] = "kernel did not include an err field in response"
			window.postMessage(query)
			return
		}
		query["err"] = data.err
	}
	window.postMessage(query)
}
// Do not open the port until the first kernel query is made by the page
// script, otherwise we will open a port for every single webpage that the user
// visits, whether it is a skynet page or not.
var port
port = browser.runtime.connect()
port.onMessage.addListener(handleBackgroundMessage)

// handleVersion will send a response providing the version of the bridge.
function handleVersion(data) {
	// Send a message indicating that the bridge is alive.
	window.postMessage({
		nonce: data.nonce,
		method: "response",
		err: null,
		data: {
			version: "v0.0.1",
		},
	})

	// Wait until the kernel auth status is known, then send a message with
	// the kernel auth status.
	blockForAuthStatus.then(userAuthorized => {
		window.postMessage({
			method: "kernelAuthStatus",
			data: {
				userAuthorized,
			},
		})
	})
}

// handleKernelQuery handles messages sent by the page that are intended to
// eventually reach the kernel.
function handleKernelQuery(data) {
	// Check for a kernel query. We already checked that a nonce exists.
	if (!("data" in data)) {
		window.postMessage({
			nonce: data.nonce,
			method: "response",
			err: "missing data from newKernelQuery message: "+JSON.stringify(data),
		})
		return
	}

	// Grab a unique nonce for sending this message to the background and
	// add it to the data.
	let nonce = queriesNonce
	queriesNonce += 1
	data.data.nonce = nonce
	queries[nonce] = {
		nonce: data.nonce,
	}
	reverseQueries[data.nonce] = nonce
	port.postMessage(data.data)
}

// handleQueryUpdate will forward an update to a query to the kernel.
function handleQueryUpdate(data) {
	// Helper function to report an error.
	let postErr = function(err) {
		window.postMessage({
			nonce: data.nonce,
			method: "responseUpdate",
			err,
		})
	}
	// Check that data was provided.
	if (!("data" in data)) {
		postErr("missing data from queryUpdate message: "+JSON.stringify(data))
		return
	}

	// Find the corresponding kernel query.
	if (!(data.nonce in reverseQueries)) {
		postErr("no open query for provided nonce")
		return
	}
	let nonce = reverseQueries[data.nonce]

	// Send the update to the kernel.
	port.postMessage({
		nonce,
		method: "queryUpdate",
		data: data.data,
	})
}

// This is the listener for the content script, it will receive messages from
// the page script that it can forward to the kernel.
function handleMessage(event: MessageEvent) {
	// Authenticate the message as a message from the kernel.
	if (event.source !== window) {
		return
	}
	// Check that a nonce and method were both provided.
	if (!("nonce" in event.data) || !("method" in event.data)) {
		return
	}

	// Switch on the method.
	if (event.data.method === "kernelBridgeVersion") {
		handleVersion(event.data)
		return
	}
	if (event.data.method === "newKernelQuery") {
		handleKernelQuery(event.data)
		return
	}
	if (event.data.method === "queryUpdate") {
		handleQueryUpdate(event.data)
		return
	}

	// Ignore response and responseUpdate messages because they may be from
	// ourself.
	if (event.data.method === "response" || event.data.method === "responseUpdate") {
		return
	}

	// Log and send an error if the method is not recognized.
	logErr("bridge received message with unrecognized method\n", event.data)
	window.postMessage({
		nonce: event.data.nonce,
		method: "response",
		err: "bridge received message with unrecoginzed method: "+JSON.stringify(event.data),
	})
}
window.addEventListener("message", handleMessage)

log("bridge has loaded")
