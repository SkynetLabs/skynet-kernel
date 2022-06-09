export {}

// Need to declare the browser variable so typescript doesn't complain. We
// declare it as 'any' because typescript doesn't know type 'Browser'.
declare var browser: any

// This is the same as the dataFn declared in libskynet, but since it is the
// only import I decided to re-implement it here.
type dataFn = (data?: any) => void

// Create the object that will track the current auth status of the kernel. We
// need a promise because the client may connect to the bridge after all of the
// auth messages have been processed, there's no guarantee that the client will
// catch the initial messages.
//
// blockForAuthStatus is a promise that will resolve when the auth status is
// initially known. 'userAuthorized' is a variable that contains the current
// auth status, it will change if a new auth message is received from the
// kernel.
//
// userAuthorized is only intended to be used one time, after that the client
// should be listening for new messages from the kernel.
let userAuthorized: boolean
let authStatusKnown: dataFn
let blockForAuthStatus: Promise<void> = new Promise((resolve) => {
	authStatusKnown = resolve
})

// Create the handler for messages from the background page. The background
// will be exclusively relaying messages from the bridge to the kernel.
function handleBackgroundMessage(data: any) {
	// If this is the first auth status message from the kernel, resolve the
	// auth promise.
	if (data.method === "kernelAuthStatus") {
		userAuthorized = data.data.userAuthorized
		authStatusKnown()
	}

	// If this is an authStatusChanged message, update the userAuthorized field
	// that we use to message new subscribers with the auth status.
	if (data.method === "kernelAuthStatusChanged") {
		userAuthorized = data.data.userAuthorized
	}

	// Pass the message through to the main page.
	window.postMessage(data)
}

// Connect to the background page.
//
// TODO: We are opening a port to the background for every single page/tab the
// user has open. This may be too heavy.
let port = browser.runtime.connect()
port.onMessage.addListener(handleBackgroundMessage)

// handleVersion will send a response providing the version of the bridge. When
// the bridge version is queried, the bridge assumes that a new consumer has
// appeared which will need the auth status of the kernel repeated.
function handleVersion(data: any) {
	// Send a message indicating that the bridge is alive.
	window.postMessage({
		nonce: data.nonce,
		method: "response",
		err: null,
		data: {
			version: "v0.1.0",
		},
	})

	// Wait until the kernel auth status is known, then send a message with
	// the kernel auth status.
	blockForAuthStatus.then(() => {
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
function handleKernelQuery(data: any) {
	// Check for a kernel query. We already checked that a nonce exists.
	if (!("data" in data)) {
		window.postMessage({
			nonce: data.nonce,
			method: "response",
			err: "missing data from newKernelQuery message: " + JSON.stringify(data),
		})
		return
	}

	// Pass the message along to the kernel. The caller is responsible for
	// ensuring the nonce is unique.
	port.postMessage(data.data)
}

// handleQueryUpdate will forward an update to a query to the kernel.
function handleQueryUpdate(data: any) {
	// Send the update to the kernel.
	port.postMessage(data)
}

// This is the listener for the content script, it will receive messages from
// the page script that it can forward to the kernel.
function handleMessage(event: MessageEvent) {
	// Throughout this function, errors are typically not logged because we
	// will be receiving all messages sent to the window, including messages
	// that have nothing to do with the Skynet kernel protocol. If there is an
	// error, we generally assume that the message has an unrelated purpose and
	// doesn't need to be logged.

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

	// Everything else just gets ignored.
}
window.addEventListener("message", handleMessage)
