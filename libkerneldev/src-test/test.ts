import { generateSeedPhrase, validSeedPhrase } from "../src/seed.js"
import { ed25519KeyPairFromEntropy, ed25519Sign, ed25519Verify } from "../src/ed25519.js"
import { sha512 } from "../src/sha512.js"

// Establish a global set of functions and objects for testing flow control.
let failed = false
function fail(errStr: string, ...inputs: any) {
	failed = true
	t.failed = true
	console.log(new Error(errStr), ...inputs)
}
let t = {
	failed: false,
	fail,
}
function runTest(test: any) {
	t.failed = false
	test(t)
	if (t.failed) {
		console.error(test.name, "has failed")
	} else {
		console.log(test.name, "has passed")
	}
}

// Smoke testing for generating a seed phrase.
function TestGenerateSeedPhrase(t: any) {
	// Generate two random seed phrases and check they are different.
	let [phraseNullInput, err1] = generateSeedPhrase(null)
	let [phraseNullInput2, err2] = generateSeedPhrase(null)
	if (err1 !== null) {
		t.fail(err1, "bad seed phase 1")
		return
	}
	if (err2 !== null) {
		t.fail(err2, "bad seed phrase 2")
		return
	}
	if (phraseNullInput === phraseNullInput2) {
		fail("null seed phrases match", phraseNullInput, "\n", phraseNullInput2)
	}

	let [phraseTestInput, err3] = generateSeedPhrase("Test")
	let [phraseTestInput2, err4] = generateSeedPhrase("Test")
	if (err3 !== null) {
		t.fail(err3, "bad seed phrase 3")
		return
	}
	if (err4 !== null) {
		t.fail(err4, "bad seed phrase 4")
		return
	}
	if (phraseTestInput !== phraseTestInput2) {
		t.fail("test seed phrases don't match", phraseTestInput, "\n", phraseTestInput2)
	}

	// Check that all of the seed phrases are valid.
	let [x1, errVSP1] = validSeedPhrase(phraseNullInput)
	let [x2, errVSP2] = validSeedPhrase(phraseNullInput2)
	let [x3, errVSP3] = validSeedPhrase(phraseTestInput)
	if (errVSP1 !== null) {
		t.fail("vsp1 is not a valid seed phrase")
	}
	if (errVSP2 !== null) {
		t.fail("vsp2 is not a valid seed phrase")
	}
	if (errVSP3 !== null) {
		t.fail("vsp3 is not a valid seed phrase")
	}
}

// Smoke testing for ed25519
function TestEd25519(t: any) {
	// Test some of the ed25519 functions by making some entropy, then making a
	// keypair, then signing some data and verifying the signature.
	let entropy = sha512(new TextEncoder().encode("fake entropy"))
	let [keyPair, errKPFE] = ed25519KeyPairFromEntropy(entropy.slice(0, 32))
	if (errKPFE !== null) {
		t.fail(errKPFE, "kpfe failed")
		return
	}
	let message = new TextEncoder().encode("fake message")
	let [signature, errS] = ed25519Sign(message, keyPair.secretKey)
	if (errS !== null) {
		t.fail(errS, "sign failed")
		return
	}
	let validSig = ed25519Verify(message, signature, keyPair.publicKey)
	if (!validSig) {
		t.fail("ed25519 sig not valid")
	}
}

runTest(TestGenerateSeedPhrase)
runTest(TestEd25519)

console.log()
if (failed) {
	console.log("tests had errors")
	process.exit(1)
}
console.log("tests have passed")

export {}
