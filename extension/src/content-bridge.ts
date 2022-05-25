export {}

// content-bridge.ts is a content script that gets injected into all pages. It
// creates a bridge to the background script, which has access to the kernel.
// This allows pages to talk to the kernel without having to load an iframe
// themselves.

declare var browser

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

// Establish a system for matching queries with their responses. We need a map
// that maps from a background nonce to a page namespace+nonce, and we need a
// map that maps from a page namespace+nonce to a background nonce.
var queriesNonce = 0
var queries = new Object()
var reverseQueries = new Object()
function pageNonceStr(nonce: number, namespace: string) { return nonce.toString()+"n"+namespace }

// Create the handler for messages from the background page. The background
// will be exclusively relaying messages from the bridge to the kernel.
function handleBackgroundMessage(data) {
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
		let pns = pageNonceStr(info.nonce, info.namespace)
		delete reverseQueries[pns]
	}
	let query = ({
		namespace: info.namespace,
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
var portOpen = false

// handleTest will send a response indicating the bridge is alive.
function handleTest(data) {
	window.postMessage({
		namespace: data.namespace,
		nonce: data.nonce,
		method: "response",
		err: null,
		data: {
			bridgeReady: true,
			version: "v0.0.1",
		},
	})
}

// handleKernelQuery handles messages sent by the page that are intended to
// eventually reach the kernel.
function handleKernelQuery(data) {
	// Open the port if it is not already open.
	if (portOpen === false) {
		port = browser.runtime.connect()
		port.onMessage.addListener(handleBackgroundMessage)
		portOpen = true
	}

	// Check for a kernel query.
	if (!("data" in data)) {
		window.postMessage({
			namespace: data.namespace,
			nonce: data.nonce,
			method: "response",
			err: "missing data from newKernelQuery message: "+JSON.stringify(data),
		})
		return
	}

	// Grab a unique nonce for sending this message to the background and
	// add it to the data.
	let nonce = queriesNonce
	queriesNonce++
	data.data.nonce = nonce
	queries[nonce] = {
		namespace: data.namespace,
		nonce: data.nonce,
	}
	let pns = pageNonceStr(data.nonce, data.namespace)
	reverseQueries[pns] = nonce
	port.postMessage(data.data)
}

// handleQueryUpdate will forward an update to a query to the kernel.
function handleQueryUpdate(data) {
	// Helper function to report an error.
	let postErr = function(err) {
		window.postMessage({
			namespace: data.namespace,
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
	let pns = pageNonceStr(data.nonce, data.namespace)
	if (!(pns in reverseQueries)) {
		postErr("no open query for provided nonce")
		return
	}
	let nonce = reverseQueries[data.pns]

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
	// Check that a namespace was provided.
	if (!("namespace" in event.data)) {
		logErr("'newKernelQuery' requires a namespace\n", event.data)
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
		namespace: event.data.namespace,
		nonce: event.data.nonce,
		method: "response",
		err: "bridge received message with unrecoginzed method: "+JSON.stringify(event.data),
	})
}
window.addEventListener("message", handleMessage)

log("bridge has loaded")
