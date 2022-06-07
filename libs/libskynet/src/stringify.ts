import { addContextToErr } from "./err.js"
import { error } from "./types.js"

// tryStringify will try to turn the provided input into a string. If the input
// object is already a string, the input object will be returned. If the input
// object has a toString method, the toString method will be called. If that
// fails, we try to call JSON.stringify on the object. And if that fails, we
// set the return value to "[stringify failed]".
function tryStringify(obj: any): string {
	// Parse the error into a string.
	if (typeof obj === "string") {
		return obj
	}

	// Check if the object has a custom toString and use that if so.
	let hasToString = typeof obj.toString === "function"
	if (hasToString && obj.toString !== Object.prototype.toString) {
		return obj.toString()
	}

	// If the object does not have a custom toString, attempt to perform a
	// JSON.stringify.
	try {
		return JSON.stringify(obj)
	} catch {
		return "[stringify failed]"
	}
}
// jsonStringify is a replacement for JSON.stringify that returns an error
// rather than throwing.
function jsonStringify(obj: any): [string, error] {
	try {
		let str = JSON.stringify(obj)
		return [str, null]
	} catch (err) {
		return ["", addContextToErr(tryStringify(err), "unable to stringify object")]
	}
}

export { jsonStringify, tryStringify }
