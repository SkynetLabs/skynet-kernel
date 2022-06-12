import { validSeedPhrase } from "libskynet"
import { generateSeedPhraseRandom } from "../src/seed.js"

// Establish a global set of functions and objects for testing flow control.
let failed = false
function fail(errStr: string, ...inputs: any) {
	if (!t.failed) {
		console.error(t.testName, "has failed")
	}
	failed = true
	t.failed = true
	console.log("\t", errStr, ...inputs)
}
function log(...inputs: any) {
	console.log("\t", ...inputs)
}
let t = {
	failed: false,
	testName: "",
	fail,
	log,
}
function runTest(test: any) {
	t.failed = false
	t.testName = test.name
	console.log(t.testName, "is running")
	test(t)
	if (!t.failed) {
		console.log(t.testName, "has passed")
	}
}

// Helper functions.
function u8sEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) {
		return false
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false
		}
	}
	return true
}
function keypairsEqual(a: any, b: any): boolean {
	if (!u8sEqual(a.publicKey, b.publicKey)) {
		return false
	}
	if (!u8sEqual(a.secretKey, b.secretKey)) {
		return false
	}
	return true
}

// Smoke testing for generating a seed phrase.
function TestGenerateSeedPhraseRandom(t: any) {
	// Generate two random seed phrases and check they are different.
	let [phrase1, err1] = generateSeedPhraseRandom()
	let [phrase2, err2] = generateSeedPhraseRandom()
	if (err1 !== null) {
		t.fail(err1, "bad seed phase 1")
		return
	}
	if (err2 !== null) {
		t.fail(err2, "bad seed phrase 2")
		return
	}
	if (phrase1 === phrase2) {
		fail("null seed phrases match", phrase1, "\n", phrase2)
	}

	// Check that the seed phrase is valid.
	let [x1, errVSP1] = validSeedPhrase(phrase1)
	if (errVSP1 !== null) {
		t.fail("vsp1 is not a valid seed phrase")
	}
}

runTest(TestGenerateSeedPhraseRandom)

console.log()
if (failed) {
	console.log("tests had errors")
	process.exit(1)
}
console.log("tests have passed")

export {}
