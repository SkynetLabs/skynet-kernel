// log provides syntactic sugar for the logging functions. The first arugment
// passed into 'log' checks whether the logSettings have explicitly disabled
// that type of logging. The remaining args will be printed as they would if
// 'console.log' was called directly.
var log = function(logType: string, ...inputs: any) {
	// Fetch the log settings as a string.
	let logSettingsStr = localStorage.getItem("v1-logSettings");

	// Run through all the conditions that would result in the log not
	// being printed. If the log is null, the log will be printed. The only
	// two cases where the log will not be printed is if there is an
	// explicit disable on all logs, or if there is an explicit disable on
	// this particular log type.
	if (logSettingsStr !== null) {
		// Wrap the JSON.parse in a try-catch block. If the parse
		// fails, we want to catch the error and report that the
		// logSettings persistence has corrupted.
		try {
			let logSettings = JSON.parse(logSettingsStr);
			if (logSettings.disableAllLogs === true) {
				return;
			}
			if (logSettings[logType] === false) {
				return;
			}
		} catch {
			console.log("ERROR: logSettings item in localstorage is corrupt:", logSettingsStr);
		}
	}

	// Print the log.
	let args = Array.prototype.slice.call(arguments);
	args[0] = "["+logType+"] Home: ";
	console.log.apply(console, args);
	return;
};

// Establish a function to apply restrictions to what pages can send
// postmessage requests to our message listener. This function can be
// overwritten by code that is loaded from the skynet kernel.
// 
// TODO: This doesn't need to be 'any' but I couldn't figure out what type is
// actually passed in by the caller.
var homeRestrictIncomingMessage = function(event: any) {
	// Restrict the listener to only https://kernel.siasky.net messages.
	// If home itself wants to be able to hear from other listeners, it can
	// overwrite the homeRestrictIncomingMessage function.
	if (event.origin !== "https://kernel.siasky.net") {
		log("message", "rejecting postmessage request from ", event.origin);
		return true;
	}
}

// handleMessage is a function which handles the intial handshake with the
// skynet kernel. It is intended to be overwritten by home when the js file is
// loaded.
// 
// TODO: This doesn't need to be 'any' but I couldn't figure out what type is
// actually passed in by the caller.
var handleMessage = function(event: any) {
	// Check for a null kernel.
	if (kernel === null || kernel.contentWindow === null) {
		log("error", "kernel is not initialized properly");
		return;
	}

	log("message", "message received");
	log("message", event.origin);
	log("message", event.data);

	// Establish a handler for the skynet kernel failing to complete auth. If
	// that happens, we will open a window to collect the user's seed.
	if (event.data.kernelMethod === "authFailed") {
		log("message", "skynet kernel auth failed time: ", performance.now());

		// Clear the html in the main div so that we can load in the
		// auth page.
		mainDiv.innerHTML = '';

		// Create a login button.
		var button = document.createElement("input");
		button.type = "button";
		button.value = "Click here to login";
		var openAuthPopup = function() {
			window.open("https://kernel.siasky.net/auth.html");
		};
		button.onclick = openAuthPopup;
		mainDiv.appendChild(button);
		return;
	}

	// Establish a handler to receive an event stating that authentication
	// has completed.
	if (event.data.kernelMethod === "authCompleted") {
		// Send a postmessage to kernel.siasky.net to indicate that it
		// should try loading again.
		kernel.contentWindow.postMessage({kernelMethod: "authCompleted"}, "https://kernel.siasky.net");
		return;
	}

	// Establish a handler to detect when the skynet kernel is loaded. Once
	// the skynet kernel is fully loaded, we will request the user's home
	// from the kernel.
	if (event.data.kernelMethod === "skynetKernelLoaded") {
		console.log("skynet kernel has loaded");
		log("performance", "skynet kernel loaded time: ", performance.now());

		// Send a postmessage to kernel.siasky.net to fetch the homepage.
		kernel.contentWindow.postMessage({kernelMethod: "requestHomescreen"}, "https://kernel.siasky.net");
		return;
	}

	// Add a handler to support receiving the user's homescreen from the
	// skynet kernel.
	if (event.data.kernelMethod === "receiveHomescreen") {
		// Load the html for the homescreen. This html will set up the
		// entire page.
		mainDiv.innerHTML = '';
		document.body.insertAdjacentHTML("beforebegin", event.data.html);
		// Log time until html is loaded.
		log("performance", "html loaded in:", performance.now());

		// Load the script for home.
		// 
		// NOTE: Some of the experienced devs reading this line of code
		// probably have their eyebrows raised to the ceiling. We've
		// just loaded an arbitrary string from another webpage and
		// called 'eval' on it, which under normal circumstances is
		// highly, highly ill advised. I'm not 100% confident that it's
		// the *best* way to accopmlish what we need, but ultimately we
		// DO want to load arbitrary javascript from the skynet kernel
		// and execute it with full webapp permissions, which
		// specifically includes giving it access to the global 'kernel'
		// variable that we've already created.
		// 
		// The other thing to remember about this incoming script is
		// that it's a fully trusted script. If there is a malicious
		// actor that somehow managed to get control of the script,
		// they also have the ability to corrupt basically everything
		// for the user. Safety mechanisms such as iframes and
		// sandboxing won't help the user, because their core skynet
		// kernel is already compromised.
		// 
		// This code is coming from kernel.siasky.net, which is verified
		// by the Skynet kernel web extension, and loads a version of
		// home from the user's storage. The process is fully
		// decentralized, and there is no central intermediary that can
		// tamper with the storage. The storage is cryptographically
		// hashed, signed, and verified, which means any malicious code
		// would need to be signed, and if you can get signed malicious
		// code into the user's kernel storage, the user is already
		// badly compromised.
		eval(event.data.script);
		// Log time until js is loaded.
		log("performance", "js loaded in:", performance.now());
		return;
	}
}

// Establish the postmessage listener.
log("performance", "time to reach event listener:", performance.now())
window.addEventListener("message", (event) => {
	if (homeRestrictIncomingMessage(event)) {
		return;
	}
	handleMessage(event);
}, false);
log("performance", "time to load event listener:", performance.now())

// Open kernel.siasky.net in an invisible iframe.
var kernel = document.createElement("iframe");
kernel.src = "https://kernel.siasky.net";
kernel.style.width = "0";
kernel.style.height = "0";
kernel.style.border = "none";
kernel.style.position = "absolute";
document.body.appendChild(kernel);
log("performance", "time to load kernel iframe:", performance.now())

// Create a content div. This is the div that we are going to use to load any
// content which needs to be presented the the user. If the user is not logged
// in, this div will house a prompt that asks the user to log in. Once the user
// is logged in, this div will house home itself.
var mainDiv = document.createElement("div");
document.body.appendChild(mainDiv);
log("progress", "home bootstrapper loaded");
