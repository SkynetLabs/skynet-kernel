// Define helper functions that will allow the worker to block until the seed
// is received.
var seed: Uint8Array
var resolveSeed: Function
var seedReceived = false
var awaitSeed = new Promise((resolve, reject) => {
	resolveSeed = resolve
})

// Set up a list of errors that can be queried by a caller. This is a long
// running list of errors that will grow over time as errors are encountered.
// Only unexpected errors that indicate a bug of some sort are added to this
// list.
var errors: string[] = []

// onmessage receives messages from the kernel.
onmessage = function(event) {
	// Define a helper method for sending an error back to the kernel.
	let respondErr = function(err: string) {
		postMessage({
			nonce: event.data.nonce,
			method: "response",
			err,
			data: null,
		})
	}

	// Check that all of the required fields are present.
	//
	// NOTE: Modules should not have to do input verification on these
	// fields, they can trust that the kernel is not malicious and is
	// sending them well formed messages. This module however is explicitly
	// intended to check that the kernel is functioning correctly, so it
	// does the checking here to ensure that there was no breaking change.
	if (!("nonce" in event.data)) {
		errors.push("received a message with no nonce")
		// We can't call respondErr here because respondErr needs the
		// nonce, and the nonce doesn't exist.
		return
	}
	if (!("method" in event.data)) {
		errors.push("received a message with no method")
		respondErr("received a message with no method")
		return
	}
	if (!("data" in event.data)) {
		errors.push("received a message with no data")
		respondErr("received a message with no data")
		return
	}

	// Check for the message where the kernel sends us the seed.
	if (event.data.method === "presentSeed") {
		// Similar to above, regular modules should be able to assume
		// that this message was well formed and only sent once, we are
		// only checking here because this module is explicitly testing
		// that the kernel is working correctly.
		if (seedReceived === true) {
			errors.push("presentSeed was called more than one time")
			return
		}
		seedReceived = true
		if (!("seed" in event.data.data)) {
			errors.push("presentSeed did not include a seed")
			return
		}
		// TODO: I don't know how to check if event.data.data.seed is
		// a Uint8Array
		if (seed.length !== 16) {
			errors.push("presentSeed did not provide a 16 byte seed")
			return
		}
		seed = event.data.data.seed
		resolveSeed() // This resolves a promise.
		return
	}

	// Create a method that exposes the seed to any caller.
	//
	// NOTE: Standard modules are not expected to expose their seed. These
	// APIs are available to *all* other modules, and the value of having a
	// module specific seed is that no other module knows what that seed
	// is. This is a testing module, and the test suite needs to see that a
	// seed was received and that it makes sense, so we expose the seed.
	if (event.data.method === "viewSeed") {
		awaitSeed.then(x => {
			postMessage({
				nonce: event.data.nonce,
				method: "response",
				err: null,
				data: {
					seed,
				},
			})
		})
		return
	}

	// Create a method to share all of the errors that the module has
	// detected.
	if (event.data.method === "readErrors") {
		awaitSeed.then(x => {
			postMessage({
				nonce: event.data.nonce,
				method: "response",
				err: null,
				data: {
					errors,
				},
			})
		})
		return
	}

	// Catch any unrecognized methods. The test suite will intentionally
	// send nonsense method names.
	respondErr("method is unrecognized")
	return
}
