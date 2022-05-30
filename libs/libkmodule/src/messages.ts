import { addContextToErr, respondErr } from "./err.js"
import { logErr } from "./log.js"
import {
	clearIncomingQuery,
	getSetReceiveUpdate,
	handleQueryUpdate,
	handleResponse,
	handleResponseNonce,
	handleResponseUpdate,
} from "./queries.js"
import { handlePresentSeed } from "./seed.js"
import { tryStringify } from "./stringify.js"

// dataFn can take any object as input and has no return value.
type dataFn = (data?: any) => void

// errFn must take a string as input, which will be relayed as an error. It has
// no return value.
type errFn = (err: string) => void

// handlerFn takes an activeQuery as input and has no return value. The return
// is expected to come in the form of calling aq.accept or aq.reject.
type handlerFn = (aq: activeQuery) => void

// activeQuery is an object that gets provided to the handler of a query and
// contains all necessary elements for interacting with the query.
interface activeQuery {
	// callerInput is arbitrary input provided by the caller that is not
	// checked by the kernel. Modules should verify the callerInput before
	// using any fields.
	callerInput: any

	// accept and reject are functions that will send response messages
	// that close out the query. accept can take an arbitrary object as
	// input, reject should always be a string.
	accept: dataFn
	reject: errFn

	// domain is a field provided by the kernel that informs the module who
	// the caller is. The module can use the domain to make access control
	// decisions, and determine if a particular caller should be allowed to
	// use a particular API.
	domain: string

	// sendUpdate is used for sending responseUpdate messages to the
	// caller. These messages can contain arbitrary information.
	sendUpdate: dataFn

	// setReceiveUpdate is part of a handshake that needs to be performed
	// to receive queryUpdates from the caller. It is a function that takes
	// another function as input. The function provided as input is the
	// function that will be called to process incoming queryUpdates.
	setReceiveUpdate?: (receiveUpdate: dataFn) => void
}

// addHandlerOptions defines the set of possible options that can be provided
// to the addHandler function.
//
// The 'receiveUpdates' option indicates whether the handler can receive
// updates and defaults to false. If it is set to false, any queryUpdate
// messages that get sent will be discarded. If it is set to 'true', any
// queryUpdate messages that get sent will be held until the handler provides a
// 'receiveUpdate' function to the activeQuery object using the
// activeQuery.setReceiveUpdate function.
interface addHandlerOptions {
	receiveUpdates?: boolean
}

// queryRouter defines the hashmap that is used to route queries to their
// respective handlers. The 'handler' field is the function that will be called
// to process the query, and 'receiveUpdates' is a flag that indicates whether
// or not queryUpdate messages should be processed.
interface queryRouter {
	[method: string]: {
		handler: handlerFn
		receiveUpdates: boolean
	}
}

// Set the default handler options so that they can be imported and used by
// modules. This is syntactic sugar.
const addHandlerDefaultOptions = {
	receiveUpdates: false,
}

// Create a router which will route methods to their handlers. New handlers can
// be added to the router by calling 'addHandler'. Currently, there is only one
// default handler in the router which is "presentSeed".
//
// handleMessage implicitly handles 'queryUpdate' and 'responseUpdate' and
// 'response' methods as well, but those don't go through the router because
// special handling is required for those methods.
let router: queryRouter = {}
router["presentSeed"] = { handler: handlePresentSeed, receiveUpdates: false }

// addHandler will add a new handler to the router to process specific methods.
//
// NOTE: The 'queryUpdate', 'response', and 'responseUpdate' messages are all
// handled before the router is considered, and therefore they cannot be
// overwritten by calling 'addHandler'.
function addHandler(method: string, handler: handlerFn, options?: addHandlerOptions) {
	// If options is undefined, use the default options.
	if (options === undefined) {
		options = addHandlerDefaultOptions
	}

	// Don't set the 'receiveUpdates' flag in the router if the provided
	// options haven't enabled them.
	//
	// NOTE: options.receiveUpdates may be undefined, that's why we
	// explicitly set it to talse here.
	if (options.receiveUpdates !== true) {
		router[method] = { handler, receiveUpdates: false }
		return
	}
	router[method] = { handler, receiveUpdates: true }
}

// handleMessage is the standard handler for messages. It has special hanlding
// for the 'queryUpdate', 'response', and 'responseUpdate' messages. Otherwise,
// it will use the router to connect moduleCalls to the appropriate handler.
//
// When passing a call off to a handler, it will create an 'activeQuery' object
// that the handler can work with.
function handleMessage(event: MessageEvent) {
	// Special handling for "response" messages.
	if (event.data.method === "queryUpdate") {
		handleQueryUpdate(event)
		return
	}
	if (event.data.method === "response") {
		handleResponse(event)
		return
	}
	if (event.data.method === "responseNonce") {
		handleResponseNonce(event)
		return
	}
	if (event.data.method === "responseUpdate") {
		handleResponseUpdate(event)
		return
	}

	// any specific reason why event.data.method in router wasn't used?
	// are you worries a method could be not defined on object but the
	// name would match a method of its prototype and execute anyway ?

	// Make sure we have a handler for this object.
	if (!Object.prototype.hasOwnProperty.call(router, event.data.method)) {
		respondErr(event, "unrecognized method '" + event.data.method + "'")
		return
	}

	// Set up the accept and reject functions. They use the 'responded'
	// variable to ensure that only one response is ever sent.
	let responded = false
	let accept = function (data: any) {
		// Check if a response was already sent.
		if (responded) {
			let str = tryStringify(data)
			logErr("accept called after response already sent: " + str)
			return
		}

		// Send a response.
		responded = true
		postMessage({
			nonce: event.data.nonce,
			method: "response",
			err: null,
			data,
		})

		// Clear this query from the set of incomingQueries.
		clearIncomingQuery(event.data.nonce)
	}
	let reject = function (err: string) {
		// Check if a response was already sent.
		if (responded) {
			let str = tryStringify(err)
			logErr("reject called after response already sent: " + str)
			return
		}

		// Send the response as an error.
		responded = true
		respondErr(event, err)
	}

	// Define the function that will allow the handler to send an update.
	let sendUpdate = function (updateData: any) {
		// should we also check here if responded === false ?

		postMessage({
			method: "responseUpdate",
			nonce: event.data.nonce,
			data: updateData,
		})
	}

	// Try to handle the message. If an exception is thrown by the handler,
	// catch the error and respond with that error.
	//
	// NOTE: Throwing exceptions is considered bad practice, this code is only
	// here because the practice is so common throughout javascript and we want
	// to make sure developer code works without developers getting too
	// frustrated.
	//
	// NOTE: The final argument contains a set of extra fields about the call,
	// for example providing the domain of the caller. We used an object for
	// this final field so that it could be extended later.
	try {
		let activeQuery: activeQuery = {
			callerInput: event.data.data,
			accept,
			reject,
			sendUpdate,
			domain: event.data.domain,
		}
		if (router[event.data.method].receiveUpdates) {
			activeQuery.setReceiveUpdate = getSetReceiveUpdate(event)
		}
		router[event.data.method].handler(activeQuery)
	} catch (err: any) {
		// Convert the thrown error and log it. We know that strErr is a string
		// because tryStringify must return a string, and addContextToErr only
		// returns null if strErr is null.
		let strErr = tryStringify(err)
		let finalErr = <string>addContextToErr(strErr, "module threw an error")
		logErr(finalErr)

		// Only send a response if a response was not already sent.
		if (responded) {
			return
		}
		respondErr(event, finalErr)
	}
}

export { activeQuery, addHandler, dataFn, handleMessage }
