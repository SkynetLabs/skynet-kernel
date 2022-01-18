export {};

// Set the header of the page.
document.title = "skynet-kernel: login";

// import:::skynet-kernel-extension/lib/sha512.ts

// import:::skynet-kernel-extension/lib/err.ts

// import:::skynet-kernel-extension/lib/seed.ts

// setErrorText sets the errorText item in the DOM. This function is mainly
// used for readability.
var setErrorText = function(t: string) {
	document.getElementById("errorText").textContent = t;
}

// generateSeedPhrase will generate and verify a seed phrase for the user.
var generateSeedPhrase = function() {
	// Get the random numbers for the seed phrase. Typically, you need to
	// have code that avoids bias by checking the random results and
	// re-rolling the random numbers if the result is outside of the range
	// of numbers that would produce no bias. Because the search space
	// (1024) evenly divides the random number space (2^16), we can skip
	// this step and just use a modulus instead. The result will have no
	// bias, but only because the search space is a power of 2.
	let randNums = new Uint16Array(SEED_ENTROPY_WORDS);
	crypto.getRandomValues(randNums);
	// Consistency check to verify the above statement.
	if (dictionary.length !== 1024) {
		setErrorText("ERROR: the dictionary is the wrong length!");
		return;
	}

	// Generate the seed phrase from the randNums.
	let seedWords: string[] = [];
	for (let i = 0; i < SEED_ENTROPY_WORDS; i++) {
		let wordIndex = randNums[i] % dictionary.length;
		seedWords.push(dictionary[wordIndex]);
	}
	// Convert the seedWords to a seed.
	let [seed, err1] = seedWordsToSeed(seedWords);
	if (err1 !== null) {
		setErrorText("ERROR: Unable to parse generated seed: " + err1);
		return;
	}

	// Compute the checksum.
	let [checksumOne, checksumTwo, err2] = seedToChecksumWords(seed);
	if (err2 !== null) {
		setErrorText("ERROR: Unable to compute checksum: " + err2);
		return;
	}

	// Assemble the final seed phrase and set the text field.
	let allWords = [...seedWords, checksumOne, checksumTwo];
	let seedPhrase = allWords.join(" ");
	document.getElementById("seedText").textContent = seedPhrase;
	return
}

// authUser is a function which will inspect the value of the input field to
// find the seed, and then will set the user's local seed to that value.
var authUser = function() {
	// Check that the user has provided a seed.
	var userSeed = <HTMLInputElement>document.getElementById("seedInput");
	if (userSeed === null) {
		setErrorText("ERROR: user seed field not found");
		return;
	}

	// Validate the seed.
	let [seed, errVSP] = validSeedPhrase(userSeed.value);
	if (errVSP !== null) {
		setErrorText("Seed is not valid: " + errVSP);
		return;
	}
	// Take the seed and store it in localStorage.
	let seedStr = String.fromCharCode(...seed)
	window.localStorage.setItem("v1-seed", seedStr);

	// Send a postmessage back to the caller that auth was successful.
	try {
		window.opener.postMessage({kernelMethod: "authCompleted"}, "*");
		window.close();
	} catch(errC) {
		setErrorText("Unable to report that authentication suceeded: " + errC);
	}
}

// Create the auth form and perform authentication.
var seedInput = document.createElement("input");
seedInput.type = "text";
seedInput.placeholder = "Enter seed phrase here";
seedInput.id = "seedInput";
var submitButton = document.createElement("input");
submitButton.type = "button";
submitButton.value = "Submit";
submitButton.onclick = authUser;
var errorText = document.createElement("p");
errorText.id = "errorText";
errorText.textContent = "";
var generateSeedButton = document.createElement("input");
generateSeedButton.type = "button";
generateSeedButton.value = "Generate Seed";
generateSeedButton.onclick = generateSeedPhrase;
var seedText = document.createElement("p");
seedText.id = "seedText";
seedText.textContent = "";
document.body.appendChild(seedInput);
document.body.appendChild(submitButton);
document.body.appendChild(errorText);
document.body.appendChild(generateSeedButton);
document.body.appendChild(seedText);
