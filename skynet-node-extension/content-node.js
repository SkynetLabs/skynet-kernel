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

// downloadV1Skylink will download the raw data for a skylink and then verify
// that the downloaded content matches the hash of the skylink.
// 
// TODO: Figure out how to use the user's preferred portal at this point
// instead of using siasky. We probably do that by checking localstorage. If
// there is no list of portals specified, default to siasky.
//
// TODO: I have no idea how to get this to return an error, but it needs to
// return an error if validation fails.
var downloadV1Skylink = function(skylink) {
	// TODO: Verify that the input is a valid V1 skylink.

	// TODO: Actually verify the download.

	return fetch(skylink).then(response => response.text())
}

// loadSkynetNode handles loading the rest of the skynet-node from the user's
// skynet storage. This will include loading all installed modules. A global
// variable is used to ensure that the loading process only happens once.
var nodeLoaded = false;
var nodeLoading = false;
var loadSkynetNode = function() {
	// Check whether the node has already loaded. If so, there is nothing
	// to do.
	//
	// TODO: I'm not sure that nodeLoading is necessary. I'm also not sure
	// that this provides any actual safety, because there is still a
	// window between the conditional check and the setting of the value.
	if (nodeLoaded || nodeLoading) {
		return;
	}
	nodeLoading = true;

	// Load the rest of the script from Skynet.
	// 
	// TODO: Instead of loading a hardcoded skylink, fetch the data from
	// the user's Skynet account. If there is no data in the user's Skynet
	// account, fall back to a hardcoded default. The default can save a
	// round trip by being the full javascript instead of being a v1
	// skylink.
	//
	// TODO: If there is some sort of error, need to set nodeLoading to
	// false and then send a 'authFailed' message or some other sort of
	// error notification.
	downloadV1Skylink("https://siasky.net/GAAwXSsCeIFKmaq_hCEha-CmUiu5jVLRs3OUoWoDSQPKlw/")
		.then(text => {
			eval(text);
			nodeLoaded = true;
			window.parent.postMessage({kernelMethod: "skynetNodeLoaded"}, "*");
		});
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
	console.log("Skynet Node: message received");
	console.log(event.data);

	// Check that the authentication suceeded. If authentication did not
	// suceed, send a postMessage indicating that authentication failed.
	if (!hasUserSeed()) {
		window.parent.postMessage({kernelMethod: "authFailed"}, "*");
		return;
	}

	// Establish a handler to handle a request which states that
	// authentication has been completed. Because we have already called
	// hasUserSeed() earlier in the function, we know that the correct seed
	// exists. We therefore just need to load the rest of the Skynet node.
	if (event.data.kernelMethod === "authCompleted") {
		loadSkynetNode();
		return;
	}

	// Establish a debugging handler that a developer can call to verify
	// that round-trip communication has been correctly programmed between
	// the node and the calling application.
	if (event.data.kernelMethod === "requestTest") {
		event.source.postMessage({kernelMethod: "receiveTest"}, "*");
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
	window.parent.postMessage({kernelMethod: "authFailed"}, "*");
}
