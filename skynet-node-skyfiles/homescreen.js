// Overwrite the handleMessage object of the homescreen
// script so that we can add more communications to
// homescreen.
handleMessage = function(event) {
	if (event.data.method === "skynetNodeReceiveTest") {
		console.log("Homescreen: handleMessage override successful");
	}
}

// Send a message to perform a test ping and confirm that the script was loaded
// correctly.
node.contentWindow.postMessage({method: "skynetNodeRequestTest"}, "https://node.siasky.net");
