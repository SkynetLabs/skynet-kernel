import { generateSeedPhrase } from '../src/seed.js'

let failed = false
function fail(errStr: string, ...inputs: any) {
	failed = true
	console.log(new Error(errStr), ...inputs)
}
function fatal(errStr: string, ...inputs: any) {
	console.log(new Error(errStr), ...inputs)
	process.exit(1)
}

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

if (failed) {
	process.exit(1)
}
console.log("tests have passed")

export {}
