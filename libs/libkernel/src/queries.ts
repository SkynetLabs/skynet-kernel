import { log, logErr } from "./log.js"
import { bufToB64, dataFn, encodeU64, error, errTuple } from "libskynet"

// queryResolve is the 'resolve' value of a promise that returns an errTuple.
// It gets called when a query sends a 'response' message.
type queryResolve = (er: errTuple) => void

// queryMap is a hashmap that maps a nonce to an open query. 'resolve' gets
// called when a response has been provided for the query.
//
// 'receiveUpdate' is a function that gets called every time a responseUpdate
// message is sent to the query. If a responseUpdate is sent but there is no
// 'receiveUpdate' method defined, the update will be ignored.
//
// 'kernelNonceReceived' is a promise that resolves when the kernel nonce has
// been received from the kernel, which is a prerequesite for sending
// queryUpdate messages. The promise will resolve with a string that contains
// the kernel nonce.
interface queryMap {
	[nonce: string]: {
		resolve: queryResolve
		receiveUpdate?: dataFn
		kernelNonceReceived?: dataFn
	}
}

// Create the queryMap.
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
	// Ignore all messages that aren't from approved kernel sources. The two
	// approved sources are skt.us and the browser extension bridge (which has
	// an event.source equal to 'window')
	if (event.source !== window && event.origin !== "https://skt.us") {
		return
	}

	// Ignore any messages that don't have a method and data field.
	if (!("method" in event.data) || !("data" in event.data)) {
		return
	}

	// Handle logging messages.
	if (event.data.method === "log") {
		// We display the logging message if the kernel is a browser
		// extension, so that the kernel's logs appear in the app
		// console as well as the extension console. If the kernel is
		// in an iframe, its logging messages will already be in the
		// app console and therefore don't need to be displayed.
		if (kernelOrigin === window.origin) {
			if (event.data.data.isErr) {
				console.error(event.data.data.message)
			} else {
				console.log(event.data.data.message)
			}
		}
		return
	}

	// init is complete when the kernel sends us the auth status. If the
	// user is logged in, report success, otherwise return an error
	// indicating that the user is not logged in.
	if (event.data.method === "kernelAuthStatus") {
		// If we have received an auth status message, it means the bootloader
		// at a minimum is working.
		if (initResolved === false) {
			initResolved = true
			initResolve()
		}

		// If the auth status message says that login is complete, it means
		// that the user is logged in.
		if (loginResolved === false && event.data.data.loginComplete === true) {
			loginResolved = true
			loginResolve()
		}

		// If the auth status message says that the kernel loaded, it means
		// that the kernel is ready to receive messages.
		if (kernelLoadedResolved === false && event.data.data.kernelLoaded !== "not yet") {
			kernelLoadedResolved = true
			if (event.data.data.kernelLoaded === "success") {
				kernelLoadedResolve(null)
			} else {
				kernelLoadedResolve(event.data.data.kernelLoaded)
			}
		}

		// If we have received a message indicating that the user has logged
		// out, we need to reload the page and reset the auth process.
		if (event.data.data.logoutComplete === true) {
			if (logoutResolved === false) {
				logoutResolve()
			}
			window.location.reload()
		}
		return
	}

	// Check that the message sent has a nonce. We don't log
	// on failure because the message may have come from 'window', which
	// will happen if the app has other messages being sent to the window.
	if (!("nonce" in event.data)) {
		return
	}
	// If we can't locate the nonce in the queries map, there is nothing to do.
	// This can happen especially for responseUpdate messages.
	if (!(event.data.nonce in queries)) {
		return
	}
	let query = queries[event.data.nonce]

	// Handle a response. Once the response has been received, it is safe to
	// delete the query from the queries map.
	if (event.data.method === "response") {
		queries[event.data.nonce].resolve([event.data.data, event.data.err])
		delete queries[event.data.nonce]
		return
	}

	// Handle a response update.
	if (event.data.method === "responseUpdate") {
		// If no update handler was provided, there is nothing to do.
		if (typeof query.receiveUpdate === "function") {
			query.receiveUpdate(event.data.data)
		}
		return
	}

	// Handle a responseNonce.
	if (event.data.method === "responseNonce") {
		if (typeof query.kernelNonceReceived === "function") {
			query.kernelNonceReceived(event.data.data.nonce)
		}
		return
	}

	// Ignore any other messages as they might be from other applications.
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
	kernelSource = <Window>iframe.contentWindow
	kernelOrigin = "https://skt.us"
	kernelAuthLocation = "https://skt.us/auth.html"

	// Set a timer to fail the login process if the kernel doesn't load in
	// time.
	setTimeout(() => {
		if (initResolved === true) {
			return
		}
		initResolved = true
		initResolve("tried to open kernel in iframe, but hit a timeout")
	}, 24000)
}

// messageBridge will send a message to the bridge of the skynet extension to
// see if it exists. If it does not respond or if it responds with an error,
// messageBridge will open an iframe to skt.us and use that as the kernel.
let kernelSource: Window
let kernelOrigin: string
let kernelAuthLocation: string
function messageBridge() {
	// Establish the function that will handle the bridge's response.
	let bridgeInitComplete = false
	let bridgeResolve: queryResolve = () => {} // Need to set bridgeResolve here to make tsc happy
	let p: Promise<errTuple> = new Promise((resolve) => {
		bridgeResolve = resolve
	})
	p.then(([, err]) => {
		// Check if the timeout already elapsed.
		if (bridgeInitComplete === true) {
			logErr("received response from bridge, but init already finished")
			return
		}
		bridgeInitComplete = true

		// Deconstruct the input and return if there's an error.
		if (err !== null) {
			logErr("bridge exists but returned an error", err)
			launchKernelFrame()
			return
		}

		// Bridge has responded successfully, and there's no error.
		kernelSource = window
		kernelOrigin = window.origin
		kernelAuthLocation = "http://kernel.skynet/auth.html"
	})

	// Add the handler to the queries map.
	let nonce = nextNonce()
	queries[nonce] = {
		resolve: bridgeResolve,
	}

	// Send a message to the bridge of the browser extension to determine
	// whether the bridge exists.
	window.postMessage(
		{
			nonce,
			method: "kernelBridgeVersion",
		},
		window.origin
	)

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
		launchKernelFrame()
	}, 500)

	return initPromise
}

// init is a function that returns a promise which will resolve when
// initialization is complete.
//
// The init / auth process has 5 stages. The first stage is that something
// somewhere needs to call init(). It is safe to call init() multiple times,
// thanks to the 'initialized' variable.
let initialized = false // set to true once 'init()' has been called
let initResolved = false // set to true once we know the bootloader is working
let initResolve: dataFn
let initPromise: Promise<void>
let loginResolved = false // set to true once we know the user is logged in
let loginResolve: () => void
let loginPromise: Promise<void>
let kernelLoadedResolved = false // set to true once the user kernel is loaded
let kernelLoadedResolve: (err: error) => void
let kernelLoadedPromise: Promise<error>
let logoutResolved = false // set to true once the user is logged out
let logoutResolve: () => void
let logoutPromise: Promise<void>
function init(): Promise<void> {
	// If init has already been called, just return the init promise.
	if (initialized === true) {
		return initPromise
	}
	initialized = true

	// Run all of the init functions.
	initNonce()
	window.addEventListener("message", handleMessage)
	messageBridge()

	// Create the promises that resolve at various stages of the auth flow.
	initPromise = new Promise((resolve) => {
		initResolve = resolve
	})
	loginPromise = new Promise((resolve) => {
		loginResolve = resolve
	})
	kernelLoadedPromise = new Promise((resolve) => {
		kernelLoadedResolve = resolve
	})
	logoutPromise = new Promise((resolve) => {
		logoutResolve = resolve
	})

	// Return the initPromise, which will resolve when bootloader init is
	// complete.
	return initPromise
}

// callModule is a generic function to call a module. The first input is the
// module identifier (typically a skylink), the second input is the method
// being called on the module, and the final input is optional and contains
// input data to be passed to the module. The input data will depend on the
// module and the method that is being called. The return value is an errTuple
// that contains the module's response. The format of the response is an
// arbitrary object whose fields depend on the module and method being called.
//
// callModule can only be used for query-response communication, there is no
// support for sending or receiving updates.
function callModule(module: string, method: string, data?: any): Promise<errTuple> {
	let moduleCallData = {
		module,
		method,
		data,
	}
	let [, query] = newKernelQuery("moduleCall", moduleCallData, false)
	return query
}

// connectModule is the standard function to send a query to a module that can
// optionally send and optionally receive updates. The first three inputs match
// the inputs of 'callModule', and the fourth input is a function that will be
// called any time that the module sends a responseUpdate. The receiveUpdate
// function should have the following signature:
//
// 	`function receiveUpdate(data: any)`
//
// The structure of the data will depend on the module and method that was
// queried.
//
// The first return value is a 'sendUpdate' function that can be called to send
// a queryUpdate to the module. The sendUpdate function has the same signature
// as the receiveUpdate function, it's an arbitrary object whose fields depend
// on the module and method being queried.
//
// The second return value is a promise that returns an errTuple. It will
// resolve when the module sends a response message, and works the same as the
// return value of callModule.
function connectModule(
	module: string,
	method: string,
	data: any,
	receiveUpdate: dataFn
): [sendUpdate: dataFn, response: Promise<errTuple>] {
	let moduleCallData = {
		module,
		method,
		data,
	}
	return newKernelQuery("moduleCall", moduleCallData, true, receiveUpdate)
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
	sendUpdates: boolean,
	receiveUpdate?: dataFn
): [sendUpdate: dataFn, response: Promise<errTuple>] {
	// NOTE: The implementation here is gnarly, because I didn't want to use
	// async/await (that decision should be left to the caller) and I also
	// wanted this function to work correctly even if init() had not been
	// called yet.
	//
	// This function returns a sendUpdate function along with a promise, so we
	// can't simply wrap everything in a basic promise. The sendUpdate function
	// has to block internally until all of the setup is complete, and then we
	// can't send a query until all of the setup is complete, and the setup
	// cylce has multiple dependencies and therefore we get a few promises that
	// all depend on each other.
	//
	// Using async/await here actually breaks certain usage patterns (or at
	// least makes them much more difficult to use correctly). The standard way
	// to establish duplex communication using connectModule is to define a
	// variable 'sendUpdate' before defining the function 'receiveUpdate', and
	// then setting 'sendUpdate' equal to the first return value of
	// 'connectModue'. It looks like this:
	//
	// let sendUpdate;
	// let receiveUpdate = function(data: any) {
	//     if (data.needsUpdate) {
	//         sendUpdate(someUpdate)
	//     }
	// }
	// let [sendUpdateFn, response] = connectModule(x, y, z, receiveUpdate)
	// sendUpdate = sendUpdateFn
	//
	// If we use async/await, it's not safe to set sendUpdate after
	// connectModule returns because 'receiveUpdate' may be called before
	// 'sendUpdate' is set. You can fix that by using a promise, but it's a
	// complicated fix and we want this library to be usable by less
	// experienced developers.
	//
	// Therefore, we make an implementation tradeoff here and avoid async/await
	// at the cost of having a bunch of complicated promise chaining.

	// Create a promise that will resolve once the nonce is available. We
	// cannot get the nonce until init() is complete. getNonce therefore
	// implies that init is complete.
	let getNonce: Promise<string> = new Promise((resolve) => {
		init().then(() => {
			kernelLoadedPromise.then(() => {
				resolve(nextNonce())
			})
		})
	})

	// Two promises are being created at once here. Once is 'p', which will be
	// returned to the caller of newKernelQuery and will be resolved when the
	// kernel provides a 'response' message. The other is for internal use and
	// will resolve once the query has been created.
	let p!: Promise<errTuple>
	let queryCreated: dataFn
	let haveQueryCreated: Promise<string> = new Promise((resolve) => {
		queryCreated = resolve
		p = new Promise((resolve) => {
			getNonce.then((nonce: string) => {
				queries[nonce] = { resolve }
				if (receiveUpdate !== null && receiveUpdate !== undefined) {
					queries[nonce]["receiveUpdate"] = receiveUpdate
				}
				queryCreated(nonce)
			})
		})
	})

	// Create a promise that will be resolved once we are ready to receive the
	// kernelNonce. We won't be ready to receive the kernel nonce until after
	// the queries[nonce] object has been created.
	let readyForKernelNonce!: dataFn
	let getReadyForKernelNonce: Promise<void> = new Promise((resolve) => {
		readyForKernelNonce = resolve
	})
	// Create the sendUpdate function. It defaults to doing nothing. After the
	// sendUpdate function is ready to receive the kernelNonce, resolve the
	// promise that blocks until the sendUpdate function is ready to receive
	// the kernel nonce.
	let sendUpdate: dataFn
	if (sendUpdates !== true) {
		sendUpdate = () => {}
		readyForKernelNonce() // We won't get a kernel nonce, no reason to block.
	} else {
		// sendUpdate will send an update to the kernel. The update can't be
		// sent until the kernel nonce is known. Create a promise that will
		// resolve when the kernel nonce is known.
		//
		// This promise cannot itself be created until the queries[nonce]
		// object has been created, so block for the query to be created.
		let blockForKernelNonce: Promise<string> = new Promise((resolve) => {
			haveQueryCreated.then((nonce: string) => {
				queries[nonce]["kernelNonceReceived"] = resolve
				readyForKernelNonce()
			})
		})

		// The sendUpdate function needs both the local nonce and also the
		// kernel nonce. Block for both. Having the kernel nonce implies that
		// the local nonce is ready, therefore start by blocking for the kernel
		// nonce.
		sendUpdate = function (updateData: any) {
			blockForKernelNonce.then((nonce: string) => {
				kernelSource.postMessage(
					{
						method: "queryUpdate",
						nonce,
						data: updateData,
					},
					kernelOrigin
				)
			})
		}
	}

	// Prepare to send the query to the kernel. The query cannot be sent until
	// the queries object is created and also we are ready to receive the
	// kernel nonce.
	haveQueryCreated.then((nonce: string) => {
		getReadyForKernelNonce.then(() => {
			// There are two types of messages we can send depending on whether
			// we are talking to skt.us or the background script.
			let kernelMessage = {
				method,
				nonce,
				data,
				sendKernelNonce: sendUpdates,
			}
			let backgroundMessage = {
				method: "newKernelQuery",
				nonce,
				data: kernelMessage,
			}

			// The message structure needs to adjust based on whether we are
			// talking directly to the kernel or whether we are talking to the
			// background page.
			if (kernelOrigin === "https://skt.us") {
				kernelSource.postMessage(kernelMessage, kernelOrigin)
			} else {
				kernelSource.postMessage(backgroundMessage, kernelOrigin)
			}
		})
	})

	// Return sendUpdate and the promise. sendUpdate is already set to block
	// until all the necessary prereqs are complete.
	return [sendUpdate, p]
}

export {
	callModule,
	connectModule,
	init,
	kernelAuthLocation,
	kernelLoadedPromise,
	loginPromise,
	logoutPromise,
	newKernelQuery,
}
