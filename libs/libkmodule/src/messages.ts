import { respondErr } from "./err.js"
import { handlePresentSeed } from "./seed.js"

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
	if (Object.prototype.hasOwnProperty.call(router, event.data.method)) {
		router[event.data.method](event.data.data)
		return
	}
	respondErr(event, "unrecognized method '" + event.data.method + "'")
}

export { handleMessage, addHandler }
