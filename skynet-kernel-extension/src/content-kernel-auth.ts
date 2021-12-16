// Set the header of the page.
document.title = "skynet-kernel: login";

// DICTIONARY_UNIQUE_PREFIX defines the number of characters that are
// guaranteed to be unique for each word in the dictionary. The seed code only
// looks at these three characters when parsing a word, allowing users to make
// substitutions for words if they prefer or find it easier to memorize.
const DICTIONARY_UNIQUE_PREFIX = 3;

// Define the number of entropy words used when generating the seed.
const SEED_ENTROPY_WORDS = 13;
const SEED_CHECKSUM_WORDS = 2; // Not used, but left as documentation.
const SEED_BYTES = 16;

// import:::skynet-kernel-extension/lib/dictionary.ts

// import:::skynet-kernel-extension/lib/sha512.ts

// seedToChecksumWords will compute the two checksum words for the provided
// seed. The first two return values are the two checksum words, and the third
// return value is the error. If the error is "", it means there was no error.
var seedToChecksumWords = function(seed: Uint8Array): [string, string, string] {
	// Input validation.
	if (seed.length !== SEED_BYTES) {
		return ["", "", `seed has the wrong length: ${seed.length}`];
	}

	// Get the hash.
	let h = new Uint8Array(HASH_SIZE);
	sha512(h, seed, seed.length);

	// Turn the hash into two words.
	let word1 = h[0] << 8;
	word1 += h[1];
	word1 >>= 6;
	let word2 = h[1] << 10;
	word2 &= 0xffff;
	word2 += h[2] << 2;
	word2 >>= 6;
	return [dictionary[word1], dictionary[word2], ""];
}

// validSeedPhrase will return the seed. If there is an error parsing the seed,
// the string return value will contain the error. If there is no error. the
// string return value will be "".
var validSeedPhrase = function(seedPhrase: string): [Uint8Array, string] {
	// Create a helper function to make the below code more readable.
	let prefix = function(s: string): string {
		return s.slice(0, DICTIONARY_UNIQUE_PREFIX);
	}

	// Pull the seed into its respective parts.
	let seedWordsAndChecksum = seedPhrase.split(" ");
	let seedWords = seedWordsAndChecksum.slice(0, SEED_ENTROPY_WORDS);
	let checksumOne = seedWordsAndChecksum[SEED_ENTROPY_WORDS];
	let checksumTwo = seedWordsAndChecksum[SEED_ENTROPY_WORDS+1];

	// Convert the seedWords to a seed.
	let [seed, err1] = seedWordsToSeed(seedWords);
	if (err1 !== "") {
		return [null, "unable to parse seed phrase: " + err1];
	}

	let [checksumOneVerify, checksumTwoVerify, err2] = seedToChecksumWords(seed);
	if (err2 !== "") {
		return [null, "could not compute checksum words: " + err2];
	}
	if (prefix(checksumOne) !== prefix(checksumOneVerify)) {
		return [null, "first checksum word is invalid"];
	}
	if (prefix(checksumTwo) !== prefix(checksumTwoVerify)) {
		return [null, "second checksum word is invalid"];
	}
	return [seed, ""];
}

// seedWordsToSeed will convert a provided seed phrase to to a Uint8Array that
// represents the cryptographic seed in bytes. The string return value is an
// error, with "" indicating no error.
var seedWordsToSeed = function(seedWords: string[]): [Uint8Array, string] {
	if (seedWords.length !== SEED_ENTROPY_WORDS) {
		return [null, `Seed words should have length ${SEED_ENTROPY_WORDS} but has length ${seedWords.length}`];
	}

	// We are getting 16 bytes of entropy.
	const bytes = new Uint8Array(SEED_BYTES);
	let curByte = 0;
	let curBit = 0;
	for (let i = 0; i < SEED_ENTROPY_WORDS; i++) {
		// Determine which number corresponds to the next word.
		let word = -1;
		for (let j = 0; j < dictionary.length; j++) {
			if (seedWords[i].slice(0, DICTIONARY_UNIQUE_PREFIX) === dictionary[j].slice(0, DICTIONARY_UNIQUE_PREFIX)) {
				word = j;
				break;
			}
		}
		if (word === -1) {
			return [null, `word '${seedWords[i]}' at index ${i} not found in dictionary`];
		}
		let wordBits = 10;
		if (i === SEED_ENTROPY_WORDS - 1) {
			wordBits = 8;
		}

		// Iterate over the bits of the 10- or 8-bit word.
		for (let j = 0; j < wordBits; j++) {
			const bitSet = (word & (1 << (wordBits - j - 1))) > 0;

			if (bitSet) {
				bytes[curByte] |= 1 << (8 - curBit - 1);
			}

			curBit += 1;
			if (curBit >= 8) {
				// Current byte has 8 bits, go to the next byte.
				curByte += 1;
				curBit = 0;
			}
		}
	}

	return [bytes, ""];
}

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
	if (err1 !== "") {
		setErrorText("ERROR: Unable to parse generated seed: " + err1);
		return;
	}

	// Compute the checksum.
	let [checksumOne, checksumTwo, err2] = seedToChecksumWords(seed);
	if (err2 !== "") {
		setErrorText("ERROR: Unable to compute checksum: " + err2);
		return;
	}

	// Assemble the final seed phrase and set the text field.
	let allWords = [...seedWords, checksumOne, checksumTwo];
	let seedPhrase = allWords.join(" ");
	document.getElementById("seedText").textContent = seedPhrase;
	return ""
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
	let [seed, err] = validSeedPhrase(userSeed.value);
	if (err !== "") {
		setErrorText("Seed is not valid: " + err);
		return;
	}
	// Take the seed and store it in localStorage.
	let seedString = new TextDecoder().decode(seed);
	window.localStorage.setItem("v1-seed", seedString);

	// Send a postmessage back to the caller that auth was successful.
	try {
		window.opener.postMessage({kernelMethod: "authCompleted"}, "*");
	} catch(err) {
		setErrorText("Unable to report that authentication suceeded: " + err);
		return;
	}
	window.close();
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
