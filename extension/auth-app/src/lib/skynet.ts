import { dictionary, sha512 } from 'libskynet'

// DICTIONARY_UNIQUE_PREFIX defines the number of characters that are
// guaranteed to be unique for each word in the dictionary. The seed code only
// looks at these three characters when parsing a word, allowing users to make
// substitutions for words if they prefer or find it easier to memorize.
const DICTIONARY_UNIQUE_PREFIX = 3

// Define the number of entropy words used when generating the seed.
export const SEED_ENTROPY_WORDS = 13

const SEED_BYTES = 16

export function bufToHex(buf) {
    return [...buf].map((x) => x.toString(16).padStart(2, '0')).join('')
}

// seedToChecksumWords will compute the two checksum words for the provided
// seed. The two return values are the two checksum words.
export const seedToChecksumWords = function (seed) {
    // Input validation.
    if (seed.length !== SEED_BYTES) {
        return [
            null,
            null,
            new Error(`seed has the wrong length: ${seed.length}`),
        ]
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

// seedWordsToSeed will convert a provided seed phrase to to a Uint8Array that
// represents the cryptographic seed in bytes.
export const seedWordsToSeed = function (seedWords) {
    // Input checking.
    if (seedWords.length !== SEED_ENTROPY_WORDS) {
        return [
            null,
            new Error(
                `Seed words should have length ${SEED_ENTROPY_WORDS} but has length ${seedWords.length}`,
            ),
        ]
    }
    // We are getting 16 bytes of entropy.
    const bytes = new Uint8Array(SEED_BYTES)
    let curByte = 0
    let curBit = 0
    for (let i = 0; i < SEED_ENTROPY_WORDS; i++) {
        // Determine which number corresponds to the next word.
        let word = -1
        for (let j = 0; j < dictionary.length; j++) {
            if (
                seedWords[i].slice(0, DICTIONARY_UNIQUE_PREFIX) ===
                dictionary[j].slice(0, DICTIONARY_UNIQUE_PREFIX)
            ) {
                word = j
                break
            }
        }
        if (word === -1) {
            return [
                null,
                new Error(
                    `word '${seedWords[i]}' at index ${i} not found in dictionary`,
                ),
            ]
        }
        let wordBits = 10
        if (i === SEED_ENTROPY_WORDS - 1) {
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
