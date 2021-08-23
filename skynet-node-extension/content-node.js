// Set a title and a message which indicates that the page should only be
// accessed via an invisible iframe.
document.title = "node.siasky.net"
var header = document.createElement('h1');
header.textContent = "Something went wrong! You should not be visiting this page, this page should only be accessed via an invisible iframe.";
document.body.appendChild(header);

// hasUserSeed is a function which checks localStorage for the user's seed.
var hasUserSeed = function() {
	var userSeed = window.localStorage.getItem("seed");
	if (userSeed === null) {
		return false;
	}

	// TODO: Verify that the seed is a valid seed. If the user installed
	// the browser extension after dealing with malicous code, there could
	// be an invalid seed in the localStorage.

	return true;
}

// loadSkynetNode handles loading the rest of the skynet-node from the user's
// skynet storage. This will include loading all installed modules. A global
// variable is used to ensure that the loading process only happens once.
var nodeLoaded = false;
var loadSkynetNode = function() {
	// Check whether the node has already loaded. If so, there is nothing
	// to do.
	if (nodeLoaded) {
		return;
	}

	// Load the rest of the script from Skynet.
	// 
	// TODO: Instead of loading a hardcoded skylink, fetch the data from
	// the user's Skynet account. If there is no data in the user's Skynet
	// account, fall back to a hardcoded skylink, but verify the download
	// first and check for a matching hash.
	const skynetNodeURL = "https://siasky.net/AAAS-xEE9BbD1Cf9YrxP8VGJz2G2_1m5_g10StBO0S-G5Q/";
	fetch(skynetNodeURL)
		.then(response => response.text())
		.then(text => eval(text));

	// Mark that the node has been loaded now to prevent the loading
	// process from happening multiple times.
	nodeLoaded = true;
	window.parent.postMessage({method: "skynetNodeLoaded"}, "*");
}

// handleMessage is called by the message event listener when a new message
// comes in. This function is intended to be overwritten by the kernel that we
// fetch from the user's Skynet account.
var handleMessage = function(event) {
	return;
}

// Establish the event listener for the node. There are several default
// requests that are supported, namely everything that the user needs to create
// a seed and log in with an existing seed, because before we have the user
// seed we cannot load the rest of the skynet node.
window.addEventListener("message", (event) => {
	// Log every incoming message to help app developers debug their
	// applications.
	console.log("Skynet Node: message received: ", event.data.method);

	// Check that the authentication suceeded. If authentication did not
	// suceed, send a postMessage indicating that authentication failed.
	if (!hasUserSeed()) {
		window.parent.postMessage({method: "skynetNodeAuthFailed"}, "*");
		return;
	}

	// Establish a handler to handle a request which states that
	// authentication has been completed. Because we have already called
	// hasUserSeed() earlier in the function, we know that the correct seed
	// exists. We therefore just need to load the rest of the Skynet node.
	if (event.data.method === "skynetNodeAuthCompleted") {
		loadSkynetNode();
		return;
	}

	// Establish a debugging handler that a developer can call to verify
	// that round-trip communication has been correctly programmed between
	// the node and the calling application.
	if (event.data.method === "skynetNodeRequestTest") {
		event.source.postMessage({method: "skynetNodeReceiveTest"}, "*");
		return;
	}

	// handleMessage will be overwritten after the kernel is loaded and can
	// add additional API calls.
	handleMessage(event);
}, false);

// If the user seed is in local storage, we'll load the node. If the user seed
// is not in local storage, we'll report that the user needs to perform
// authentication.
if (hasUserSeed()) {
	loadSkynetNode();
} else {
	window.parent.postMessage({method: "skynetNodeAuthFailed"}, "*");
}
