// Overwrite the handleMessage object of the homescreen
// script so that we can add more communications to
// homescreen.
handleMessage = function(event) {
	// TODO: Debugging only.
	if (event.data.kernelMethod === "receiveTest") {
		console.log("Homescreen: handleMessage override successful");
	}

	// Reload the homepage if the user has logged out, so that they can log
	// in again.
	if (event.data.kernelMethod === "logOutSuccess") {
		window.location.reload(true);
	}
}

// Send a message to perform a test ping and confirm that the script was loaded
// correctly.
kernel.contentWindow.postMessage({kernelMethod: "requestTest"}, "https://kernel.siasky.net");

// Add a log out action to the log out button.
var logOut = function() {
	kernel.contentWindow.postMessage({kernelMethod: "logOut"}, "https://kernel.siasky.net");
};
var button = document.getElementById("logOutButton");
button.onclick=logOut;
