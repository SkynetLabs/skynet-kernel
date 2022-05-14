// tryStringify will try to turn the provided input into a string. If the input
// object is already a string, the input object will be returned. If the input
// object has a toString method, the toString method will be called. If that
// fails, we try to call JSON.stringify on the object. And if that fails, we
// set the return value to "[stringify failed]".
function tryStringify(obj: any): string {
	// Parse the error into a string.
	let str: string
	if (typeof obj === "string") {
		str = obj
	} else if (typeof obj.toString === "function") {
		str = obj.toString()
	} else {
		try {
			str = JSON.stringify(obj)
		} catch {
			str = "[stringify failed]"
		}
	}
	return str
}

export { tryStringify }
