// addContextToErr is a helper function that standardizes the formatting of
// adding context to an error. Within the world of go we discovered that being
// persistent about layering context onto errors is helpful when debugging,
// even though it often creates rather verbose error messages.
//
// addContextToErr will return null if the input err is null.
function addContextToErr(err: string | null, context: string): string | null {
	if (err === null) {
		return null
	}
	return context + ": " + err
}

// composeErr takes a series of inputs and composes them into a single string.
// Each element will be separated by a newline. If the input is not a string,
// it will be transformed into a string with JSON.stringify.
//
// Any object that cannot be stringified will be skipped, though an error will
// be logged.
function composeErr(...inputs: any): string {
	let result = ""
	for (let i = 0; i < inputs.length; i++) {
		// Prepend a newline if this isn't the first element.
		if (i !== 0) {
			result += "\n"
		}
		// Strings can be added without modification.
		if (typeof inputs[i] === "string") {
			result += inputs[i]
			continue
		}
		// Everything else needs to be stringified, log an error if it
		// fails.
		try {
			let str = JSON.stringify(inputs[i])
			result += str
		} catch (err: any) {
			result += "unable to stringify object: " + err.toString()
		}
	}
	return result
}

export { addContextToErr, composeErr }
