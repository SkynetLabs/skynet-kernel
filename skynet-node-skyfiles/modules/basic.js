// basic.js intends to set up a full example for a basic kernel module that
// handles a single request, and also performs all necessary error checking.

// handleModuleRequest will handle an incoming API request with the kernel
// method 'moduleCallV1'. This tells the module that the kernel is using the
// 'moduleCallV1' protocol to send messages.
//
// There is another input, 'moduleMethod', which indicates the method that the
// module is intended to handle.
handleModuleRequest = function(event) {
	// This module only supports the method 'requestModification'.
	if (event.data.moduleMethod !== "requestModification") {
		// TODO: Set up some sort of error handling framework.
		return;
	}
	// Check that the correct input was provided. We are going to be
	// receiving messages from foreign, potentially malicious code, so we
	// need to validate all input. In this case, we need to check that the
	// moduleInput field exists at all, then we need to check that the
	// testField exists at all, and finally we need to check that the
	// testField is a string.
	if (event.data.moduleInput === undefined || event.data.moduleInput.testField === undefined || typeof event.data.moduleInput.testField !== "string") {
		// TODO: Error handling
		return;
	}

	// Respond to the caller after modifying the testField. In the
	// response, we set the kernelMethod to 'moduleResponseV1', indicating
	// that we wish to send the 'moduleReponse' field back to the original
	// caller. 'moduleResponseV1' is the required method when responding to
	// a 'moduleCallV1'.
	//
	// We need to set the requestNonce to 'event.data.requestNonce' because
	// the kernel may send multiple concurrent calls to the same module,
	// and the kernel needs to know which responses are connected to which
	// original calls. postMessage is fully async, without the nonce
	// concurrency is not possible to achieve safely.
	//
	// The final value is 'moduleResponse', which is the data we actually
	// intend to provide to the original caller.
	postMessage({
		kernelMethod: "moduleResponseV1",
		requestNonce: event.data.requestNonce,
		moduleResponse: {
			result: event.data.moduleInput.testField + ".extended"
		}
	});
}

// onmessage gets called whenever the kernel sends a message to the module. The
// kernel can send a few different types of messages, but the basic module only
// cares about new API requests. Everything else will result in an error.
onmessage = function(event) {
	if (event.data.kernelMethod !== "moduleCallV1") {
		// TODO: Set up some sort of error handling framework.
		return;
	}
	handleModuleRequest(event);
}
