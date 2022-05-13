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

/*
runTest(TestGenerateSeedPhraseDeterministic)
runTest(TestEd25519)
runTest(TestRegistry)
runTest(TestValidateSkyfilePath)
runTest(TestSkylinkV1Bitfield)
*/

console.log()
if (failed) {
	console.log("tests had errors")
	process.exit(1)
}
console.log("tests have passed")

export {}
