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

// Create a button for logging out.
var button = document.createElement("input");
button.type = "button";
button.value = "Click here to log out";
var logOut = function() {
	kernel.contentWindow.postMessage({kernelMethod: "logOut"}, "https://kernel.siasky.net");
};
button.onclick = logOut;
document.body.appendChild(button);
