// Define helper functions that will allow the worker to block until the seed
// is received. This is going to be standard code in every module that needs a
// private seed. Not all modules will require a private seed, especially if
// they are using other modules (such as fsDAC and profileDAC) for shared
// state.
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
//
// Most modules will not have something like this, this is really only here to
// increase test coverage and make sure that every error is tracked in case the
// kernel is dropping logging messages or is having other problems that will
// cause errors to be silently missed within the test suite.
var errors: string[] = []

// Create a helper function for logging.
//
// Most modules will do logging of some form, though most modules will have
// both a log and a logErr function, where 'isErr' is set to false in the
// standard log function. For the test suite, if we feel a need to log
// something at all it's because there was an error.
function log(message: string) {
	postMessage({
		method: "log",
		data: {
			isErr: true,
			message,
		},
	})
}

// Define a helper method for sending an error as a response. This is a
// typical function that you will see in normal modules.
function respondErr(event: MessageEvent, err: string) {
	postMessage({
		nonce: event.data.nonce,
		method: "response",
		err,
		data: null,
	})
}

// Define helper state for tracking the nonces of queries we open to the kernel
// and to other modules. This is going to be standard code in every module that
// needs to communicate with the kernel or with other modules.
//
// queriesNonce is a counter that ensures every query has a unique nonce, and
// queries is a hashmap that maps nonces to their corresponding queries.
var queriesNonce = 0
var queries = {} as any

// Create a helper function for sending queries directly to the kernel. If you
// want to talk to a module, use newModuleQuery.
function newKernelQuery(method: string, data: any, handler: Function) {
	let nonce = queriesNonce
	queriesNonce += 1
	queries[nonce] = handler
	postMessage({
		method,
		nonce,
		data,
	})
}

// handleResponse will take a response and match it to the correct query.
function handleResponse(event: MessageEvent) {
	 if (!(event.data.nonce in queries)) {
		 log("no open query found for provided nonce: "+JSON.stringify(event.data))
		 errors.push("module received response for nonce with no open query")
		 return
	 }
	 queries[event.data.nonce](event.data)
	 delete queries[event.data.nonce]
}

// handleTestResponse is the handler for a response to a 'test' query sent to
// the kernel. The originalEvent input is the event associated with the
// original query that asked this module to send a test message to the kernel.
// The kernelResponseData is the data that the kernel provided as a response
// when we sent it a test message.
function handleTestResponse(originalEvent: MessageEvent, kernelResponseData: any) {
	if (!("err" in kernelResponseData) || !("data" in kernelResponseData)) {
		errors.push("kernel response does not have the exptected fields: "+JSON.stringify(kernelResponseData))
		respondErr(originalEvent, "kernel response did not have err and data fields: "+JSON.stringify(kernelResponseData))
		return
	}
	if (!("version" in kernelResponseData.data)) {
		errors.push("kernel response to test message didn't include a version: "+JSON.stringify(kernelResponseData))
		respondErr(originalEvent, "kernel response did not provide a version: "+JSON.stringify(kernelResponseData))
		return
	}

	// Respond with a success.
	postMessage({
		nonce: originalEvent.data.nonce,
		method: "response",
		err: null,
		data: {
			kernelVersion: kernelResponseData.data.version,
		},
	})
}

// acceptSeed processes a 'presentSeed' method from the kernel.
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

// handleViewSeed responds to a query asking to see the specific seed for the
// module.
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
	// Check that module data  was provided. This again is guaranteed to be
	// provided by the kernel, most modules don't need this check.
	if (!("data" in event.data)) {
		errors.push("received a message with no data")
		respondErr(event, "received a message with no data")
		return
	}

	if (event.data.method === "response") {
		handleResponse(event)
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
		handleViewSeed(event)
		return
	}

	// Handle a request asking the module to send a test message to the
	// kernel.
	if (event.data.method === "sendTestToKernel") {
		newKernelQuery("test", {}, function(data: any) {
			// The handler for the query needs the current event so
			// that it knows how to form the response to the
			// original query.
			handleTestResponse(event, data)
		})
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
