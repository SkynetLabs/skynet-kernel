// handleMessage is called by the message event listener when a new message
// comes in. This function is intended to be overwritten by the kernel that we
// fetch from the user's Skynet account.
var handleMessage = function(event: any) {
	// Check that the authentication suceeded. If authentication did not
	// suceed, send a postMessage indicating that authentication failed.
	let [userSeed, err] = getUserSeed();
	if (err !== null) {
		log("message", "auth has failed, sending an authFailed message", err);
		window.parent.postMessage({kernelMethod: "authFailed"}, "*");
		return;
	}
	log("message", "user is authenticated");

	// Establish a handler to handle a request which states that
	// authentication has been completed. Because we have already called
	// getUserSeed() earlier in the function, we know that the correct seed
	// exists. We therefore just need to load the rest of the Skynet
	// kernel.
	if (event.data.kernelMethod === "authCompleted") {
		loadSkynetKernel();
		return;
	}

	// Establish a debugging handler that a developer can call to verify
	// that round-trip communication has been correctly programmed between
	// the kernel and the calling application.
	if (event.data.kernelMethod === "requestTest") {
		log("lifecycle", "sending receiveTest message to source\n", event.source);
		event.source.postMessage({kernelMethod: "receiveTest"}, "*");
		return;
	}

	// Establish a means for the user to logout. Only logout requests
	// provided by home are allowed.
	if (event.data.kernelMethod === "logOut" && event.origin === "https://home.siasky.net") {
		logOut();
		log("lifecycle", "sending logOutSuccess message to home");
		try {
			event.source.postMessage({kernelMethod: "logOutSuccess"}, "https://home.siasky.net");
		} catch (err) {
			log("lifecycle", "unable to inform source that logOut was competed", err);
		}
		return;
	}

	// If the kernel hasn't loaded yet, ignore the message and wait until
	// the kernel is loaded. The above messages are all processed even if
	// the kernel hasn't loaded.
	if (!kernelLoaded) {
		log("lifecycle", "handleMessage is being called with unloaded kernel\n", event)
		return
	}
	log("message", "message received\n", event)
	return;
}
