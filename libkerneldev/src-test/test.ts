import { generateSeedPhrase, validSeedPhrase } from "../src/seed.js"
import { ed25519KeyPairFromEntropy, ed25519Sign, ed25519Verify } from "../src/ed25519.js"
import { sha512 } from "../src/sha512.js"

let failed = false
function fail(errStr: string, ...inputs: any) {
	failed = true
	console.log(new Error(errStr), ...inputs)
}
function fatal(errStr: string, ...inputs: any) {
	console.log(new Error(errStr), ...inputs)
	process.exit(1)
}

// Generate two random seed phrases and check they are different.
let [phraseNullInput, err1] = generateSeedPhrase(null)
let [phraseNullInput2, err2] = generateSeedPhrase(null)
if (err1 !== null) {
	fatal(err1, "bad seed phase 1")
}
if (err2 !== null) {
	fatal(err2, "bad seed phrase 2")
}
if (phraseNullInput === phraseNullInput2) {
	fail("null seed phrases match", phraseNullInput, "\n", phraseNullInput2)
}

let [phraseTestInput, err3] = generateSeedPhrase("Test")
let [phraseTestInput2, err4] = generateSeedPhrase("Test")
if (err3 !== null) {
	fatal(err3, "bad seed phrase 3")
}
if (err4 !== null) {
	fatal(err4, "bad seed phrase 4")
}
if (phraseTestInput !== phraseTestInput2) {
	fail("test seed phrases don't match", phraseTestInput, "\n", phraseTestInput2)
}

// Check that all of the seed phrases are valid.
let [x1, errVSP1] = validSeedPhrase(phraseNullInput)
let [x2, errVSP2] = validSeedPhrase(phraseNullInput2)
let [x3, errVSP3] = validSeedPhrase(phraseTestInput)
if (errVSP1 !== null) {
	fail("vsp1 is not a valid seed phrase")
}
if (errVSP2 !== null) {
	fail("vsp2 is not a valid seed phrase")
}
if (errVSP3 !== null) {
	fail("vsp3 is not a valid seed phrase")
}

// Test some of the ed25519 functions by making some entropy, then making a
// keypair, then signing some data and verifying the signature.
let entropy = sha512(new TextEncoder().encode("fake entropy"))
let [keyPair, errKPFE] = ed25519KeyPairFromEntropy(entropy.slice(0, 32))
if (errKPFE !== null) {
	fatal(errKPFE, "kpfe failed")
}
let message = new TextEncoder().encode("fake message")
let [signature, errS] = ed25519Sign(message, keyPair.secretKey)
if (errS !== null) {
	fatal(errS, "sign failed")
}
let validSig = ed25519Verify(message, signature, keyPair.publicKey)
if (!validSig) {
	fail("ed25519 sig not valid")
}

if (failed) {
	console.log("tests had errors")
	process.exit(1)
}
console.log("tests have passed")

export {}
