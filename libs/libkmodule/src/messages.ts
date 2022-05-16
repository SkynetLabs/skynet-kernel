import { addContextToErr, respondErr } from "./err.js"
import { logErr } from "./log.js"
import { handleQueryUpdate, handleResponse, handleResponseUpdate } from "./queries.js"
import { handlePresentSeed } from "./seed.js"
import { tryStringify } from "./stringify.js"

// activeQuery is an object that gets provided to the handler of a query which
// contains all the necessary means of interacting with the query.
interface activeQuery {
	callerInput: any
	accept: any
	reject: any
	sendUpdate: any
	domain: string
}

// Create a router which will persist state
let router = {} as any
router["presentSeed"] = handlePresentSeed

// addHandler will add a new handler to the router to process specific methods.
function addHandler(method: string, handler: any) {
	router[method] = handler
}

// handleMessage is the standard handler for messages. It catches all standard
// methods like 'presentSeed' and 'response'.
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
	if (event.data.method === "responseUpdate") {
		handleResponseUpdate(event)
		return
	}

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
		// TODO: change kernel to not expect an err field.
		postMessage({
			method: "responseUpdate",
			nonce: event.data.nonce,
			data: updateData,
			err: null,
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
		router[event.data.method](activeQuery)
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

export { activeQuery, addHandler, handleMessage }
