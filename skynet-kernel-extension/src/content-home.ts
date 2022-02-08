export {}

// import:::skynet-kernel-extension/lib/parsejson.ts

// import:::skynet-kernel-extension/lib/log.ts

// log is a wrapper for sourceLog that declares the logging messages to be from
// 'Home'.
var log = function(logType: string, ...inputs: any) {
	sourceLog("Home", logType, ...inputs)
}

// handleMessage is a function which handles the intial handshake with the
// skynet kernel. It is intended to be overwritten by home when the js file is
// loaded.
var handleMessage = function(event: any) {
	// Restrict the listener to only https://kernel.siasky.net messages.
	// If home itself wants to be able to hear from other listeners, it can
	// overwrite the homeRestrictIncomingMessage function.
	if (event.origin !== "https://kernel.siasky.net") {
		log("message", "rejecting postmessage request\n", event)
		return true
	}

	// Check for a null kernel.
	if (kernel === null || kernel.contentWindow === null) {
		log("error", "kernel has not been initialized, ignoring message\n", event)
		return
	}
	log("message", "message received\n", event)

	// Establish a handler for the skynet kernel failing to complete auth. If
	// that happens, we will open a window to collect the user's seed.
	if (event.data.kernelMethod === "authFailed") {
		log("message", "skynet kernel auth failed, requesting user to log in")

		// Clear the html in the main div so that we can load in the
		// auth page.
		mainDiv.innerHTML = ''

		// Create a login button.
		var button = document.createElement("input")
		button.type = "button"
		button.value = "Click here to login"
		var openAuthPopup = function() {
			window.open("https://kernel.siasky.net/auth.html")
		}
		button.onclick = openAuthPopup
		mainDiv.appendChild(button)
		return
	}

	// Establish a handler to receive an event stating that authentication
	// has completed. This message is coming from the auth page, not the
	// kernel, we need to forward it to the kernel.
	if (event.data.kernelMethod === "authCompleted") {
		kernel.contentWindow.postMessage({kernelMethod: "authCompleted"}, "https://kernel.siasky.net")
		return
	}

	// Establish a handler to detect when the skynet kernel is loaded. Once
	// the skynet kernel is fully loaded, we will request the user's home
	// from the kernel.
	if (event.data.kernelMethod === "skynetKernelLoaded") {
		log("lifecycle", "skynet kernel has loaded")

		// Send a postmessage to kernel.siasky.net to fetch the homepage.
		kernel.contentWindow.postMessage({kernelMethod: "requestHomescreen"}, "https://kernel.siasky.net")
		return
	}

	// Add a handler to support receiving the user's homescreen from the
	// skynet kernel.
	if (event.data.kernelMethod === "receiveHomescreen") {
		// Load the html for the homescreen. This html will set up the
		// entire page.
		mainDiv.innerHTML = ''
		document.body.insertAdjacentHTML("beforebegin", event.data.html)
		// Log time until html is loaded.
		log("lifecycle", "html loaded")

		// Load the script for home.
		// 
		// TODO: We can replace this eval in particular with loading
		// the homepage from the kernel.
		eval(event.data.script)
		// Log time until js is loaded.
		log("lifecycle", "js loaded")
		return
	}
}

// Establish the postmessage listener.
log("lifecycle", "launching event listener")
window.addEventListener("message", (event) => {
	handleMessage(event)
}, false)
log("lifecycle", "event listener launched")

// Open kernel.siasky.net in an invisible iframe.
var kernel = document.createElement("iframe")
kernel.src = "https://kernel.siasky.net"
kernel.style.width = "0"
kernel.style.height = "0"
kernel.style.border = "none"
kernel.style.position = "absolute"
document.body.appendChild(kernel)
log("lifecycle", "kernel iframe loaded")

// Create a content div. This is the div that we are going to use to load any
// content which needs to be presented the the user. If the user is not logged
// in, this div will house a prompt that asks the user to log in. Once the user
// is logged in, this div will house home itself.
var mainDiv = document.createElement("div")
document.body.appendChild(mainDiv)
log("lifecycle", "home loaded")
