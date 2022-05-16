// kernel-test-suite is a kernel module that facilitates integration testing.

import {
	addContextToErr,
	addHandler,
	callModule,
	getSeed,
	handleMessage,
	log,
	logErr,
	newKernelQuery,
	respondErr,
	tryStringify,
} from "libkmodule"

// Establish the module name of the helper module that we'll be using to test
// cross-module communciation and a few other things that we can only test by
// using another outside module.
let helperModule = "AQCoaLP6JexdZshDDZRQaIwN3B7DqFjlY7byMikR7u1IEA"

// Set up a list of errors that can be queried by a caller. This is a long
// running list of errors that will grow over time as errors are encountered.
// Only unexpected errors that indicate a bug of some sort are added to this
// list.
//
// Most modules will not have something like this, this is really only here to
// increase test coverage and make sure that every error is tracked in case the
// kernel is dropping logging messages or is having other problems that will
// cause errors to be silently missed within the test suite.
let errors: string[] = []

// handlePresentSeedExtraChecks processes a 'presentSeed' method from the
// kernel. We perform extra checks that a normal module would not need to
// perform to ensure that the kernel is filling out all of the expected fields.
let seedReceived = false
function checkPresentSeed(event: MessageEvent) {
	// Check that the domain is the kernel. Note that the kernel will not
	// allow external callers to use the 'presentSeed' function, so again
	// this check is important for the testing module, but not otherwise.
	if (!("domain" in event.data)) {
		errors.push("presentSeed was called without providing a domain")
		logErr("presentSeed called without providing a 'domain' field")
		return
	}
	if (event.data.domain !== "root") {
		errors.push("presentSeed called by non-root domain")
		logErr("presentSeed called with non-root domain")
		return
	}

	// Check that the kernel has not mistakenly already sent us a
	// presentSeed call.
	if (seedReceived === true) {
		errors.push("presentSeed was called more than one time")
		logErr("seedReceived is already true")
		return
	}
	seedReceived = true

	// Check that the kernel provided a well formatted seed.
	if (!("seed" in event.data.data)) {
		logErr("no 'seed' in event.data.data")
		errors.push("presentSeed did not include a seed")
		return
	}
	if (!(event.data.data.seed instanceof Uint8Array)) {
		logErr("seed is not a Uint8Array")
		errors.push("seed is not a Uint8Array")
		return
	}
	if (event.data.data.seed.length !== 16) {
		logErr("seed is the wrong length")
		errors.push("presentSeed did not provide a 16 byte seed")
		return
	}
}

// callModulePerformanceSequential will run the 'viewSeed' method on the helper
// module the provided number of times in series.
async function handleCallModulePerformanceSequential(activeQuery: any) {
	// Check that a proper number of iterations was provided.
	if (!("iterations" in activeQuery.callerInput)) {
		errors.push("callModulePerformanceSequential called without providing an 'iterations' field")
		activeQuery.reject("input is expected to have an 'iterations' value")
		return
	}
	if (typeof activeQuery.callerInput.iterations !== "number") {
		errors.push("callModulePerformanceSequential called but iterations was not of type 'number'")
		activeQuery.reject("iterations needs to be a number")
		return
	}

	// perform a 'viewSeed' call on the helper module the specified number of
	// times sequentially.
	for (let i = 0; i < activeQuery.callerInput.iterations; i++) {
		let [, err] = await callModule(helperModule, "viewSeed", {})
		if (err !== null) {
			logErr("error when using callModule to viewSeed on the helper module", err)
			errors.push(err)
			activeQuery.reject(err)
			return
		}
	}
	activeQuery.accept({ message: "helper module calls complete" })
}

// callModulePerformanceParallel will run the 'viewSeed' method on the helper
// module the provided number of times in parallel.
function handleCallModulePerformanceParallel(activeQuery: any) {
	// Check that a proper number of iterations was provided.
	if (!("iterations" in activeQuery.callerInput)) {
		errors.push("callModulePerformanceSequential called without providing an 'iterations' field")
		activeQuery.reject("input is expected to have an 'iterations' value")
		return
	}
	if (typeof activeQuery.callerInput.iterations !== "number") {
		errors.push("callModulePerformanceSequential called but iterations was not of type 'number'")
		activeQuery.reject("iterations needs to be a number")
		return
	}

	// perform a 'viewSeed' call on the helper module the specified number of
	// times in parallel.
	let promises = []
	for (let i = 0; i < activeQuery.callerInput.iterations; i++) {
		promises.push(callModule(helperModule, "viewSeed", {}))
	}
	Promise.all(promises).then((results) => {
		for (let i = 0; i < results.length; i++) {
			if (results[i][1] !== null) {
				logErr("got an error in the parallel callModule test", results[i][1])
				activeQuery.reject("parallel callModule test failed: " + results[i][1])
				return
			}
		}
		activeQuery.accept({ message: "helper module calls complete" })
	})
}

// handleMirrorDomain handles a call to mirrorDomain.
function handleMirrorDomain(activeQuery: any) {
	activeQuery.accept({ domain: activeQuery.domain })
}

// handleSendTestToKernel handles a call to "sendTestToKernel". It sends a test
// message to the kernel and then checks that it properly receives the
// response.
async function handleSendTestToKernel(activeQuery: any) {
	// When performing a kernel query, we don't need to provide a function to
	// handle responseUpdates because we don't care about them. Typically this
	// is abstracted more, but this is a special case where we need to call
	// 'test' on the kernel itself and therefore can't use 'callModule'.
	let emptyFn = function () {
		return
	}
	let [, queryPromise] = newKernelQuery("test", {}, emptyFn)
	let [resp, err] = await queryPromise
	if (err !== null) {
		errors.push(<string>addContextToErr(err, "received error when performing 'test' method on kernel"))
		activeQuery.reject(err)
		return
	}
	if (!("version" in resp)) {
		errors.push("kernel response to test message didn't include a version:", tryStringify(resp))
		activeQuery.reject("no version provided by kernel 'test' method")
		return
	}
	activeQuery.accept({ kernelVersion: resp.version })
}

// handleTestCORS checks that the webworker is able to make webrequests to at
// least one portal. If not, this indicates that CORS is not set up correctly
// somewhere in the client.
function handleTestCORS(activeQuery: any) {
	fetch("https://siasky.net")
		.then((response) => {
			activeQuery.accept({ url: response.url })
		})
		.catch((errFetch) => {
			let err = "fetch request failed: " + errFetch
			errors.push(err)
			activeQuery.reject(err)
		})
}

// handleTestLogging writes a bunch of logs to allow the operator to verify
// that logging is working.
function handleTestLogging(activeQuery: any) {
	log("this is a test log")
	log("this", "is", "a", "multi-arg", "log")
	log({ another: "test", multi: "arg" }, "log", { extra: "arg" })
	logErr("this is an intentional error from the kernel test suite module")
	activeQuery.accept({})
}

// handleTesterMirrorDomain handles a call to 'testerMirrorDomain'. The tester
// module will call 'mirrorDomain' on the helper module and return the result.
async function handleTesterMirrorDomain(activeQuery: any) {
	let [resp, err] = await callModule(helperModule, "mirrorDomain", {})
	if (err !== null) {
		errors.push(err)
		activeQuery.reject(err)
		return
	}

	if (!("domain" in resp)) {
		let err = "helper module response did not have data.domain field: " + tryStringify(resp)
		errors.push(err)
		activeQuery.reject(err)
		return
	}
	activeQuery.accept({ domain: resp.domain })
}

// handleTestResponseUpdate will respond to a query with three updates spaced
// 200 milliseconds apart, and then finally respond with a full response to
// close out the message. The value 'eventProgress' is used to distinguish what
// order the responses are supposed to arrive in.
function handleTestResponseUpdate(activeQuery: any) {
	setTimeout(() => {
		activeQuery.sendUpdate({ eventProgress: 25 })
	}, 200)
	setTimeout(() => {
		activeQuery.sendUpdate({ eventProgress: 50 })
	}, 400)
	setTimeout(() => {
		activeQuery.sendUpdate({ eventProgress: 75 })
	}, 600)
	setTimeout(() => {
		activeQuery.accept({ eventProgress: 100 })
	}, 800)
}

// handleViewHelperSeed handles a call to 'viewHelperSeed', it asks the helper
// module for its seed and then compares the helper module's seed to its own
// seed.
async function handleViewHelperSeed(activeQuery: any) {
	// Perform the module call.
	let [resp, err] = await callModule(helperModule, "viewSeed", {})
	if (err !== null) {
		logErr("error when using callModule to viewSeed on the helper module", err)
		errors.push(err)
		activeQuery.reject(err)
		return
	}

	// Check that the return value contains a seed.
	if (!("seed" in resp)) {
		let err = "helper module response did not have seed field: " + tryStringify(resp)
		errors.push(err)
		activeQuery.reject(err)
		return
	}
	if (!(resp.seed instanceof Uint8Array)) {
		let err = "helper module seed is wrong type: " + tryStringify(resp)
		errors.push(err)
		activeQuery.reject(err)
		return
	}
	if (resp.seed.length !== 16) {
		let err = "helper module seed is wrong size: " + tryStringify(resp)
		errors.push(err)
		activeQuery.reject(err)
		return
	}

	// Check that the seed is well formed
	let seed = <Uint8Array>await getSeed
	let equal = true
	for (let i = 0; i < 16; i++) {
		if (seed[i] !== resp.seed[i]) {
			equal = false
			break
		}
	}
	if (equal === true) {
		let err = "helper module seed matches test module seed"
		errors.push(err)
		activeQuery.reject(err)
		return
	}
	activeQuery.accept({ message: "(success) helper seed does not match tester seed" })
}

// handleViewSeed responds to a query asking to see the specific seed for the
// module.
async function handleViewSeed(activeQuery: any) {
	let seed = await getSeed
	activeQuery.accept({ seed: seed })
}

// handleViewOwnSeedThroughHelper handles a call to 'viewOwnSeedThroughHelper'.
// It asks the helper module to ask the tester module (ourself) for its seed.
// If all goes well, the helper module should respond with our seed.
async function handleViewOwnSeedThroughHelper(activeQuery: any) {
	let [resp, err] = await callModule(helperModule, "viewTesterSeed", {})
	if (err !== null) {
		activeQuery.reject(err)
		return
	}

	if (!("testerSeed" in resp)) {
		let err = "helper module response did not have data.testerSeed field: " + tryStringify(resp)
		errors.push(err)
		activeQuery.reject(err)
		return
	}
	if (resp.testerSeed.length !== 16) {
		let err = "helper module seed is wrong size: " + tryStringify(resp)
		errors.push(err)
		activeQuery.reject(err)
		return
	}

	// Need to wait until the kernel has send us our seed to do a seed
	// comparison.
	let seed = <Uint8Array>await getSeed
	let equal = true
	for (let i = 0; i < 16; i++) {
		if (seed[i] !== resp.testerSeed[i]) {
			equal = false
			break
		}
	}
	if (equal === false) {
		let err = "when our seed is viewed thorugh the helper, it does not match\n" + seed + "\n" + resp.testerSeed
		errors.push(err)
		activeQuery.reject(err)
		return
	}
	activeQuery.accept({ message: "our seed as reported by the helper module is correct" })
}

// handleViewErrors will return the set of errors that have accumulated during
// testing.
function handleViewErrors(activeQuery: any) {
	activeQuery.accept({ errors })
}

// Add handlers for various test functions.
//
// NOTE: most of these are for testing only and are not recommended methods
// that should be implemented on a normal module. For example, 'viewSeed'
// exposes the module's seed to anyone that calls into the module. But the
// module's seed is supposed to be protected and should never be exposed over
// the API normally. We make an exception here because this module is used for
// testing purposes.
addHandler("callModulePerformanceSequential", handleCallModulePerformanceSequential)
addHandler("callModulePerformanceParallel", handleCallModulePerformanceParallel)
addHandler("mirrorDomain", handleMirrorDomain)
addHandler("sendTestToKernel", handleSendTestToKernel)
addHandler("testCORS", handleTestCORS)
addHandler("testLogging", handleTestLogging)
addHandler("testerMirrorDomain", handleTesterMirrorDomain)
addHandler("testResponseUpdate", handleTestResponseUpdate)
addHandler("viewHelperSeed", handleViewHelperSeed)
addHandler("viewSeed", handleViewSeed)
addHandler("viewOwnSeedThroughHelper", handleViewOwnSeedThroughHelper)
addHandler("viewErrors", handleViewErrors)

// onmessage receives messages from the kernel. Note that most onmessage
// functions will be a lot simpler, but because this is a test module we're
// doing input checking on the responses of the kernel to ensure the kernel is
// behaving correctly. Most modules can skip all of these checks because the
// kernel does guarantee that these fields will be correct.
onmessage = function (event: MessageEvent) {
	// Check that the kernel included a method in the message.
	//
	// NOTE: A typical kernel module does not need to check that event.data
	// contains a field called 'message', the kernel guarantees that the field
	// will be there. This however is a module designed to test the kernel, so
	// there are checks here to ensure that the kernel is properly following
	// meeting its intended guarantees.
	if (!("method" in event.data)) {
		errors.push("received a message with no method")
		logErr("received a message with no method: " + tryStringify(event.data))
		return
	}
	// Hande 'presentSeed', which gives the module a seed. Similar to
	// above, this version of the handler contains a lot of extra checks
	// purely because this is a testing module. Most modules will not need
	// to include all of these checks.
	if (event.data.method === "presentSeed") {
		checkPresentSeed(event)
	}

	// Check that all of the required fields are present.
	//
	// NOTE: Modules should not have to do input verification on these
	// fields, they can trust that the kernel is not malicious and is
	// sending them well formed messages. This module however is explicitly
	// intended to check that the kernel is functioning correctly, so it
	// does the checking here to ensure that there was no breaking change.
	if (!("nonce" in event.data) && event.data.method !== "presentSeed") {
		errors.push("received a message with no nonce")
		logErr("received a message with no nonce")
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

	// Like 'data', the kernel guarantees that a domain will be provided.
	// This check isn't necessary for most modules. The domain is not
	// provided on queryUpdate, responseUpdate, or response messages.
	let isResponse = event.data.method === "response"
	let isResponseUpdate = event.data.method === "responseUpdate"
	if (!("domain" in event.data) && !isResponse && !isResponseUpdate) {
		logErr("received a message with no domain: " + tryStringify(event.data))
		errors.push("received a message with no domain")
		respondErr(event, "received a message from kernel with no domain")
		return
	}

	// Pass what remains to the router.
	handleMessage(event)
}
