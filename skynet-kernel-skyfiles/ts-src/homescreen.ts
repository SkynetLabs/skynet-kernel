// Declare the kernel const, since it will be available to us when this script
// gets eval'd by the bootstrap code.
declare var kernel;
declare var handleMessage;
declare var log;

// Overwrite the handleMessage object of the homescreen script so that we can
// add more communications to homescreen.
//
// TODO: This doesn't need to be of type 'any' but I don't know what the real
// type is supposed to be.
handleMessage = function(event: any) {
	log("message", "message received");

	// TODO: Debugging logs only.
	if (event.data.kernelMethod === "receiveTest") {
		log("progress", "handleMessage override successful");
	}

	// Reload the homepage if the user has logged out, so that they can log
	// in again.
	if (event.data.kernelMethod === "logOutSuccess") {
		log("progress", "reloading window");
		window.location.reload();
	}
}

// Send a message to perform a test ping and confirm that the script was loaded
// correctly.
kernel.contentWindow.postMessage({kernelMethod: "requestTest"}, "https://kernel.siasky.net");

// Create a doNothing function.
// 
// TODO: This is used in the onclick for disabled buttons, there might be a
// better way.
var doNothing = function() {}

// setLoggingDefaults is a DRY function that specifies what happens if the
// logging function is not available.
var setLoggingDefaults = function() {
}

// Create a function to update the logging buttons. It'll look at local storage
// and update all of the buttons according to the latest settings. Call this
// function after modifying the settings.
//
// TODO: This whole logging ui needs to be rewritten. Instead of having buttons
// it should just let you add or remove tags.
var updateLoggingButtons = function() {
	// Grab the logSettings object.
	let logSettingsStr = localStorage.getItem("v1-logSettings");

	// Check for a valid logSettingsStr, if there is no valid str the
	// default below will be to set all the buttons to their default
	// config.
	if (logSettingsStr !== null) {
		try {
			var logSettings = JSON.parse(logSettingsStr);
			if (logSettings.disableAllLogs === true) {
				// Update the suppress all logs button.
				document.getElementById("disableAllLogsButton").textContent = "Logging disabled, click to enable";
				document.getElementById("disableAllLogsButton").onclick = enableLogs;

				// Update all the other buttons.
				document.getElementById("messageLogsButton").textContent = "All logging disabled";
				document.getElementById("messageLogsButton").onclick = doNothing;
				document.getElementById("performanceLogsButton").textContent = "All logging disabled";
				document.getElementById("performanceLogsButton").onclick = doNothing;
				document.getElementById("progressLogsButton").textContent = "All logging disabled";
				document.getElementById("progressLogsButton").onclick = doNothing;
				return;
			} else {
				document.getElementById("disableAllLogsButton").textContent = "Click to disable all logs";
				document.getElementById("disableAllLogsButton").onclick = disableAllLogs;
			}
			if (logSettings.message !== false) {
				document.getElementById("messageLogsButton").textContent = "Enabled, click to disable";
				document.getElementById("messageLogsButton").onclick = disableMessageLogs;
			} else {
				document.getElementById("messageLogsButton").textContent = "Disabled, click to enable";
				document.getElementById("messageLogsButton").onclick = enableMessageLogs;
			}
			if (logSettings.performance !== false) {
				document.getElementById("performanceLogsButton").textContent = "Enabled, click to disable";
				document.getElementById("performanceLogsButton").onclick = disablePerformanceLogs;
			} else {
				document.getElementById("performanceLogsButton").textContent = "Disabled, click to enable";
				document.getElementById("performanceLogsButton").onclick = enablePerformanceLogs;
			}
			if (logSettings.progress !== false) {
				document.getElementById("progressLogsButton").textContent = "Enabled, click to disable";
				document.getElementById("progressLogsButton").onclick = disableProgressLogs;
			} else {
				document.getElementById("progressLogsButton").textContent = "Disabled, click to enable";
				document.getElementById("progressLogsButton").onclick = enableProgressLogs;
			}
			return;
		} catch {
			console.log("ERROR: logSettings storage object is corrupted");
		}
	}

	// If we reached here
	document.getElementById("disableAllLogsButton").textContent = "Click to disable all logs";
	document.getElementById("disableAllLogsButton").onclick = disableAllLogs;

	document.getElementById("messageLogsButton").textContent = "Enabled, click to disable";
	document.getElementById("messageLogsButton").onclick = disableMessageLogs;
	document.getElementById("performanceLogsButton").textContent = "Enabled, click to disable";
	document.getElementById("performanceLogsButton").onclick = disablePerformanceLogs;
	document.getElementById("progressLogsButton").textContent = "Enabled, click to disable";
	document.getElementById("progressLogsButton").onclick = disableProgressLogs;

}

// Create the pair of functions that manage the button to disable logging.
var disableAllLogs = function() {
	// Try to parse the logSettings, if it works update the value to
	// disable all logs.
	let logSettingsStr = localStorage.getItem("v1-logSettings");
	if (logSettingsStr !== null) {
		try {
			let logSettings = JSON.parse(localStorage.getItem("v1-logSettings"));
			logSettings.disableAllLogs = true;
			localStorage.setItem("v1-logSettings", JSON.stringify(logSettings));
			updateLoggingButtons();
			return;
		} catch {
			console.log("ERROR: logSettings storage object is corrupted");
		}
	}

	// There was an error parsing logSettingsStr, reset it.
	let logSettings = {
		disableAllLogs: true
	};
	localStorage.setItem("v1-logSettings", JSON.stringify(logSettings));
	updateLoggingButtons();
}
var enableLogs = function() {
	// Try to parse the logSettings, if it works update the value to enable
	// all logs.
	let logSettingsStr = localStorage.getItem("v1-logSettings");
	if (logSettingsStr !== null) {
		try {
			let logSettings = JSON.parse(localStorage.getItem("v1-logSettings"));
			logSettings.disableAllLogs = false;
			localStorage.setItem("v1-logSettings", JSON.stringify(logSettings));
			updateLoggingButtons();
			return;
		} catch {
			console.log("ERROR: logSettings storage object is corrupted");
		}
	}

	// There was an error parsing logSettingsStr, reset it.
	let logSettings = {
		disableAllLogs: false
	};
	localStorage.setItem("v1-logSettings", JSON.stringify(logSettings));
	updateLoggingButtons();
}

// enableXLogs is a generic function for enabling logs of type X.
var enableXLogs = function(type) {
	// Try to parse the logSettings, if it works update the value to enable
	// the log.
	let logSettingsStr = localStorage.getItem("v1-logSettings");
	if (logSettingsStr !== null) {
		try {
			let logSettings = JSON.parse(localStorage.getItem("v1-logSettings"));
			logSettings[type] = true;
			localStorage.setItem("v1-logSettings", JSON.stringify(logSettings));
			updateLoggingButtons();
			return;
		} catch {
			console.log("ERROR: logSettings storage object is corrupted");
		}
	}

	// There was an error parsing logSettingsStr, reset it.
	let logSettings = {
		[type]: true
	};
	localStorage.setItem("v1-logSettings", JSON.stringify(logSettings));
	updateLoggingButtons();
}
// disableXLogs is a generic function for enabling logs of type X.
var disableXLogs = function(type) {
	// Try to parse the logSettings, if it works update the value to enable
	// the log.
	let logSettingsStr = localStorage.getItem("v1-logSettings");
	if (logSettingsStr !== null) {
		try {
			let logSettings = JSON.parse(localStorage.getItem("v1-logSettings"));
			logSettings[type] = false;
			localStorage.setItem("v1-logSettings", JSON.stringify(logSettings));
			updateLoggingButtons();
			return;
		} catch {
			console.log("ERROR: logSettings storage object is corrupted");
		}
	}

	// There was an error parsing logSettingsStr, reset it.
	let logSettings = {
		[type]: false
	};
	localStorage.setItem("v1-logSettings", JSON.stringify(logSettings));
	updateLoggingButtons();
}

// Create the functions the various buttons.
var enableMessageLogs = function() {
	enableXLogs("message");
}
var disableMessageLogs = function() {
	disableXLogs("message");
}
var enablePerformanceLogs = function() {
	enableXLogs("performance");
}
var disablePerformanceLogs = function() {
	disableXLogs("performance");
}
var enableProgressLogs = function() {
	enableXLogs("progress");
}
var disableProgressLogs = function() {
	disableXLogs("progress");
}

// Add a log out action to the log out button.
var logOut = function() {
	kernel.contentWindow.postMessage({kernelMethod: "logOut"}, "https://kernel.siasky.net");
};
var button = document.getElementById("logOutButton");
button.onclick=logOut;

// Set the logging buttons.
updateLoggingButtons();
