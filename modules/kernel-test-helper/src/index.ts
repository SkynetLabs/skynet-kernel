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

// Define the testerModule that we use to help coordinate testing.
const testerModule = "AQB6Gs0VcwH-xvEUaoGqORMNuBvpXdt0wRyex-Kqckad-A"

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

// Set up the state required to make queries and handle responses.
var queriesNonce = 0
var queries = {} as any
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
function handleResponse(event: MessageEvent) {
	if (!(event.data.nonce in queries)) {
		log("no open query found for provided nonce: "+JSON.stringify(event.data))
		errors.push("module received response with no matching query")
		return
	}
	queries[event.data.nonce](event.data)
	delete queries[event.data.nonce]
}

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

// handleViewTesterSeed makes a query to the tester module to grab its seed. It
// then returns the seed of the tester module. This method is used by the
// tester module to check that multi-hop module communication works.
function handleViewTesterSeed(event: MessageEvent) {
	// Build the query.
	let data = {
		module: testerModule,
		method: "viewSeed",
		data: {},
	}
	// Perform the query.
	log("sending viewSeed query to tester module")
	newKernelQuery("moduleCall", data, function(inData: any) {
		handleViewSeedResponse(event, inData)
	})
}
function handleViewSeedResponse(event: MessageEvent, data: any) {
	log("received viewSeed response from tester module")
	// Perform input validation.
	if (!("err" in data) || !("data" in data)) {
		let err = "tester module provided response without err or data fields"
		errors.push(err)
		respondErr(event, err)
		return
	}
	if (data.err !== null) {
		let err = "tester module responded with an err: "+data.err
		errors.push(err)
		respondErr(event, err)
		return
	}
	if (!("seed" in data.data)) {
		let err = "tester module did not provide seed"
		errors.push(err)
		respondErr(event, err)
		return
	}

	// Pass the tester seed back to the caller.
	log("helper module is sending a response to the caller")
	postMessage({
		nonce: event.data.nonce,
		method: "response",
		err: null,
		data: {
			testerSeed: data.data.seed,
		},
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

	// Handle any responses to queries that we've made.
	if (event.data.method === "response") {
		handleResponse(event)
		return
	}

	// Like data, the kernel guarantees that 'domain' is going to be
	// provided. Most modules don't need to perform this check.
	if (!("domain" in event.data)) {
		errors.push("received a message with no domain")
		respondErr(event, "received a message with no domain")
		return
	}

	// Check for a 'viewSeed' method. Note that this method is highly
	// unsual and only exists here for testing purposes, most modules
	// should not be exposing their seed.
	if (event.data.method === "viewSeed") {
		handleViewSeed(event)
		return
	}
	if (event.data.method === "viewTesterSeed") {
		handleViewTesterSeed(event)
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

	// Check for the mirrorDomain method, which just informs the caller
	// what domain the kernel has assigned to them.
	if (event.data.method === "mirrorDomain") {
		log("helper is sending a domain home: "+event.data.domain)
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

	// Catch any unrecognized methods. The test suite will intentionally
	// send nonsense method names.
	respondErr(event, "unrecognized method sent to test module: "+JSON.stringify(event.data))
	errors.push("received an unrecognized method: "+event.data.method)
	return
}
