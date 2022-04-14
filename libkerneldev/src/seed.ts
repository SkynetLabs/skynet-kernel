import { randomBytes } from 'crypto'
import { DICTIONARY_UNIQUE_PREFIX, dictionary } from './dictionary'
import { sha512 } from './sha512'
import { addContextToErr } from './err'

// Define the number of entropy words used when generating the seed.
const SEED_ENTROPY_WORDS = 13
const SEED_CHECKSUM_WORDS = 2 // Not used, but left as documentation.
const SEED_BYTES = 16

// seedToChecksumWords will compute the two checksum words for the provided
// seed. The two return values are the two checksum words.
function seedToChecksumWords(seed: Uint8Array): [string, string, string | null] {
	// Input validation.
	if (seed.length !== SEED_BYTES) {
		return ["", "", `seed has the wrong length: ${seed.length}`]
	}

	// Get the hash.
	let h = sha512(seed)

	// Turn the hash into two words.
	let word1 = h[0] << 8
	word1 += h[1]
	word1 >>= 6
	let word2 = h[1] << 10
	word2 &= 0xffff
	word2 += h[2] << 2
	word2 >>= 6
	return [dictionary[word1], dictionary[word2], null]
}

// validSeedPhrase checks whether the provided seed phrase is valid, returning
// an error if not. If the seed phrase is valid, the full seed will be returned
// as a Uint8Array.
function validSeedPhrase(seedPhrase: string): [Uint8Array | null, string | null] {
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
	if (err1 !== null) {
		return [null, addContextToErr(err1, "unable to parse seed phrase")]
	}

	let [checksumOneVerify, checksumTwoVerify, err2] = seedToChecksumWords(seed);
	if (err2 !== null) {
		return [null, addContextToErr(err2, "could not compute checksum words")]
	}
	if (prefix(checksumOne) !== prefix(checksumOneVerify)) {
		return [null, "first checksum word is invalid"];
	}
	if (prefix(checksumTwo) !== prefix(checksumTwoVerify)) {
		return [null, "second checksum word is invalid"];
	}
	return [seed, null];
}

// seedWordsToSeed will convert a provided seed phrase to to a Uint8Array that
// represents the cryptographic seed in bytes.
function seedWordsToSeed(seedWords: string[]): [Uint8Array, string | null] {
	// Input checking.
	if (seedWords.length !== SEED_ENTROPY_WORDS) {
		return [new Uint8Array(0), `Seed words should have length ${SEED_ENTROPY_WORDS} but has length ${seedWords.length}`];
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
			return [new Uint8Array(0), `word '${seedWords[i]}' at index ${i} not found in dictionary`];
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

	return [bytes, null];
}

// generateSeedPhrase will generate and verify a seed phrase for the user.
function generateSeedPhrase(password: string | null): [string | null, string | null] {
	let randNums
	if (password === null) {
		// Get the random numbers for the seed phrase. Typically, you need to
		// have code that avoids bias by checking the random results and
		// re-rolling the random numbers if the result is outside of the range
		// of numbers that would produce no bias. Because the search space
		// (1024) evenly divides the random number space (2^16), we can skip
		// this step and just use a modulus instead. The result will have no
		// bias, but only because the search space is a power of 2.
		let buf = randomBytes(24)
		randNums = Uint16Array.from(buf)
	} else {
		let u8 = new TextEncoder().encode(password)
		let buf = sha512(u8)
		randNums = Uint16Array.from(buf)
	}

	// Generate the seed phrase from the randNums.
	let seedWords = []
	for (let i = 0; i < SEED_ENTROPY_WORDS; i++) {
		let wordIndex = randNums[i] % dictionary.length
		seedWords.push(dictionary[wordIndex])
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

export { seedToChecksumWords, seedWordsToSeed, generateSeedPhrase }
