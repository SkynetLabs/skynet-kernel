// Define the state + methods that will grab the module's seed from the kernel.
// This is pretty standard, most modules will have this.
var seed: Uint8Array
var resolveSeed: Function
var rejectSeed: Function
var seedReceived = false
var blockForSeed = new Promise((resolve, reject) => {
	resolveSeed = resolve
	rejectSeed = reject
})
function acceptSeed(event: MessageEvent) {
	// Check that the domain is the kernel. Note that the kernel will not
	// allow external callers to use the 'presentSeed' function, so again
	// this check is important for the testing module, but not otherwise.
	if (!("domain" in event.data)) {
		errors.push("presentSeed was called without providing a domain")
		log("presentSeed called without providing a 'domain' field")
		rejectSeed("provided seed way not 16 bytes")
		return
	}
	if (event.data.domain !== "root") {
		errors.push("presentSeed called by non-root domain")
		log("presentSeed called with non-root domain"+JSON.stringify(event.data))
		return
	}

	// Check that the kernel has not mistakenly already sent us a
	// presentSeed call.
	if (seedReceived === true) {
		errors.push("presentSeed was called more than one time")
		log("seedReceived is already true")
		return
	}
	seedReceived = true

	// Check that the kernel provided a well formatted seed.
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

// Track any errors that come up during execution. This is non-standard, most
// modules will not need to do this.
var errors: string[] = []

// Create a helper function for logging. Most modules will have two helper
// functions, 'log' and 'logErr', which will set the 'isErr' flag to false and
// true respectively. Since this is a testing module, anything that needs to be
// logged constitutes an error.
function log(message: string) {
	postMessage({
		method: "log",
		data: {
			isErr: true,
			message,
		},
	})
}

// Define a helper method for sending an error as a response. This is a typical
// function that you will see in most modules.
function respondErr(event: MessageEvent, err: string) {
	postMessage({
		nonce: event.data.nonce,
		method: "response",
		err,
		data: null,
	})
}

// TODO: Add back the query handling code, because we need to handle a response
// from the test module so that we can ask the test module for its seed and
// send its own seed back to it.

// handle a call to 'viewSeed'. Most modules will not have any sort of support
// for a function like 'viewSeed', the seed is supposed to be private. But we
// need to make sure that the seed distribution from the kernel appears to be
// working, so we expose the seed for this module.
function handleViewSeed(event: MessageEvent) {
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
}


// onmessage receives messages from the kernel.
onmessage = function(event: MessageEvent) {
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
		acceptSeed(event)
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
	// Check that module data was provided. This again is guaranteed to be
	// provided by the kernel, most modules don't need this check.
	if (!("data" in event.data)) {
		errors.push("received a message with no data")
		respondErr(event, "received a message with no data")
		return
	}

	// Check for a 'viewSeed' method. Note that this method is highly
	// unsual and only exists here for testing purposes, most modules
	// should not be exposing their seed.
	if (event.data.method === "viewSeed") {
		handleViewSeed(event)
		return
	}

	// Create a method to share all of the errors that the module has
	// detected.
	if (event.data.method === "viewErrors") {
		postMessage({
			nonce: event.data.nonce,
			method: "response",
			err: null,
			data: {
				errors,
			},
		})
		return
	}

	// Catch any unrecognized methods. The test suite will intentionally
	// send nonsense method names.
	respondErr(event, "unrecognized method sent to test module: "+JSON.stringify(event.data))
	errors.push("received an unrecognized method: "+event.data.method)
	return
}
