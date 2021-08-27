// basic-worker.js intends to set up a full example for a basic kernel module
// that handles a single request, and also performs all necessary error
// checking.

// handleModuleRequest will handle an incoming API request.
handleModuleRequest = function(event) {
	if (event.data.moduleMethod !== "requestModification") {
		// TODO: Set up some sort of error handling framework.
		return;
	}
	if (event.data.workerInput === undefined || event.data.workerInput.testField === undefined) {
		// TODO: Error handling
		return;
	}

	// Respond to the caller after modifying the testField.
	postMessage({
		domain: event.data.domain,
		kernelMethod: "moduleResponseV1",
		requestNonce: event.data.requestNonce,
		workerResponse: {
			result: event.data.workerInput.testField + ".extended"
		}
	});
}

// onmessage gets called whenever the kernel sends a message to the module. The
// kernel can send a few different types of messages, but the basic worker only
// cares about new API requests. Everything else will result in an error.
onmessage = function(event) {
	if (event.data.kernelMethod !== "moduleCallV1") {
		// TODO: Set up some sort of error handling framework.
		return;
	}
	handleModuleRequest(event);
}
