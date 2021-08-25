
// This is the simplest worker you can have that performs cross module
// communication. It appends to the provided test field, and then calls out to
// the simpler extension worker to have the test field extended again,
// returning the final result and demonstrating that cross module communcation
// is functional.

// handleModuleRequest will handle an incoming API request.
handleModuleRequest = function(event) {
	if (event.data.moduleMethod !== "requestDoubleModification") {
		// TODO: Set up some sort of error handling framework.
		return;
	}
	if (event.data.workerInput === undefined || event.data.workerInput.testField === undefined) {
		// TODO: Error handling
		return;
	}

	// Send a request to the basic worker after extending the input.
	//
	// NOTE: Since the modifications made by this worker are not nonce
	// dependent, we don't need to provide any nonce. There is another
	// example worker that properly makes use of the nonce field.
	postMessage({
		kernelMethod: "moduleCallV1",
		domain: "TODO", // TODO
		moduleMethod: "requestModification",
		workerInput: {
			testField: event.data.workerInput.testField + ".double"
		},
		defaultHandler: "https://siasky.net/AACvEziMdRPtF-lac8Z76rNAbsyGqqR_8fzX2zjSJJj9Ug/"
	});
}

// handleModuleResponse will handle responses from the calls we made to the
// basic worker.
handleModuleResponse = function(event) {
	console.log("comms worker got the response from the basic worker");
	console.log(event.data);
	// TODO: Need to check the domain as well.
	if (event.data.moduleMethod !== "requestModification") {
		// TODO: Error handling
		return;
	}

	// Respond to the caller with the double-modified test field.
	postMessage({
		kernelMethod: "moduleResponseV1",
		requestNonce: event.data.requestNonce,
		domain: event.data.domain,
		moduleMethod: event.data.moduleMethod,
		workerResponse: event.data.workerResponse
	});
}

onmessage = function(event) {
	console.log("messaging called on comms worker");
	if (event.data.kernelMethod === "moduleCallV1") {
		handleModuleRequest(event);
		return;
	}
	if (event.data.kernelMethod === "moduleResponseV1") {
		handleModuleResponse(event);
		return;
	}

	// TODO: Set up some sort of error handling framework.
}
