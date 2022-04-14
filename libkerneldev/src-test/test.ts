import { generateSeedPhrase } from '../src/seed'

let failed = false
function fail(errStr: string, ...inputs: any) {
	failed = true
	console.log(new Error(errStr), ...inputs)
}

let phraseNullInput = generateSeedPhrase(null)
let phraseNullInput2 = generateSeedPhrase(null)
if (phraseNullInput === phraseNullInput2) {
	fail("null seed phrases match", phraseNullInput, "\n", phraseNullInput2)
}

if (failed) {
	process.exit(1)
}

export {}
