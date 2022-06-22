// tryStringify will try to turn the provided input into a string. If the input
// object is already a string, the input object will be returned. If the input
// object has a toString method, the toString method will be called. If that
// fails, we try to call JSON.stringify on the object. And if that fails, we
// set the return value to "[stringify failed]".
function tryStringify(obj: any): string {
	// Check for undefined input.
	if (obj === undefined) {
		return "[cannot stringify undefined input]"
	}
	if (obj === null) {
		return "[null]"
	}

	// Parse the error into a string.
	if (typeof obj === "string") {
		return obj
	}

	// Check if the object has a 'toString' method defined on it. To ensure
	// that we don't crash or throw, check that the toString is a function, and
	// also that the return value of toString is a string.
	if (Object.prototype.hasOwnProperty.call(obj, "toString")) {
		if (typeof obj.toString === "function") {
			let str = obj.toString()
			if (typeof str === "string") {
				return str
			}
		}
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
