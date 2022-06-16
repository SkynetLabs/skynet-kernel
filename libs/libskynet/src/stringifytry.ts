// tryStringify will try to turn the provided input into a string. If the input
// object is already a string, the input object will be returned. If the input
// object has a toString method, the toString method will be called. If that
// fails, we try to call JSON.stringify on the object. And if that fails, we
// set the return value to "[stringify failed]".
function tryStringify(obj: any): string {
	// Check for undefined input.
	if (obj === undefined || obj === null) {
		return "[cannot stringify undefined input]"
	}

	// Parse the error into a string.
	if (typeof obj === "string") {
		return obj
	}

	// If the object does not have a custom toString, attempt to perform a
	// JSON.stringify.
	try {
		return JSON.stringify(obj)
	} catch {
		return "[stringify failed]"
	}
}

export { tryStringify }
