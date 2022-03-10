// Define helper functions that will allow the worker to block until the seed
// is received.
var seed: Uint8Array
var resolveSeed: Function
var rejectSeed: Function
var seedReceived = false
var blockForSeed = new Promise((resolve, reject) => {
	resolveSeed = resolve
	rejectSeed = reject
})

// Set up a list of errors that can be queried by a caller. This is a long
// running list of errors that will grow over time as errors are encountered.
// Only unexpected errors that indicate a bug of some sort are added to this
// list.
var errors: string[] = []

// Create a helper function for logging.
function log(message: string) {
	postMessage({
		method: "log",
		data: {
			isErr: true,
			message,
		},
	})
}

// onmessage receives messages from the kernel.
onmessage = function(event) {
	log("worker has received message: "+JSON.stringify(event.data))

	// Check that the kernel included a method in the message.
	//
	// NOTE: A typical kenrel module does not need to check that event.data
	// contains a field called 'message', the kernel guarantees that the
	// field will be there. This however is a module designed to test the
	// kernel, so there are checks here to ensure that the kernel is
	// properly following meeting its intended guarantees.
	if (!("method" in event.data)) {
		errors.push("received a message with no method")
		log("received a message with no method: " + JSON.stringify(event.data))
		return
	}
	// Hande 'presentSeed', which gives the module a seed. Similar to
	// above, this version of the handler contains a lot of extra checks
	// purely because this is a testing module. Most modules will not need
	// to include all of these checks.
	if (event.data.method === "presentSeed") {
		log("inside of presentSeed")

		// TODO: Need to check that the domain is the kernel. Note that
		// the kernel will not allow external callers to use the
		// 'presentSeed' function, so again this check is important for
		// the testing module, but not otherwise.

		// Check that the kernel has not mistakenly already sent us a
		// presentSeed call.
		if (seedReceived === true) {
			errors.push("presentSeed was called more than one time")
			log("seedReceived is already true")
			return
		}
		seedReceived = true
		// Check that the kernel actually provided the seed.
		if (!("seed" in event.data.data)) {
			log("no 'seed' in event.data.data")
			errors.push("presentSeed did not include a seed")
			rejectSeed("no seed included in presentSeed")
			return
		}
		// TODO: I don't know how to check if event.data.data.seed is
		// a Uint8Array
		if (event.data.data.seed.length !== 16) {
			log("seed is the wrong length")
			errors.push("presentSeed did not provide a 16 byte seed")
			rejectSeed("provided seed way not 16 bytes")
			return
		}
		log("worker has recevied seed")
		seed = event.data.data.seed
		resolveSeed() // This resolves a promise.
		return
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
		log("received a message with no nonce")
		// We can't call respondErr here because respondErr needs the
		// nonce, and the nonce doesn't exist.
		return
	}

	// Define a helper method for sending an error as a response. This is a
	// typical function that you will see in normal modules.
	let respondErr = function(err: string) {
		postMessage({
			nonce: event.data.nonce,
			method: "response",
			err,
			data: null,
		})
	}
	// Check that module data  was provided. This again is guaranteed to be
	// provided by the kernel, most modules don't need this check.
	if (!("data" in event.data)) {
		errors.push("received a message with no data")
		respondErr("received a message with no data")
		return
	}

	// Create a method that exposes the seed to any caller.
	//
	// NOTE: Standard modules are not expected to expose their seed. These
	// APIs are available to *all* other modules, and the value of having a
	// module specific seed is that no other module knows what that seed
	// is. This is a testing module, and the test suite needs to see that a
	// seed was received and that it makes sense, so we expose the seed.
	//
	// There are cases where it makes sense for a module to expose its
	// seed. For example, there can be use cases where multiple modules all
	// want to share one seed, and so you'll have an authorization module
	// in the middle that exposes the seed, but only to other modules that
	// exist within an allow list of domains.
	if (event.data.method === "viewSeed") {
		log("inside of viewSeed, blocking on presentSeed")
		blockForSeed
		.then(x => {
			postMessage({
				nonce: event.data.nonce,
				method: "response",
				err: null,
				data: {
					seed,
				},
			})
		})
		.catch(err => {
			postMessage({
				nonce: event.data.nonce,
				method: "response",
				err: "there was a problem when the seed was presented: "+err,
			})
		})
		return
	}

	// Create a method to share all of the errors that the module has
	// detected.
	if (event.data.method === "readErrors") {
		blockForSeed
		.then(x => {
			postMessage({
				nonce: event.data.nonce,
				method: "response",
				err: null,
				data: {
					errors,
				},
			})
		})
		.catch(err => {
			postMessage({
				nonce: event.data.nonce,
				method: "response",
				err: "there was a problem when the seed was presented: "+err,
			})
		})
		return
	}

	// Catch any unrecognized methods. The test suite will intentionally
	// send nonsense method names.
	log("method is unrecognized")
	respondErr("method is unrecognized")
	return
}

// Now that onmessage has been established, need to send a message to the
// kernel indicating that startup is complete. The kernel will block all
// messages to the worker until it knows that the worker is ready.
postMessage({method: "startupComplete"})

// Send a log indicating the worker has started up.
log("worker is operational")
