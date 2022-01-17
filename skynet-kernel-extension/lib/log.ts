// log provides syntactic sugar for the logging functions. The first arugment
// passed into 'log' checks whether the logSettings have explicitly enabled
// that type of logging. The remaining args will be printed as they would if
// 'console.log' was called directly.
// 
// This is a minimal logging function that can be overwritten by the kernel.
var log = function(logType: string, ...inputs: any) {
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
		console.log("ERROR: logSettings item in localstorage is corrupt:", err, "\n", logSettingsStr);
		return;
	}
	// Ignore logtypes that aren't explicitly enabled.
	if (logSettings[logType] !== true && logSettings.allLogsEnabled !== true) {
		return;
	}

	// Print the log.
	let args = Array.prototype.slice.call(arguments);
	args[0] = `[${logType}] Kernel (${performance.now()} ms): `;
	console.log.apply(console, args);
	return;
};
