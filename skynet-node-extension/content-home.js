// Establish a function to apply restrictions to what pages can send
// postmessage requests to our message listener. This function can be
// overwritten by code that is loaded from the skynet node.
var checkHomeMessageRestrictions = function(event) {
	// Restrict the listener to just hearing from https://node.siasky.net -
	// if the homescreen app itself wants to be able to hear from other
	// listeners, it can overwrite the checkHomeMessageRestrictions
	// function.
	if (event.origin !== "https://node.siasky.net") {
		console.log("Rejecting postmessage request from ", event.origin);
		return true;
	}
}

// handleMessage is a function which handles the intial handshake with the
// skynet node. It is intended to be overwritten by the homescreen script that
// gets imported from the skynet node.
var handleMessage = function(event) {
	// Establish a handler for the skynet node failing to complete auth. If
	// that happens, we will open a window to collect the user's seed.
	if (event.data.method === "skynetNodeAuthFailed") {
		console.log("Homescreen: skynet node auth failed time: ", performance.now());

		// Clear the html in the main div so that we can load in the
		// auth page.
		mainDiv.innerHTML = '';

		// TODO: Obviously we can make a nicer login page than this
		// clumsy login button, I'm just not sure the best way to
		// build/import the page. Would be kind of clumsy to build an
		// entire webpage by manually constructucting the dom in JS,
		// there's gotta be a better way.
		var button = document.createElement("input");
		button.type = "button";
		button.value = "Click here to login";
		var openAuthPopup = function() {
			window.open("https://node.siasky.net/auth.html");
		};
		button.onclick = openAuthPopup;
		mainDiv.appendChild(button);
		return;
	}

	// Establish a handler to receive an event stating that authentication
	// has completed.
	if (event.data.method === "skynetNodeAuthCompleted") {
		// Send a postmessage to node.siasky.net to indicate that it
		// should try loading again.
		node.contentWindow.postMessage({method: "skynetNodeAuthCompleted"}, "https://node.siasky.net");
		return;
	}

	// Establish a handler to detect when the skynet node is loaded. Once
	// the skynet node is fully loaded, we will request the user's
	// homescreen application from the node.
	if (event.data.method === "skynetNodeLoaded") {
		console.log("Homescreen: skynet node loaded time: ", performance.now());

		// Send a postmessage to node.siasky.net to fetch the homepage.
		node.contentWindow.postMessage({method: "skynetNodeRequestHomescreen"}, "https://node.siasky.net");
		return;
	}

	// Add a handler to support receiving the user's homescreen from the
	// skynet node.
	if (event.data.method === "skynetNodeReceiveHomescreen") {
		// Load the script for the homescreen.
		// 
		// NOTE: Some of the experienced devs reading this line of code
		// probably have their eyebrows raised to the ceiling. We've
		// just loaded an arbitrary string from another webpage and
		// called 'eval' on it, which under normal circumstances is
		// highly, highly ill advised. I'm not 100% confident that it's
		// the *best* way to accopmlish what we need, but ultimately we
		// DO want to load arbitrary javascript from the skynet node
		// and execute it with full webapp permissions, which
		// specifically includes giving it access to the global 'node'
		// variable that we've already created.
		// 
		// The other thing to remember about this incoming script is
		// that it's a fully trusted script. If there is a malicious
		// actor that somehow managed to get control of the script,
		// they also have the ability to corrupt basically everything
		// for the user. Safety mechanisms such as iframes and
		// sandboxing won't help the user, because their core skynet
		// node is already compromised.
		// 
		// This code is coming from node.siasky.net, which is verified
		// by the Skynet node web extension, and loads a version of
		// homescreen from the user's storage. The process is fully
		// decentralized, and there is no central intermediary that can
		// tamper with the storage. The storage is cryptographically
		// hashed, signed, and verified, which means any malicious code
		// would need to be signed, and if you can get signed malicious
		// code into the user's kernel storage, the user is already
		// badly compromised.
		eval(event.data.script);

		// Load the html for the homescreen. This html will set up the
		// entire page.
		mainDiv.innerHTML = '';
		document.body.insertAdjacentHTML("beforebegin", event.data.html);

		// Log time time elapsed until the homescreen html has been
		// set.
		var homescreenSetTime = performance.now();
		console.log("Homescreen: html loaded in:", homescreenSetTime);
		return;
	}
}

// Establish the postmessage listener.
window.addEventListener("message", (event) => {
	if (checkHomeMessageRestrictions(event)) {
		return;
	}
	handleMessage(event);
}, false);

// Open node.siasky.net in an invisible iframe.
var node = document.createElement("iframe");
node.src = "https://node.siasky.net";
node.style.width = "0";
node.style.height = "0";
node.style.border = "none";
node.style.position = "absolute";
document.body.appendChild(node);

// Create a content div. This is the div that we are going to use to load any
// content which needs to be presented the the user. If the user is not logged
// in, this div will house a prompt that asks the user to log in. Once the user
// is logged in, this div will house the homescreen app itself.
var mainDiv = document.createElement("div");
document.body.appendChild(mainDiv);
