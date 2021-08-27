// call-other-module.js is a simple example module that uses the API of another
// module, demonstrate how modules are able to compose together and use each
// other's data.
//
// This module performs a modification on an input string, and then calls out
// to the basic.js module to have that module also perform a modification. The
// final result is returned to the caller.

// handleModuleRequest will handle an incoming API request.
handleModuleRequest = function(event) {
	// This module only recognizes the 'requestDoubleModification' method.
	if (event.data.moduleMethod !== "requestDoubleModification") {
		// TODO: Set up some sort of error handling framework.
		return;
	}
	// Perform input verification, as the caller may be malicious.
	if (event.data.moduleInput === undefined || event.data.moduleInput.testField === undefined || typeof event.data.moduleInput.testField !== "string") {
		// TODO: Error handling
		return;
	}

	// Send a request to the basic module with the modified input.
	//
	postMessage({
		// The default handler contains the packaged basic.js module.
		// The kernel may already have this code, but in the event that
		// the kernel does not already know about basic.js, we provide
		// a link that will let the kernel install and run basic.js at
		// runtime.
		defaultHandler: "https://siasky.net/AADTwWeQb82gsXhgStROUOC_EeetJ2xl7bjCHHH1Qlff9Q/",
		// The domain specifies the domain of basic.js. The domain is
		// what the kernel uses to figure out which software to run.
		// The kernel will only fall back to the defaultHandler if it
		// does not already have software installed for the given
		// domain. The domain is always a cryptographic public key.
		domain: "TODO", // TODO
		// By setting the kernelMethod to moduleCallV1, we tell the
		// kernel that this message is meant to make a new request to a
		// module.
		kernelMethod: "moduleCallV1",
		// The module method is the method that will be called in
		// basic.js.
		moduleMethod: "requestModification",
		// Since this is the only request we are making, the request
		// nonce can be hard coded to '0'. If we were making multiple
		// requests, we would need to make sure each request has a
		// different nonce, so we could tell the responses apart as
		// they come back. The requestNonce does not need to be
		// randomized nor globally unique, it just needs to be unique
		// within this instance of this module.
		requestNonce: 0,
		// moduleInput is the input that we're sending to basic.js.
		moduleInput: {
			testField: event.data.moduleInput.testField + ".double"
		}
	});
}

// handleModuleResponse will handle responses from the calls we made to the
// basic module.
handleModuleResponse = function(event) {
	console.log("comms module got the response from the basic module");
	console.log(event.data);

	// Respond to the caller with the double-modified test field.
	postMessage({
		kernelMethod: "moduleResponseV1",
		moduleResponse: event.data.moduleResponse
	});
}

onmessage = function(event) {
	console.log("messaging called on comms module");
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
