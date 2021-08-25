// basic-worker.js intends to set up a full example for a basic kernel module
// that handles a single request, and also performs all necessary error
// checking.

// handleAPIRequest will handle an incoming API request.
handleAPIRequest = function(event) {
	if (event.data.moduleMethod !== "requestTest") {
		// TODO: Set up some sort of error handling framework.
		return;
	}

	// Respond to the caller after modifying the testField.
	postMessage({
		kernelMethod: "moduleResponseV1",
		response: {
			result: event.data.workerInput.testField + ".extended"
		}
	});
}

// onmessage gets called whenever the kernel sends a message to the module. The
// kernel can send a few different types of messages, but the basic worker only
// cares about new API requests. Everything else will result in an error.
onmessage = function(event) {
	if (event.data.kernelMethod !== "moduleAPIRequestV1") {
		// TODO: Set up some sort of error handling framework.
		return;
	}
	handleAPIRequest(event);
}
