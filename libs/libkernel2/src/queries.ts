import { log, logErr } from "./log.js"
import { bufToB64, dataFn, encodeU64, error, errTuple } from "libskynet"

// queryResolve is the 'resolve' value of a promise that returns an errTuple.
// It gets called when a query sends a 'response' message.
type queryResolve = (er: errTuple) => void

// queryMap is a hashmap that maps a nonce to an open query. The 'resolve'
// function is called when a 'response' message is received for the query. The
// 'receiveUpdate' function is called when
interface queryMap {
	[nonce: string]: {
		resolve: queryResolve
		receiveUpdate?: dataFn
		kernelNonce?: string
		kernelNonceReceived?: dataFn
	}
}

let queries: queryMap = {}

// Define the nonce handling. nonceSeed is 16 random bytes that get generated
// at init and serve as the baseline for creating random nonces. nonceCounter
// tracks which messages have been sent. We hash together the nonceSeed and the
// current nonceCounter to get a secure nonce.
//
// We need a secure nonce so that we know which messages from the kernel are
// intended for us. There could be multiple pieces of independent code talking
// to the kernel and using nonces, by having secure random nonces we can
// guarantee that the applications will not use conflicting nonces.
let nonceSeed: Uint8Array
let nonceCounter: number
function initNonce() {
	nonceSeed = new Uint8Array(16)
	nonceCounter = 0
	crypto.getRandomValues(nonceSeed)
}

// nextNonce will combine the nonceCounter with the nonceSeed to produce a
// unique string that can be used as the nonce with the kernel.
//
// Note: the nonce is only ever going to be visible to the kernel and to other
// code running in the same webpage, so we don't need to hash our nonceSeed. We
// just need it to be unique, not undetectable.
function nextNonce(): string {
	let nonceNum = nonceCounter
	nonceCounter += 1
	let [nonceNumBytes, err] = encodeU64(BigInt(nonceNum))
	if (err !== null) {
		// encodeU64 only fails if nonceNum is outside the bounds of a
		// uint64, which shouldn't happen ever.
		logErr("encodeU64 somehow failed", err)
	}
	let noncePreimage = new Uint8Array(nonceNumBytes.length + nonceSeed.length)
	noncePreimage.set(nonceNumBytes, 0)
	noncePreimage.set(nonceSeed, nonceNumBytes.length)
	return bufToB64(noncePreimage)
}

// Establish the handler for incoming messages.
function handleMessage(event: MessageEvent) {
	// Ignore all messages that aren't from approved kernel sources. The
	// two approved sources are skt.us and
	console.log(event.data)
	if (event.source !== window && event.origin !== "https://skt.us") {
		return
	}

	// Ignore any messages that don't have a method field.
	if (!("method" in event.data) || !("data" in event.data)) {
		console.log("got a message missing a method or data field", event.data)
		return
	}

	// Ignore logging requests, because the kernel can call console.log
	// successfully itself.
	if (event.data.method === "log") {
		return
	}

	// init is complete when the kernel sends us the auth status. If the
	// user is logged in, report success, otherwise return an error
	// indicating that the user is not logged in.
	if (event.data.method === "kernelAuthStatus") {
		if (initResolved === true) {
			console.error("kernel sent an auth status message, but init is already finished")
			return
		}
		if (event.data.data.userAuthorized) {
			initResolved = true
			initResolve(null)
		} else {
			initResolved = true
			initResolve("user is not logged in")
		}
		return
	}

	// Check for an auth status change. If there was an auth change, we
	// just reload the whole window.
	if (event.data.method === "kernelAuthStatusChanged") {
		window.location.reload()
		return
	}

	// Check that the message sent has a nonce and a method. We don't log
	// on failure because the message may have come from 'window', which
	// will happen if the app has other messages being sent to the window.
	if (!("nonce" in event.data)) {
		return
	}
	// If we can't locate the nonce in the queries map, there is nothing to
	// do.
	if (!(event.data.nonce in queries)) {
		return
	}
	queries[event.data.nonce].resolve([event.data.data, event.data.err])
}

// launchKernelFrame will launch the skt.us iframe that is used to connect to the
// Skynet kernel if the kernel cannot be reached through the browser extension.
function launchKernelFrame() {
	let iframe = document.createElement("iframe")
	iframe.src = "https://skt.us"
	iframe.width = "0"
	iframe.height = "0"
	iframe.style.border = "0"
	iframe.style.position = "absolute"
	document.body.appendChild(iframe)

	// Set a timer to fail the login process if the kernel doesn't load in
	// time.
	setTimeout(() => {
		if (initResolved === true) {
			return
		}
		initResolved = true
		initResolve("tried to open kernel in iframe, but hit a timeout")
	}, 18000)
}

// messageBridge will send a message to the bridge of the skynet extension to
// see if it exists. If it does not respond or if it responds with an error,
// messageBridge will open an iframe to skt.us and use that as the kernel.
let kernelSource: string
function messageBridge() {
	// Establish the function that will handle the bridge's response.
	let bridgeInitComplete = false
	let bridgeResolve: queryResolve = () => {} // Need to set bridgeResolve here to make tsc happy
	let p: Promise<errTuple> = new Promise((resolve) => {
		bridgeResolve = resolve
	})
	p.then((et: errTuple) => {
		// Check if the timeout already elapsed.
		if (bridgeInitComplete === true) {
			logErr("received response from bridge, but init already finished")
			return
		}
		bridgeInitComplete = true

		// Deconstruct the input and return if there's an error.
		let err = et[1]
		if (err !== null) {
			logErr("bridge exists but returned an error", err)
			kernelSource = "skt.us"
			launchKernelFrame()
			return
		}

		// Bridge has responded successfully, and there's no error.
		kernelSource = "bridge"
	})

	// Add the handler to the queries map.
	let nonce = nextNonce()
	queries[nonce] = {
		resolve: bridgeResolve,
	}

	// Send a message to the bridge of the browser extension to determine
	// whether the bridge exists.
	window.postMessage({
		nonce,
		method: "kernelBridgeTest",
	})

	// Set a timeout, if we do not hear back from the bridge in 500
	// milliseconds we assume that the bridge is not available.
	setTimeout(() => {
		// If we've already received and processed a message from the
		// bridge, there is nothing to do.
		if (bridgeInitComplete === true) {
			return
		}
		bridgeInitComplete = true
		log("browser extension not found, falling back to skt.us")
		kernelSource = "skt.us"
		launchKernelFrame()
	}, 500)

	return initPromise
}

// init is a function that returns a promise which will resolve when
// initialization is complete.
let initialized: boolean
let initResolved: boolean
let initResolve: (err: error) => void
let initPromise: Promise<error>
function init(): Promise<error> {
	// If init has already been called, just return the init promise.
	if (initialized === true) {
		return initPromise
	}

	// Run all of the init functions.
	initNonce()
	window.addEventListener("message", handleMessage)
	messageBridge()

	// Create the initProise and return it.
	initPromise = new Promise((resolve) => {
		initResolve = resolve
	})
	return initPromise
}

// newKernelQuery opens a query to the kernel. Details like postMessage
// communication and nonce handling are all abstracted away by newKernelQuery.
//
// The first arg is the method that is being called on the kernel, and the
// second arg is the data that will be sent to the kernel as input to the
// method.
//
// The thrid arg is an optional function that can be passed in to receive
// responseUpdates to the query. Not every query will send responseUpdates, and
// most responseUpdates can be ignored, but sometimes contain useful
// information like download progress.
//
// The first output is a 'sendUpdate' function that can be called to send a
// queryUpdate. The second output is a promise that will resolve when the query
// receives a response message. Once the response message has been received, no
// more updates can be sent or received.
function newKernelQuery(
	method: string,
	data: any,
	receiveUpdate?: dataFn
): [sendUpdate: dataFn, response: Promise<errTuple>] {}

export { init }
