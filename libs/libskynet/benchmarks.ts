import { decryptFileSmall, encryptFileSmall } from "./src/filePrivate.js"
import { generateSeedPhraseDeterministic, seedPhraseToSeed } from "./src/seed.js"

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
function runBench(test: any) {
	t.failed = false
	t.testName = test.name
	console.log(t.testName, "is running")
	test(t)
}

// BenchEncryptDecryptSpeed measures the time it takes to encrypt and then
// decrypt a 20 MB file.
function BenchEncryptDecryptSpeed(t: any) {
	// Get a seed.
	let [seedPhrase, errGSPD] = generateSeedPhraseDeterministic("test-for-speed")
	if (errGSPD !== null) {
		t.fail(errGSPD)
		return
	}
	let [seed, errSPTS] = seedPhraseToSeed(seedPhrase)
	if (errSPTS !== null) {
		t.fail(errSPTS)
		return
	}

	// Establish the other inputs.
	let inode = "testFileSpeed"
	let revision = BigInt(0)
	let metadata = {
		filename: "testSpeed.txt",
	}
	let fileData = new Uint8Array(20 * 1000 * 1000)

	// Attempt to encrypt the file.
	let encStart = performance.now()
	let [encryptedData, errEF] = encryptFileSmall(seed, inode, revision, metadata, fileData)
	if (errEF !== null) {
		t.fail(errEF)
		return
	}
	let encStop = performance.now()
	t.log("time to encrypt 20 MB:", encStop - encStart)

	// Attempt to decrypt the file.
	let decStart = performance.now()
	let [recoveredMetadata, recoveredFileData, errDF] = decryptFileSmall(seed, inode, encryptedData)
	if (errDF !== null) {
		t.fail("received error when decrypting file", errDF)
		return
	}
	let decStop = performance.now()
	t.log("time to decrypt 20 MB:", decStop - decStart)
}

runBench(BenchEncryptDecryptSpeed)

if (failed) {
  console.log()
	console.log("benchmarks had errors")
	process.exit(1)
}
