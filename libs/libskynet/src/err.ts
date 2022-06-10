import { tryStringify } from "./stringifytry.js"

// addContextToErr is a helper function that standardizes the formatting of
// adding context to an error. Within the world of go we discovered that being
// persistent about layering context onto errors is helpful when debugging,
// even though it often creates rather verbose error messages.
//
// addContextToErr will return null if the input err is null.
//
// NOTE: To protect against accidental situations where an Error type or some
// other type is provided instead of a string, we wrap both of the inputs with
// tryStringify before returning them. This prevents runtime failures.
function addContextToErr(err: string | null, context: string): string {
	if (err === null) {
		err = "[no error provided]"
	}
	return tryStringify(context) + ": " + tryStringify(err)
}

// composeErr takes a series of inputs and composes them into a single string.
// Each element will be separated by a newline. If the input is not a string,
// it will be transformed into a string with JSON.stringify.
//
// Any object that cannot be stringified will be skipped, though an error will
// be logged.
function composeErr(...inputs: any): string | null {
	let result = ""
	let resultEmpty = true
	for (let i = 0; i < inputs.length; i++) {
		if (inputs[i] === null) {
			continue
		}
		if (resultEmpty) {
			resultEmpty = false
		} else {
			result += "\n"
		}
		result += tryStringify(inputs[i])
	}
	if (resultEmpty) {
		return null
	}
	return result
}

export { addContextToErr, composeErr }
