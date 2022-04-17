import { generateSeedPhrase, validSeedPhrase } from "../src/seed.js"
import { ed25519Keypair, ed25519KeypairFromEntropy, ed25519Sign, ed25519Verify } from "../src/ed25519.js"
import { taggedRegistryEntryKeys } from "../src/registry.js"
import { sha512 } from "../src/sha512.js"

// Establish a global set of functions and objects for testing flow control.
let failed = false
function fail(errStr: string, ...inputs: any) {
	if (!(t.failed)) {
		console.error(t.testName, "has failed")
	}
	failed = true
	t.failed = true
	console.log("\t", errStr, ...inputs)
}
let t = {
	failed: false,
	testName: "",
	fail,
}
function runTest(test: any) {
	t.failed = false
	t.testName = test.name
	test(t)
	if (!(t.failed)) {
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
function keypairsEqual(a: ed25519Keypair, b: ed25519Keypair): boolean {
	if (!(u8sEqual(a.publicKey, b.publicKey))) {
		return false
	}
	if (!(u8sEqual(a.secretKey, b.secretKey))) {
		return false
	}
	return true
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
	let [keypair, errKPFE] = ed25519KeypairFromEntropy(entropy.slice(0, 32))
	if (errKPFE !== null) {
		t.fail(errKPFE, "kpfe failed")
		return
	}
	let message = new TextEncoder().encode("fake message")
	let [signature, errS] = ed25519Sign(message, keypair.secretKey)
	if (errS !== null) {
		t.fail(errS, "sign failed")
		return
	}
	let validSig = ed25519Verify(message, signature, keypair.publicKey)
	if (!validSig) {
		t.fail("ed25519 sig not valid")
	}
}

// Smoke testing for the basic registry functions.
function TestRegistry(t: any) {
	let [x1, x2, errREK1] = taggedRegistryEntryKeys(new TextEncoder().encode("not a seed"), "", "")
	if (errREK1 === null) {
		t.fail("expected error when using bad seed")
	}

	let [seedPhrase, errGSP] = generateSeedPhrase(null)
	if (errGSP !== null) {
		t.fail("could not get seed phrase")
		return
	}
	let [seed, errVSP] = validSeedPhrase(seedPhrase)
	if (errVSP !== null) {
		t.fail("seed phrase is not valid")
		return
	}

	// Check that keypairs are deterministic.
	let [keypair2, datakey2, errREK2] = taggedRegistryEntryKeys(seed, "test-keypair", "test-datakey")
	let [keypair3, datakey3, errREK3] = taggedRegistryEntryKeys(seed, "test-keypair", "test-datakey")
	if (errREK2 !== null) {
		t.fail(errREK2, "could not get tagged keys")
		return
	}
	if (errREK3 !== null) {
		t.fail(errREK3, "could not get tagged keys")
		return
	}
	if (!(u8sEqual(datakey2, datakey3))) {
		t.fail("datakeys don't match for deterministic derivation")
		t.fail(datakey2)
		t.fail(datakey3)
	}
	if (!(keypairsEqual(keypair2, keypair3))) {
		t.fail("keypairs don't match for deterministic derivation")
	}

	// Check that changing the keypair also changes the datakey even if the
	// datakeyTag is unchanged.
	let [keypair4, datakey4, errREK4] = taggedRegistryEntryKeys(seed, "test-keypair2", "test-datakey")
	if (errREK4 !== null) {
		t.fail(errREK4, "could not get tagged keys")
		return
	}
	if (keypairsEqual(keypair3, keypair4)) {
		t.fail("keypairs should be different")
	}
	if (u8sEqual(datakey3, datakey4)) {
		t.fail("datakeys should be different")
	}
	// Check that changing the datakey doesn't change the keypair.
	let [keypair5, datakey5, errREK5] = taggedRegistryEntryKeys(seed, "test-keypair2", "test-datakey2")
	if (errREK5 !== null) {
		t.fail(errREK5, "could not get tagged keys")
		return
	}
	if (!(keypairsEqual(keypair4, keypair5))) {
		t.fail("keypairs should be equal")
	}
	if (u8sEqual(datakey4, datakey5)) {
		t.fail("datakeys should be different")
	}
}

runTest(TestGenerateSeedPhrase)
runTest(TestEd25519)
runTest(TestRegistry)

console.log()
if (failed) {
	console.log("tests had errors")
	process.exit(1)
}
console.log("tests have passed")

export {}
