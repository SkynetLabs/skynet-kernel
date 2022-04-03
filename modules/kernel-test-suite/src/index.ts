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

// Establish the module name of the helper module that we'll be using to test
// cross-module communciation and a few other things that we can only test by
// using another outside module.
var helperModule = "AQDhKoOtI5PbzUEtwKM_qGzvfBCncevwTOiuBxKpV_ASig"

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
	if (kernelResponseData.err !== null) {
		let err = "test call to kernel returned an error: "+kernelResponseData.err
		errors.push(err)
		respondErr(originalEvent, err)
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

// handleViewHelperSeed handles a call to 'viewHelperSeed', it asks the helper
// module for its seed and then compares the helper module's seed to its own
// seed.
function handleViewHelperSeed(event: MessageEvent) {
	let outData = {
		module: helperModule,
		method: "viewSeed",
		data: {},
	}
	newKernelQuery("moduleCall", outData, function(inData: any) {
		handleViewHelperSeedResponse(event, inData)
	})
}
function handleViewHelperSeedResponse(originalEvent: MessageEvent, data: any) {
	if (!("err" in data) || !("data" in data)) {
		let err = "helper module response did not have data+err fields: "+JSON.stringify(data)
		errors.push(err)
		respondErr(originalEvent, err)
		return
	}
	if (data.err !== null) {
		let err = "helper module viewSeed call returned an error: "+data.err
		errors.push(err)
		respondErr(originalEvent, err)
		return
	}
	if (!("seed" in data.data)) {
		let err = "helper module response did not have data.seed field: "+JSON.stringify(data)
		errors.push(err)
		respondErr(originalEvent, err)
		return
	}
	if (data.data.seed.length !== 16) {
		let err = "helper module seed is wrong size: "+JSON.stringify(data)
		errors.push(err)
		respondErr(originalEvent, err)
		return
	}

	// Need to wait until the kernel has send us our seed to do a seed
	// comparison.
	blockForSeed
	.then(x => {
		let equal = true
		for (let i = 0; i < 16; i++) {
			if (seed[i] !== data.data.seed[i]) {
				equal = false
				break
			}
		}
		if (equal === true) {
			let err = "helper module seed matches test module seed"
			errors.push(err)
			respondErr(originalEvent, err)
			return
		}
		// Respond success.
		postMessage({
			nonce: originalEvent.data.nonce,
			method: "response",
			err: null,
			data: {
				message: "(success) helper seed does not match tester seed",
			},
		})
	})
	.catch(err => {
		let helperSeedStr = JSON.stringify(data.data.seed)
		let seedStr = JSON.stringify(seed)
		errors.push("issue in getting seed from kernel: "+err+helperSeedStr+seedStr)
		respondErr(originalEvent, "test module could not get seed: "+err)
		return
	})
}

// handleViewOwnSeedThroughHelper handles a call to 'viewOwnSeedThroughHelper'.
// It asks the helper module to ask the tester module (ourself) for its seed.
// If all goes well, the helper module should respond with our seed.
function handleViewOwnSeedThroughHelper(event: MessageEvent) {
	let outData = {
		module: helperModule,
		method: "viewTesterSeed",
		data: {},
	}
	newKernelQuery("moduleCall", outData, function(inData: any) {
		handleViewTesterSeedResponse(event, inData)
	})
}
function handleViewTesterSeedResponse(originalEvent: MessageEvent, data: any) {
	if (!("err" in data) || !("data" in data)) {
		let err = "helper module response did not have data+err fields: "+JSON.stringify(data)
		errors.push(err)
		respondErr(originalEvent, err)
		return
	}
	if (data.err !== null) {
		let err = "helper module returned an error: "+data.err
		errors.push(err)
		respondErr(originalEvent, err)
		return
	}
	if (!("testerSeed" in data.data)) {
		let err = "helper module response did not have data.testerSeed field: "+JSON.stringify(data)
		errors.push(err)
		respondErr(originalEvent, err)
		return
	}
	if (data.data.testerSeed.length !== 16) {
		let err = "helper module seed is wrong size: "+JSON.stringify(data)
		errors.push(err)
		respondErr(originalEvent, err)
		return
	}

	// Need to wait until the kernel has send us our seed to do a seed
	// comparison.
	blockForSeed
	.then(x => {
		let equal = true
		for (let i = 0; i < 16; i++) {
			if (seed[i] !== data.data.testerSeed[i]) {
				equal = false
				break
			}
		}
		if (equal === false) {
			let err = "when our seed is viewed thorugh the helper, it does not match"
			errors.push(err)
			respondErr(originalEvent, err)
			return
		}
		// Respond success.
		postMessage({
			nonce: originalEvent.data.nonce,
			method: "response",
			err: null,
			data: {
				message: "our seed as reported by the helper is correct",
			},
		})
	})
	.catch(err => {
		let helperSeedStr = JSON.stringify(data.data.testerSeed)
		let seedStr = JSON.stringify(seed)
		errors.push("issue in getting seed from kernel: "+err+helperSeedStr+seedStr)
		respondErr(originalEvent, "test module could not get seed: "+err)
		return
	})
}

// handleTesterMirrorDomain handles a call to 'testerMirrorDomain'. The tester
// module will call 'mirrorDomain' on the helper module and return the result.
function handleTesterMirrorDomain(event: MessageEvent) {
	let outData = {
		module: helperModule,
		method: "mirrorDomain",
		data: {},
	}
	newKernelQuery("moduleCall", outData, function(inData: any) {
		handleTesterMirrorDomainResponse(event, inData)
	})
}
function handleTesterMirrorDomainResponse(event: MessageEvent, data: any) {
	if (!("err" in data) || !("data" in data)) {
		let err = "helper module response did not have data+err fields: "+JSON.stringify(data)
		errors.push(err)
		respondErr(event, err)
		return
	}
	if (data.err !== null) {
		let err = "helper module returned an error: "+data.err
		errors.push(err)
		respondErr(event, err)
		return
	}
	if (!("domain" in data.data)) {
		let err = "helper module response did not have data.domain field: "+JSON.stringify(data)
		errors.push(err)
		respondErr(event, err)
		return
	}
	// Respond with the domain.
	postMessage({
		nonce: event.data.nonce,
		method: "response",
		err: null,
		data: {
			domain: data.data.domain,
		},
	})
}

// handleTestCORS checks that the webworker is able to make webrequests to at
// least one portal. If not, this indicates that CORS is not set up correctly
// somewhere in the client.
function handleTestCORS(event: MessageEvent) {
	fetch("https://siasky.net")
	.then(response => {
		postMessage({
			nonce: event.data.nonce,
			method: "response",
			err: null,
			data: {
				url: response.url,
			},
		})
	})
	.catch(errFetch => {
		let err = "fetch request failed: "+errFetch
		errors.push(err)
		respondErr(event, err)
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
	// Check that module data  was provided. This again is guaranteed to be
	// provided by the kernel, most modules don't need this check.
	if (!("data" in event.data)) {
		errors.push("received a message with no data")
		respondErr(event, "received a message with no data")
		return
	}


	// Handle any responses to queries that we've made.
	if (event.data.method === "response") {
		handleResponse(event)
		return
	}

	// Like 'data', the kernel guarantees that a domain will be provided.
	// This check isn't necessary for most modules. The domain is not
	// provided on queryUpdate, responseUpdate, or response messages.
	if (!("domain" in event.data)) {
		log("received a message with no domain: "+JSON.stringify(event.data))
		errors.push("received a message with no domain")
		respondErr(event, "received a message from kernel with no domain")
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

	// Create a method that calls 'viewSeed' on a helper module. The helper
	// module will be revealing its own seed, and we will compare that seed
	// with our own to make sure that the kernel isn't giving out the same
	// seed to different modules. This test also helps to confirm that
	// cross module communication is working.
	if (event.data.method === "viewHelperSeed") {
		handleViewHelperSeed(event)
		return
	}

	// Create a method to view our own seed as seen by the helper. This
	// results in communication that goes:
	//
	// webapp => tester module => helper module => tester module -> helper
	// module -> tester module -> webapp, which demonstrates that an extra
	// level of communication is still working.
	if (event.data.method === "viewOwnSeedThroughHelper") {
		handleViewOwnSeedThroughHelper(event)
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

	// Check for the 'mirrorDomain' method, which just informs the caller
	// what domain the kernel has assigned to them.
	if (event.data.method === "mirrorDomain") {
		postMessage({
			nonce: event.data.nonce,
			method: "response",
			err: null,
			data: {
				domain: event.data.domain,
			},
		})
		return
	}

	// testerMirrorDomain will have the tester call 'mirrorDomain' on the
	// helper module, and then the tester will return whatever the helper
	// module established that the tester's domain was.
	if (event.data.method === "testerMirrorDomain") {
		handleTesterMirrorDomain(event)
		return
	}

	if (event.data.method === "testCORS") {
		handleTestCORS(event)
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
	respondErr(event, "unrecognized method was sent to test module: "+JSON.stringify(event.data))
	errors.push("received an unrecognized method: "+event.data.method)
	return
}
