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

/*
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

runTest(TestGenerateSeedPhrase)
*/

console.log()
if (failed) {
	console.log("tests had errors")
	process.exit(1)
}
console.log("tests have passed")

export {}
