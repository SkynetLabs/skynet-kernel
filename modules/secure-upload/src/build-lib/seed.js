let crypto = require("crypto")
let dict = require("./dictionary")
let sha512 = require("./sha512")

// seedToChecksumWords will compute the two checksum words for the provided
// seed. The two return values are the two checksum words.
var seedToChecksumWords = function (seed) {
	// Input validation.
	if (seed.length !== dict.SEED_BYTES) {
		return [null, null, new Error(`seed has the wrong length: ${seed.length}`)]
	}
	// Get the hash.
	let h = sha512.sha512(seed)
	// Turn the hash into two words.
	let word1 = h[0] << 8
	word1 += h[1]
	word1 >>= 6
	let word2 = h[1] << 10
	word2 &= 0xffff
	word2 += h[2] << 2
	word2 >>= 6
	return [dict.dictionary[word1], dict.dictionary[word2], null]
}

// seedWordsToSeed will convert a provided seed phrase to to a Uint8Array that
// represents the cryptographic seed in bytes.
var seedWordsToSeed = function (seedWords) {
	// Input checking.
	if (seedWords.length !== dict.SEED_ENTROPY_WORDS) {
		return [
			null,
			new Error(`Seed words should have length ${dict.SEED_ENTROPY_WORDS} but has length ${seedWords.length}`),
		]
	}
	// We are getting 16 bytes of entropy.
	const bytes = new Uint8Array(dict.SEED_BYTES)
	let curByte = 0
	let curBit = 0
	for (let i = 0; i < dict.SEED_ENTROPY_WORDS; i++) {
		// Determine which number corresponds to the next word.
		let word = -1
		for (let j = 0; j < dict.dictionary.length; j++) {
			if (
				seedWords[i].slice(0, dict.DICTIONARY_UNIQUE_PREFIX) ===
				dict.dictionary[j].slice(0, dict.DICTIONARY_UNIQUE_PREFIX)
			) {
				word = j
				break
			}
		}
		if (word === -1) {
			return [null, new Error(`word '${seedWords[i]}' at index ${i} not found in dictionary`)]
		}
		let wordBits = 10
		if (i === dict.SEED_ENTROPY_WORDS - 1) {
			wordBits = 8
		}
		// Iterate over the bits of the 10- or 8-bit word.
		for (let j = 0; j < wordBits; j++) {
			const bitSet = (word & (1 << (wordBits - j - 1))) > 0
			if (bitSet) {
				bytes[curByte] |= 1 << (8 - curBit - 1)
			}
			curBit += 1
			if (curBit >= 8) {
				// Current byte has 8 bits, go to the next byte.
				curByte += 1
				curBit = 0
			}
		}
	}
	return [bytes, null]
}

// generateSeedPhrase will generate and verify a seed phrase for the user.
function generateSeedPhrase(password) {
	let randNums
	if (password === null) {
		// Get the random numbers for the seed phrase. Typically, you need to
		// have code that avoids bias by checking the random results and
		// re-rolling the random numbers if the result is outside of the range
		// of numbers that would produce no bias. Because the search space
		// (1024) evenly divides the random number space (2^16), we can skip
		// this step and just use a modulus instead. The result will have no
		// bias, but only because the search space is a power of 2.
		let buf = crypto.randomBytes(24)
		randNums = Uint16Array.from(buf)
	} else {
		let buf = sha512.sha512(password)
		randNums = Uint16Array.from(buf)
	}

	// Generate the seed phrase from the randNums.
	let seedWords = []
	for (let i = 0; i < dict.SEED_ENTROPY_WORDS; i++) {
		let wordIndex = randNums[i] % dict.dictionary.length
		seedWords.push(dict.dictionary[wordIndex])
	}

	// Convert the seedWords to a seed.
	let [seed, err1] = seedWordsToSeed(seedWords)
	if (err1 !== null) {
		return [null, err1]
	}

	// Compute the checksum.
	let [checksumOne, checksumTwo, err2] = seedToChecksumWords(seed)
	if (err2 !== null) {
		return [null, err2]
	}

	// Assemble the final seed phrase and set the text field.
	let allWords = [...seedWords, checksumOne, checksumTwo]
	let seedPhrase = allWords.join(" ")
	return [seedPhrase, null]
}

module.exports = { seedToChecksumWords, seedWordsToSeed, generateSeedPhrase }
