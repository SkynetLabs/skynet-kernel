// sourceLog provides syntactic sugar for the logging functions. This function
// is intended to be wrapped by whatever page imports it so that the logSource
// is different for each page. The first argument is the name of the page, the
// second argument is the message type, and the remaining arguments are the
// same as any inputs you would pass to console.log.
var sourceLog = function(logSource: string, logType: string, ...inputs: any) {
	// Fetch the log settings as a string.
	let logSettingsStr = localStorage.getItem("v1-logSettings");

	// If there is no logSettingsStr set yet, create one with the default
	// logging settings active. These don't get persisted, which makes
	// development easier (just wipe the log settings and make changes here
	// as needed, to avoid having to use the kernel api to change your log
	// settings as you develop).
	if (logSettingsStr === null) {
		logSettingsStr = '{"ERROR": true, "error": true, "lifecycle": true, "portal": true}';
	}
	// Parse the logSettingsStr.
	let [logSettings, errJSON] = parseJSON(logSettingsStr);
	if (errJSON !== null) {
		console.log("ERROR: logSettings item in localstorage is corrupt:", errJSON, "\n", logSettingsStr);
		return;
	}
	// Ignore logtypes that aren't explicitly enabled.
	if (logSettings[logType] !== true && logSettings.allLogsEnabled !== true) {
		return;
	}

	// Print the log.
	let args = Array.prototype.slice.call(arguments);
	args[0] = `[${logType}] ${logSource} (${performance.now()} ms): `;
	console.log.apply(console, args);
	return;
};
