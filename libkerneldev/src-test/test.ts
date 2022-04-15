import { generateSeedPhrase, validSeedPhrase } from "../src/seed.js"

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
	fatal(err1)
}
if (err2 !== null) {
	fatal(err2)
}
if (phraseNullInput === phraseNullInput2) {
	fail("null seed phrases match", phraseNullInput, "\n", phraseNullInput2)
}

let [phraseTestInput, err3] = generateSeedPhrase("Test")
let [phraseTestInput2, err4] = generateSeedPhrase("Test")
if (err3 !== null) {
	fatal(err3)
}
if (err4 !== null) {
	fatal(err4)
}
if (phraseTestInput !== phraseTestInput2) {
	fail("test seed phrases don't match", phraseTestInput, "\n", phraseTestInput2)
}

// Check that all of the seed phrases are valid.
let [x1, errVSP1] = validSeedPhrase(phraseNull1Input)
let [x2, errVSP2] = validSeedPhrase(phraseNull1Input2)
let [x3, errVSP3] = validSeedPhrase(phrseTestInput)
if (errVSP1 !== null) {
	fail("vsp1 is not a valid seed phrase")
}
if (errVSP2 !== null) {
	fail("vsp2 is not a valid seed phrase")
}
if (errVSP3 !== null) {
	fail("vsp3 is not a valid seed phrase")
}

if (failed) {
	process.exit(1)
}
console.log("tests have passed")

export {}
