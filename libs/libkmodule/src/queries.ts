import { logErr } from "./log.js"
import { tryStringify } from "./stringify.js"

type receiveUpdateFn = (data: any) => void

// Define helper state for tracking the nonces of queries we open to the kernel
// and to other modules. queriesNonce is a counter that ensures every query has
// a unique nonce, and queries is a hashmap that maps nonces to their
// corresponding queries.
let queriesNonce = 0
let queries = {} as any

let incomingQueries = {} as any

// Define an empty function because the linter does not like when you use `() => {}`
let emptyFn = function () {
	return
}

// clearIncomingQuery will clear a query with the provided nonce from the set
// of incomingQueries. This method gets called when the response is either
// accepted or rejected.
function clearIncomingQuery(nonce: number) {
	delete incomingQueries[nonce]
}

// getSetReceiveUpdate returns a function that can be called to
function getSetReceiveUpdate(event: MessageEvent): (receiveUpdate: receiveUpdateFn) => void {
	// Set up the promise that allows us to block until the handler has
	// provided us its receiveUpdate function.
	let updateReceived: (ret: any) => void
	let blockForReceiveUpdate = new Promise((resolve) => {
		updateReceived = resolve
	})

	// Add the blockForReceiveUpdate object to the queryUpdateRouter.
	incomingQueries[event.data.nonce] = { blockForReceiveUpdate }
	return function (receiveUpdate: any) {
		incomingQueries[event.data.nonce].receiveUpdate = receiveUpdate
		updateReceived(undefined)
	}
}

// handleQueryUpdate currently discards all queryUpdates.
async function handleQueryUpdate(event: MessageEvent) {
	// Check that this is a function which can receive queryUpdates.
	if (!(event.data.nonce in incomingQueries)) {
		// No need to log an error, we may have closed out this query before
		// the update was received but after the update was sent.
		return
	}
	await incomingQueries[event.data.nonce].blockForReceiveUpdate
	incomingQueries[event.data.nonce].receiveUpdate(event.data.data)
}

// handleResponse will take a response and match it to the correct query.
//
// NOTE: The kernel guarantees that an err field and a data field and a nonce
// field will be present in any message that gets sent using the "response"
// method.
function handleResponse(event: MessageEvent) {
	// Look for the query with the corresponding nonce.
	if (!(event.data.nonce in queries)) {
		logErr("no open query found for provided nonce: " + tryStringify(event.data.data))
		return
	}

	// Check if the response is an error.
	if (event.data.err !== null) {
		logErr("there's an error in the data")
		queries[event.data.nonce].resolve([{}, event.data.err])
		delete queries[event.data.nonce]
		return
	}

	// Call the handler function using the provided data, then delete the query
	// from the query map.
	queries[event.data.nonce].resolve([event.data.data, null])
	delete queries[event.data.nonce]
}

// handleResponseNonce will handle a message with the method 'responseNonce'.
// This is a message from the kernel which is telling us what nonce we should
// use when we send queryUpdate messages to the kernel for a particular query.
function handleResponseNonce(event: MessageEvent) {
	// Check if the query exists. If it does not exist, it's possible that the
	// messages just arrived out of order and nothing is going wrong.
	if (!(event.data.nonce in queries)) {
		logErr("temp err: nonce could not be found")
		return
	}
	if ("kernelNonce" in queries[event.data.nonce]) {
		logErr("received two responseNonce messages for the same query nonce")
		return
	}
	queries[event.data.nonce]["kernelNonce"] = event.data.data.nonce
	queries[event.data.nonce]["kernelPassword"] = event.data.data.password
	queries[event.data.nonce].kernelNonceReceived(undefined)
	return
}

// handleResponseUpdate attempts to find the corresponding query using the
// nonce and then calls the corresponding receiveUpdate function.
//
// Because response and responseUpdate messages are sent asynchronously, it's
// completely possible that a responseUpdate is received after the query has
// been closed out by a response. We therefore just ignore any messages that
// can't be matched to a nonce.
function handleResponseUpdate(event: MessageEvent) {
	// Ignore this message if there is no corresponding query, the query may
	// have been closed out and this message was just processed late.
	if (!(event.data.nonce in queries)) {
		return
	}

	// Pass the update along to the corresponding receiveUpdate function.
	queries[event.data.nonce].receiveUpdate(event.data.data)
}

// callModule is a generic function to call a module. It will return whatever
// response is provided by the module.
//
// callModule can only be used for query-response communications, there is no
// support for handling queryUpdate or responseUpdate messages - they will be
// ignored if received. If you need those messages, use 'connectModule'
// instead.
function callModule(module: string, method: string, data: any): Promise<[responseData: any, err: string | null]> {
	let moduleCallData = {
		module,
		method,
		data,
	}
	// We omit the 'receiveUpdate' function because this is a no-op. If the
	// value is not defined, newKernelQuery will place in a no-op for us.
	let [, query] = newKernelQuery("moduleCall", moduleCallData, emptyFn)
	return query
}

// connectModule is a generic function to connect to a module. It is similar to
// callModule, except that it also supports sending and receiving updates in
// the middule of the call. If the module being called sends and update, the
// updated will be passed to the caller through the 'receiveUpdate' function.
// If the caller wishes to send an update to the module, it can use the
// provided 'sendUpdate' function.
//
// The call signature is a bit messy, so let's disect it a bit. The input
// values are the same as callModule, except there's a fourth input for
// providing a 'receiveUpdate' function. It is okay to provide 'null' or
// 'undefined' as the function to receive updates if you do not care to receive
// or process any updates sent by the module. If you do want to receive
// updates, the receiveUpdate function should have the following function
// signature:
//
// 		`function receiveUpdate(data: any)`
//
// The data that gets sent is at the full discretion of the module, and will
// depend on which method was called in the original query.
//
// The return value is a tuple of a 'sendUpdate' function and a promise. The
// promise itself resolves to a tuple which matches the tuple in the
// 'callModule' function - the first value is the response data, and the second
// value is an error. When the promise resolves, it means the query has
// completed and no more updates will be processed. Therefore, 'sendUpdate' is
// only valid until the promise resolves.
//
// sendUpdate has the following function signature:
//
// 		`function sendUpdate(data: any)`
//
// Like 'receiveUpdate', the data that should be sent when sending an update to
// the module is entirely determined by the module and will vary based on what
// method was called in the original query.
function connectModule(
	module: string,
	method: string,
	data: any,
	receiveUpdate: any
): [sendUpdate: any, response: Promise<[responseData: any, err: string | null]>] {
	let moduleCallData = {
		module,
		method,
		data,
	}
	// We omit the 'receiveUpdate' function because this is a no-op. If the
	// value is not defined, newKernelQuery will place in a no-op for us.
	return newKernelQuery("moduleCall", moduleCallData, receiveUpdate)
}

// newKernelQuery will send a postMessage to the kernel, handling details like
// the nonce. The first input value is the data that should be sent to the
// kernel. The second input value is an update function that should be called
// to process any 'responseUpdate' messages. The first return value is a
// function that can be called to provide a 'queryUpdate' and the final return
// value is a promise that gets resolved when a 'response' is sent that closes
// out the query.
//
// NOTE: Typically developers should not use this function. Instead use
// 'callModule' or 'connectModule'.
function newKernelQuery(
	method: any,
	data: any,
	receiveUpdate: any
): [sendUpdate: any, response: Promise<[responseData: any, err: string | null]>] {
	// Get the nonce for the query.
	let nonce = queriesNonce
	queriesNonce += 1

	// Set up the promise that resovles when we have received the responseNonce
	// from the kernel.
	queries[nonce] = {}
	let blockForKernelNonce = new Promise((resolve) => {
		queries[nonce]["kernelNonceReceived"] = resolve
	})

	// Create the sendUpdate function, which allows the caller to send a
	// queryUpdate. The update cannot actually be sent until the kernel has told us the responseNonce
	let sendUpdate = function (updateData: any) {
		blockForKernelNonce.then(() => {
			postMessage({
				method: "queryUpdate",
				nonce: queries[nonce].kernelNonce,
				password: queries[nonce].kernelPassword,
				data: updateData,
			})
		})
	}

	// Check that receiveUpdate is set.
	if (receiveUpdate === null || receiveUpdate === undefined) {
		receiveUpdate = emptyFn
	}

	// Establish the query in the queries map and then send the query to the
	// kernel.
	let p = new Promise((resolve) => {
		queries[nonce]["resolve"] = resolve
		queries[nonce]["receiveUpdate"] = receiveUpdate
		postMessage({
			method,
			nonce,
			data,
		})
	})
	return [sendUpdate, p as any]
}

export {
	callModule,
	clearIncomingQuery,
	connectModule,
	getSetReceiveUpdate,
	handleQueryUpdate,
	handleResponse,
	handleResponseNonce,
	handleResponseUpdate,
	newKernelQuery,
}
