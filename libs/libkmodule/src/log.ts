import { tryStringify } from "./stringify.js"

// logHelper is a helper function that runs the code for both log and logErr.
// It takes a boolean indiciating whether the log should be an error, and then
// it stringifies all of the reamining inputs and sends them to the kernel in a
// log message.
function logHelper(isErr: boolean, ...inputs: any) {
	let message = ""
	for (let i = 0; i < inputs.length; i++) {
		if (i !== 0) {
			message += "\n"
		}
		message += tryStringify(inputs[i])
	}
	postMessage({
		method: "log",
		data: {
			isErr,
			message,
		},
	})
}

// log is a helper function to send a bunch of inputs to the kernel serialized
// as a log message. Note that any inputs which cannot be stringified using
// JSON.stringify will be substituted with a placeholder string indicating that
// the input could not be stringified.
function log(...inputs: any) {
	console.log(...inputs)
	logHelper(false, ...inputs)
}

// logErr is a helper function to send a bunch of inputs to the kernel
// serialized as an error log message. Note that any inputs which cannot be
// stringified using JSON.stringify will be substituted with a placeholder
// string indicating that the input could not be stringified.
function logErr(...inputs: any) {
	console.error(...inputs)
	logHelper(true, ...inputs)
}

export { log, logErr }
