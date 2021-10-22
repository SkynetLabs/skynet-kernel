// Set the header of the page.
document.title = "skynet-kernel: login";

// authUser is a function which will inspect the value of the input field to
// find the seed, and then will set the user's local seed to that value.
var authUser = function() {
	var userSeed = document.getElementById("seedInput");

	// TODO: Verify that this is a valid seed.

	// Take the seed and store it in localstorage.
	window.localStorage.setItem("seed", userSeed.value);

	// Send a postmessage back to the caller that auth was successful.
	window.opener.postMessage({kernelMethod: "authCompleted"}, "*");
	window.close();
}

// Create the auth form and perform authentication.
//
// TODO: We also need to handle creating a new seed for the user.
//
// TODO: Obviously we can clean this up and make it prettier. I'm not sure how
// to load a file here without going to the network, but surely there's some
// way to get this page rendering without building the whole DOM by hand in js.
var seedInput = document.createElement("input");
seedInput.type = "text";
seedInput.placeholder = "Enter seed phrase here";
seedInput.id = "seedInput";
var submitButton = document.createElement("input");
submitButton.type = "button";
submitButton.value = "Submit";
submitButton.onclick = authUser;
document.body.appendChild(seedInput);
document.body.appendChild(submitButton);
