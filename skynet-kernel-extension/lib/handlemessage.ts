// handleSkynetKernelRequestGET is defined for two pages when the user hasn't
// logged in: the home page, and the authentication page.
var handleSkynetKernelRequestGET = function(event) {
	// Define a helper function for returning an error.
	let respondErr = function(err: string) {
		let requestURLResponse = {
			queryStatus: "reject",
			nonce: event.data.nonce,
			kernelMethod: "requestURLResponseErr",
			err,
		}
		event.source.postMessage(requestURLResponse, event.origin)
	}
	let respondBody = function(body) {
		let requestURLResponse = {
			queryStatus: "resolve",
			nonce: event.data.nonce,
			kernelMethod: "requestURLResponse",
			response: body,
		}
		event.source.postMessage(requestURLResponse, event.origin)
	}

	// Input checking.
	if (!("data" in event) || !("url" in event.data) || typeof event.data.url !== "string") {
		respondErr("no url provided")
		return
	}

	// Handle the homepage.
	//
	// TODO: Change the homepage to a v2link so that we can update the
	// homepage without having to modify the file.
	if (event.data.url === "https://home.siasky.net/") {
		logToSource(event, "requestGET received for home")
		downloadSkylink("CACJ7F4rr9DsyVt534T2YglPCwczVDjz-PIuCNmY12HVGQ")
		.then(result => {
			respondBody(result.fileData)
		})
		.catch(err => {
			respondErr("unable to fetch skylink for home.siasky.net: "+err)
		})
		return
	}
	// Handle the auth page.
	//
	// TODO: Change the homepage to a v2link so that we can update the
	// homepage without having to modify the file.
	if (event.data.url === "https://kernel.siasky.net/auth.html") {
		logToSource(event, "requestGET received for auth")
		downloadSkylink("OACcYscL6mYhWwp9S8gombapSGIUlj_D4eT2SdYuqFIhIw")
		.then(result => {
			respondBody(result.fileData)
		})
		.catch(err => {
			respondErr("unable to fetch skylink for home.siasky.net: "+err)
		})
		return
	}
	logToSource(event, "requestGET received for something else: "+event.data.url)

	// Default, return a page indicating an error.
	let buf = new TextEncoder().encode("unrecognized URL: "+event.data.url)
	respondBody(buf)
}

// handleMessage is called by the message event listener when a new message
// comes in. This function is intended to be overwritten by the kernel that we
// fetch from the user's Skynet account.
var handleMessage = function(event: any) {
	// If the parent is informing us that the user has completed
	// authentication, we'll go ahead and reload the kernel so that the
	// user's full kernel can be pulled in.
	if (event.data.kernelMethod === "authCompleted") {
		event.source.postMessage({kernelMethod: "authCompleted"}, "*");
		return;
	}

	// Establish a debugging handler that a developer can call to verify
	// that round-trip communication has been correctly programmed between
	// the kernel and the calling application.
	if (event.data.kernelMethod === "requestTest") {
		log("lifecycle", "sending receiveTest message to source\n", event.source);
		event.source.postMessage({kernelMethod: "receiveTest"}, event.source.origin);
		return;
	}

	// Establish a means for the user to logout. Only logout requests
	// provided by home are allowed.
	if (event.data.kernelMethod === "logOut" && event.origin === "https://home.siasky.net") {
		logOut();
		log("lifecycle", "sending logOutSuccess message to home");
		window.postMessage({kernelMethod: "logOutSuccess"}, "*")
		try {
			event.source.postMessage({kernelMethod: "logOutSuccess"}, "https://home.siasky.net");
		} catch (err) {
			log("lifecycle", "unable to inform source that logOut was competed", err);
		}
		return;
	}

	// Create a handler to handle requestGET calls. If the user is not
	// logged in, the main important calls that can be sent are calls for
	// home.siasky.net (which is the home base for the user) and
	// kernel.siasky.net/auth.html (which is how the user can log into
	// their kernel).
	if (event.data.kernelMethod === "requestGET") {
		logToSource(event, "requestGET received")
		handleSkynetKernelRequestGET(event)
		return
	}

	// The bootloader doesn't recognize any other message types.
	log("message", "unrecognized message received by bootloader\n", event)
	return;
}
