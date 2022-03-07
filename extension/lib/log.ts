// log, and logErr are helper functions that wrap a log messages with a string
// indicating where the log originates, and will also send a message to the
// parent requesting that the parent create a log.
//
// Anything being sent to the parent (through postMessage) will need to be sent
// as a string. Any inputs which cannot be converted to a string by
// JSON.stringify will be ignored when sent to the parent.
//
// wlog is used for code deduplication, users should call log and logErr.
//
// TODO: Instead of using localStorage, we should probably use live variables.
// At startup, localStorage will be used to set the live variables, and then a
// background sync routine will update the live variables and the localStorage
// both. That way we don't need to access localStorage with every call to log.
var wlog = function(isErr: boolean, logType: string, ...inputs: any) {
	// Fetch the log settings as a string.
	let logSettingsStr = localStorage.getItem("v1-logSettings")

	// If there is no logSettingsStr set yet, create one with the default
	// logging settings active. These don't get persisted, which makes
	// development easier (just wipe the log settings and make changes here
	// as needed, to avoid having to use the kernel api to change your log
	// settings as you develop).
	if (logSettingsStr === null) {
		logSettingsStr = '{"ERROR": true, "error": true, "debug": true, "portal": true}'
	}
	// Parse the logSettingsStr.
	let [logSettings, errJSON] = parseJSON(logSettingsStr)
	if (errJSON !== null) {
		console.log("ERROR: logSettings item in localstorage is corrupt:", errJSON, "\n", logSettingsStr)
		return
	}
	// Ignore logtypes that aren't explicitly enabled.
	if (logSettings[logType] !== true && logSettings.allLogsEnabled !== true) {
		return
	}

	// Log the message.
	if (isErr === false) {
		console.log("[kernel]", ...inputs)
	} else {
		console.error("[kernel]", ...inputs)
	}

	// Send a message to the parent requesting a log.
	if (!window.parent) {
		return
	}
	let message = ""
	for (let i = 0; i < inputs.length; i++) {
		// Separate each input by a newline.
		if (i !== 0) {
			message += "\n"
		}
		// Strings can be placed in directly.
		if (typeof inputs[i] === "string") {
			message += inputs[i]
			continue
		}
		// Everything else needs to be stringified.
		try {
			let item = JSON.stringify(inputs[i])
			message += item
		} catch {
			message += "[input could not be stringified]"
		}
	}
	window.parent.postMessage({
		method: "log",
		data: {
			isErr,
			message,
		},
	}, window.parent.origin)
}
var log = function(logType: string, ...inputs: any) {
	wlog(false, logType, ...inputs)
}
var logErr = function(logType: string, ...inputs: any) {
	wlog(true, logType, ...inputs)
}
