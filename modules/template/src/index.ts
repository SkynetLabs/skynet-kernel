import { addHandler, handleMessage } from "libkmodule"
import type { activeQuery } from "libkmodule"

addHandler("methodName", handleMethodName)
onmessage = handleMessage

// handleSecureDownload will handle a call to secureDownload.
function handleMethodName(aq: activeQuery) {
	// Check the inputs
	// Here, expecting data to have a "message" field of string
	if (typeof aq.callerInput.message !== "string") {
		aq.reject("Field `message` expected to be a string")
		return
	}

	// Respond to query with data
	aq.respond({ key: "String Value" })
}
