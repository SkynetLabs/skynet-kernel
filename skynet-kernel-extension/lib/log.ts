// log provides syntactic sugar for the logging functions. The first arugment
// passed into 'log' checks whether the logSettings have explicitly enabled
// that type of logging. The remaining args will be printed as they would if
// 'console.log' was called directly.
// 
// This is a minimal logging function that can be overwritten by the kernel.
//
// TODO: Need to create an API for changing the logging settings in the kernel.
// API should be built from the kernel proper though no reason to have it in
// the browser extension. We only put it in the browser extension in the first
// place because so many of the lifecycle messages are important. One of the
// things we can do here is have the 'log' functino pay attention to all the
// different log types that come through, and present the user with the option
// to enable any particular set of them. May as well also have an option to
// enable all logs, though that could potentially be very verbose.
var log = function(logType: string, ...inputs: any) {
	// Fetch the log settings as a string.
	let logSettingsStr = localStorage.getItem("v1-logSettings");

	// If there is no logSettingsStr set yet, create one with the default
	// logging settings active. These don't get persisted, which makes
	// debugging easier (just wipe the log settings and make changes here
	// as needed, to avoid having to use the kernel api to change your log
	// settings as you develop).
	if (logSettingsStr === null) {
		logSettingsStr = '{"ERROR": true, "error": true, "lifecycle": true, "portal": true}';
	}

	let [logSettings, errJSON] = parseJSON(logSettingsStr);
	if (errJSON !== null) {
		console.log("ERROR: logSettings item in localstorage is corrupt:", err);
		console.log(logSettingsStr);
		return;
	}
	if (logSettings[logType] !== true && logSettings.allLogsEnabled !== true) {
		return;
	}

	// Print the log.
	let args = Array.prototype.slice.call(arguments);
	args[0] = `[${logType}] Kernel (${performance.now()} ms): `;
	console.log.apply(console, args);
	return;
};
