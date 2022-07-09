import { dictionary } from "../src/dictionary.js"
import { Ed25519Keypair, ed25519KeypairFromEntropy, ed25519Sign, ed25519Verify } from "../src/ed25519.js"
import { bufToHex, bufToB64, decodeU64, encodeU64 } from "../src/encoding.js"
import { otpEncrypt } from "../src/encrypt.js"
import { addContextToErr } from "../src/err.js"
import { decryptFileSmall, encryptFileSmall, getPaddedFileSize } from "../src/fileprivate.js"
import { objAsString } from "../src/objAsString.js"
import { deriveRegistryEntryID, entryIDToSkylink, taggedRegistryEntryKeys } from "../src/registry.js"
import { deriveMyskyRootKeypair, generateSeedPhraseDeterministic, validSeedPhrase } from "../src/seed.js"
import { sha512 } from "../src/sha512.js"
import { validateSkyfilePath } from "../src/skylinkvalidate.js"
import { parseSkylinkBitfield, skylinkV1Bitfield } from "../src/skylinkbitfield.js"
import { jsonStringify } from "../src/stringifyjson.js"

// Establish a global set of functions and objects for testing flow control.
let failed = false
function fail(errStr: string, ...inputs: any) {
	console.error("\nXXXXXXXXXXXXX\n", t.testName, "has failed")
	failed = true
	t.failed = true
	console.log("\t", errStr, ...inputs)
	console.error("XXXXXXXXXXXXX\n")
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
function keypairsEqual(a: Ed25519Keypair, b: Ed25519Keypair): boolean {
	if (!u8sEqual(a.publicKey, b.publicKey)) {
		return false
	}
	if (!u8sEqual(a.secretKey, b.secretKey)) {
		return false
	}
	return true
}

// Smoke testing for generating a seed phrase.
function TestGenerateSeedPhraseDeterministic(t: any) {
	let [phraseTestInput, err3] = generateSeedPhraseDeterministic("Test")
	let [phraseTestInput2, err4] = generateSeedPhraseDeterministic("Test")
	let [phraseTestInput3, err5] = generateSeedPhraseDeterministic("Test2")
	if (err3 !== null) {
		t.fail(err3, "bad seed phrase 3")
		return
	}
	if (err4 !== null) {
		t.fail(err4, "bad seed phrase 4")
		return
	}
	if (err5 !== null) {
		t.fail(err5, "bad seed phrase 4")
		return
	}
	if (phraseTestInput !== phraseTestInput2) {
		t.fail("test seed phrases don't match", phraseTestInput, "\n", phraseTestInput2)
	}
	if (phraseTestInput === phraseTestInput3) {
		t.fail("test seed phrases shouldn't match", phraseTestInput, "\n", phraseTestInput3)
	}

	// Check that all of the seed phrases are valid.
	let [x1, errVSP1] = validSeedPhrase(phraseTestInput)
	let [x2, errVSP2] = validSeedPhrase(phraseTestInput3)
	if (errVSP1 !== null) {
		t.fail("vsp1 is not a valid seed phrase")
	}
	if (errVSP2 !== null) {
		t.fail("vsp2 is not a valid seed phrase")
	}

	// Check that the generated seeds follow the 13th word rule, which is that
	// the 13th word must always be from the first 256 entries in the
	// dictionary (this keeps the final 2 bits clear)
	for (let i = 0; i < 128; i++) {
		let [phrase, err] = generateSeedPhraseDeterministic(i.toString())
		if (err !== null) {
			t.fail(err, "unable to generate seed phrase in large check")
			return
		}

		let found = false
		let words = phrase.split(" ")
		for (let j = 0; j < 256; j++) {
			if (words[12] === dictionary[j]) {
				found = true
				break
			}
		}
		if (found === false) {
			t.fail(err, "generated a seed that did not follow the 13th word rule")
			return
		}
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

	let [seedPhrase, errGSP] = generateSeedPhraseDeterministic("TestRegistry")
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
	if (!u8sEqual(datakey2, datakey3)) {
		t.fail("datakeys don't match for deterministic derivation")
		t.fail(datakey2)
		t.fail(datakey3)
	}
	if (!keypairsEqual(keypair2, keypair3)) {
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
	if (!keypairsEqual(keypair4, keypair5)) {
		t.fail("keypairs should be equal")
	}
	if (u8sEqual(datakey4, datakey5)) {
		t.fail("datakeys should be different")
	}

	// Check that we can derive a registry entry id.
	let [entryID, errDREID] = deriveRegistryEntryID(keypair5.publicKey, datakey5)
	if (errDREID !== null) {
		t.fail(errDREID, "could not derive entry id")
		return
	}
	t.log("example entry id:     ", bufToHex(entryID))
	// Convert to resolver link.
	let rl = entryIDToSkylink(entryID)
	t.log("example resolver link:", rl)
}

// TestDecodeU64 checks that decodeU64 matches encodeU64.
//
// NOTE: encodeU64 is already well tested and has compatibility constraints
// with the Skynet protocol.
function TestDecodeU64(t: any) {
	let tests = [0n, 1n, 2n, 35n, 500n, 12345n, 642156n, 9591335n, 64285292n]
	for (let i = 0; i < tests.length; i++) {
		let [enc, errEU64] = encodeU64(tests[i])
		if (errEU64 !== null) {
			t.fail("trial could not be encoded", i)
			return
		}
		let [dec, errDU64] = decodeU64(enc)
		if (errDU64 !== null) {
			t.fail("trial could not be decoded", i)
			return
		}
		if (dec !== tests[i]) {
			t.fail("encode did not match decode:", tests[i])
		}
	}
}

// TestValidateSkyfilePath runs basic testing for the skyfile path validator.
function TestValidateSkyfilePath(t: any) {
	let tests = [
		{ trial: "test", expect: true },
		{ trial: "test/subtrial", expect: true },
		{ trial: "test/subtrial.ext", expect: true },
		{ trial: "test/trial.ext/subtrial.ext", expect: true },
		{ trial: "", expect: false },
		{ trial: ".", expect: false },
		{ trial: "./", expect: false },
		{ trial: "a//b", expect: false },
		{ trial: "a/./b", expect: false },
		{ trial: "a/../b", expect: false },
		{ trial: "../a/b", expect: false },
		{ trial: "/sometrial", expect: false },
		{ trial: "sometrial/", expect: false },
	]
	for (let i = 0; i < tests.length; i++) {
		let err = validateSkyfilePath(tests[i].trial)
		if (err !== null && tests[i].expect === true) {
			t.fail("expected trial to succeed validation: ", tests[i].trial)
		}
		if (err === null && tests[i].expect === false) {
			t.fail("expected trial to fail validation: ", tests[i].trial)
		}
	}
}

// TestSkylinkV1Bitfield checks that skylinkV1Bitfield is working correctly. It
// uses parseSkylinkBitfield as a helper function to verify things.
function TestSkylinkV1Bitfield(t: any) {
	let skylink = new Uint8Array(34)

	let tests = [
		{ trial: 0, expect: 4096 },
		{ trial: 1, expect: 4096 },
		{ trial: 100, expect: 4096 },
		{ trial: 200, expect: 4096 },
		{ trial: 4095, expect: 4096 },
		{ trial: 4096, expect: 4096 },
		{ trial: 4097, expect: 8192 },
		{ trial: 8191, expect: 8192 },
		{ trial: 8192, expect: 8192 },
		{ trial: 8193, expect: 12288 },
		{ trial: 12287, expect: 12288 },
		{ trial: 12288, expect: 12288 },
		{ trial: 12289, expect: 16384 },
		{ trial: 16384, expect: 16384 },
		{ trial: 32767, expect: 32768 },
		{ trial: 32768, expect: 32768 },
		{ trial: 32769, expect: 36864 },
		{ trial: 36863, expect: 36864 },
		{ trial: 36864, expect: 36864 },
		{ trial: 36865, expect: 40960 },
		{ trial: 45056, expect: 45056 },
		{ trial: 45057, expect: 49152 },
		{ trial: 65536, expect: 65536 },
		{ trial: 65537, expect: 73728 },
		{ trial: 106496, expect: 106496 },
		{ trial: 106497, expect: 114688 },
		{ trial: 163840, expect: 163840 },
		{ trial: 163841, expect: 180224 },
		{ trial: 491520, expect: 491520 },
		{ trial: 491521, expect: 524288 },
		{ trial: 720896, expect: 720896 },
		{ trial: 720897, expect: 786432 },
		{ trial: 1572864, expect: 1572864 },
		{ trial: 1572865, expect: 1703936 },
		{ trial: 3407872, expect: 3407872 },
		{ trial: 3407873, expect: 3670016 },
	]

	for (let i = 0; i < tests.length; i++) {
		let [bitfield, errSVB] = skylinkV1Bitfield(BigInt(tests[i].trial))
		if (errSVB !== null) {
			t.fail("unable to create bitfield")
			return
		}
		skylink.set(bitfield, 0)
		let [version, offset, fetchSize, errPSB] = parseSkylinkBitfield(skylink)
		if (errPSB !== null) {
			t.fail("parseSkylinkBitfield has failed on generated skylink", tests[i])
			return
		}
		if (version !== 1n) {
			t.fail("skylinkV1Bitfield is setting the wrong version", version, tests[i])
		}
		if (offset !== 0n) {
			t.fail("skylinkV1Bitfield is setting the wrong offset", offset, tests[i])
		}
		if (fetchSize !== BigInt(tests[i].expect)) {
			t.fail("the wrong fetchSize has been set", fetchSize, tests[i])
		}
	}
}

// TestTryStringify will attempt to stringify various objects and check that
// the expected results are returned.
function TestTryStringify(t: any) {
	// Try undefined and null.
	let undefinedVar
	if (objAsString(undefinedVar) !== "[cannot convert undefined to string]") {
		t.log(objAsString(undefinedVar))
		t.fail("bad stringify on undefined object")
		return
	}
	let nullVar = null
	if (objAsString(nullVar) !== "[cannot convert null to string]") {
		t.fail("bad stringify on null object")
		return
	}

	// Try a string.
	if (objAsString("asdf") !== "asdf") {
		t.fail("bad stringify on string input")
		return
	}
	let strVar = "asdfasdf"
	if (objAsString(strVar) !== "asdfasdf") {
		t.fail("bad stringify on string var")
		return
	}

	// Try an object.
	let objVar = { a: "b", b: 7 }
	if (objAsString(objVar) !== '{"a":"b","b":7}') {
		t.fail("bad strinigfy on string var")
		console.error(objAsString(objVar))
		return
	}

	// Try an object with a defined toString
	objVar.toString = function () {
		return "b7"
	}
	if (objAsString(objVar) !== "b7") {
		t.fail("toString is not being called")
		return
	}
}

// TestJSONStringify runs some inputs through jsonStringify to make sure they
// are being built correctly.
function TestJSONStringify(t: any) {
	// Start simple.
	let basicObj = {
		test: 5,
	}
	let [str1, err1] = jsonStringify(basicObj)
	if (err1 !== null) {
		t.fail(addContextToErr(err1, "unable to stringify basicObj"))
		return
	}
	// Count the number of quotes in str1, we are expecting 2.
	let quotes = 0
	for (let i = 0; i < str1.length; i++) {
		if (str1[i] === '"') {
			quotes += 1
		}
	}
	if (quotes !== 2) {
		t.fail("expecting 2 quotes in stringify output")
		t.log(str1)
	}

	// Try encoding a bignum.
	let bigNumObj = {
		test: 5n,
		testBig: 122333444455555666666777777788888888999999999000000000012345n,
	}
	let [str2, err2] = jsonStringify(bigNumObj)
	if (err2 !== null) {
		t.fail(addContextToErr(err2, "unable to stringify bigNumObj"))
		return
	}
	// Count the number of quotes in str2, we are expecting 4.
	quotes = 0
	for (let i = 0; i < str2.length; i++) {
		if (str2[i] === '"') {
			quotes += 1
		}
	}
	if (quotes !== 4) {
		t.fail("expecting 4 quotes in stringify output")
		t.log(str2)
	}
}

// TestMyskyEquivalence is a test that checks that the way libskynet derives
// the mysky seed for a user matches the code that derived a mysky seed for a
// user in skynet-mysky. Following the test are some unique dependencies so
// that the simulated mysky derivation is as close to the original code as
// possible.
function TestMyskyEquivalence(t: any) {
	// Get a seed.
	let [seedPhrase, errGSPD] = generateSeedPhraseDeterministic("test-for-mysky")
	if (errGSPD !== null) {
		t.fail(errGSPD)
		return
	}
	let [seed, errVSP] = validSeedPhrase(seedPhrase)
	if (errVSP !== null) {
		t.fail(errVSP)
		return
	}

	let [pkOld, skOld] = genKeyPairFromSeed(seed)
	let keypair = deriveMyskyRootKeypair(seed)
	if (pkOld.length !== keypair.publicKey.length) {
		t.fail("new pubkey len does not match legacy pubkey len")
		return
	}
	for (let i = 0; i < pkOld.length; i++) {
		if (pkOld[i] !== keypair.publicKey[i]) {
			t.fail("new pubkey does not match legacy pubkey")
			return
		}
	}
	if (skOld.length !== keypair.secretKey.length) {
		t.fail("new pubkey len does not match legacy pubkey len")
		return
	}
	for (let i = 0; i < skOld.length; i++) {
		if (skOld[i] !== keypair.secretKey[i]) {
			t.fail("new pubkey does not match legacy pubkey")
			return
		}
	}
}
import nacl from "tweetnacl"
const SALT_ROOT_DISCOVERABLE_KEY = "root discoverable key"
function genKeyPairFromSeed(seed: Uint8Array) {
	const hash = hashWithSalt(seed, SALT_ROOT_DISCOVERABLE_KEY)
	return genKeyPairFromHash(hash)
}
function hashWithSalt(message: Uint8Array, salt: string): Uint8Array {
	return s512(new Uint8Array([...s512(salt), ...s512(message)]))
}
function s512(message: Uint8Array | string): Uint8Array {
	if (typeof message === "string") {
		return nacl.hash(stringToUint8ArrayUtf8(message))
	}
	return nacl.hash(message)
}
function stringToUint8ArrayUtf8(str: string) {
	return Uint8Array.from(Buffer.from(str, "utf-8"))
}
function genKeyPairFromHash(hash: Uint8Array) {
	const hashBytes = hash.slice(0, 32)
	const { publicKey, secretKey } = nacl.sign.keyPair.fromSeed(hashBytes)
	return [publicKey, secretKey]
}

// TestOTPEncrypt checks that the otpEncrypt function is performant and appears
// to actually be encrypting things.
function TestOTPEncrypt(t: any) {
	// Perform a basic encryption and ensure that the data changes.
	let initialData1 = new TextEncoder().encode("this is a test string to encrypt")
	let initialData2 = new TextEncoder().encode("this is a test string to encrypt")
	let key1 = sha512(new TextEncoder().encode("this is a key preimage"))
	let key2 = sha512(new TextEncoder().encode("this is a different key preimage"))
	t.log("before encrypt:", bufToHex(initialData2))
	otpEncrypt(key1, initialData2)
	t.log("after encrypt: ", bufToHex(initialData2))
	if (initialData1.length !== initialData2.length) {
		t.fail("encrypted file did not keep the same size")
		return
	}
	let different = false
	for (let i = 0; i < initialData1.length; i++) {
		if (initialData1[i] !== initialData2[i]) {
			different = true
			break
		}
	}
	if (different === false) {
		t.fail("encryption did not change the data")
		return
	}

	// Check that decryption works.
	otpEncrypt(key1, initialData2)
	different = false
	for (let i = 0; i < initialData1.length; i++) {
		if (initialData1[i] !== initialData2[i]) {
			different = true
			break
		}
	}
	if (different !== false) {
		t.fail("decryption did not bring us back to the original data")
		return
	}

	// Check that encrypting with a different key will give a different data.
	otpEncrypt(key1, initialData1)
	otpEncrypt(key2, initialData2)
	t.log("different key: ", bufToHex(initialData2))
	different = false
	for (let i = 0; i < initialData1.length; i++) {
		if (initialData1[i] !== initialData2[i]) {
			different = true
			break
		}
	}
	if (different === false) {
		t.fail("using a different key did not yield different data")
		return
	}
}

// TestPaddedFileSize checks that files are being suggested the correct amount
// of padding by the pad function.
function TestPaddedFileSize(t: any) {
	let tests = [
		{ trial: 0n, expect: 4096n },
		{ trial: 1n, expect: 4096n },
		{ trial: 100n, expect: 4096n },
		{ trial: 200n, expect: 4096n },
		{ trial: 4095n, expect: 4096n },
		{ trial: 4096n, expect: 4096n },
		{ trial: 4097n, expect: 8192n },
		{ trial: 8191n, expect: 8192n },
		{ trial: 8192n, expect: 8192n },
		{ trial: 8193n, expect: 12288n },
		{ trial: 12287n, expect: 12288n },
		{ trial: 12288n, expect: 12288n },
		{ trial: 12289n, expect: 16384n },
		{ trial: 16384n, expect: 16384n },
		{ trial: 32767n, expect: 32768n },
		{ trial: 32768n, expect: 32768n },
		{ trial: 32769n, expect: 36864n },
		{ trial: 36863n, expect: 36864n },
		{ trial: 36864n, expect: 36864n },
		{ trial: 36865n, expect: 40960n },
		{ trial: 45056n, expect: 45056n },
		{ trial: 45057n, expect: 49152n },
		{ trial: 65536n, expect: 65536n },
		{ trial: 65537n, expect: 69632n },
		{ trial: 106496n, expect: 106496n },
		{ trial: 106497n, expect: 114688n },
		{ trial: 163840n, expect: 163840n },
		{ trial: 163841n, expect: 180224n },
		{ trial: 491520n, expect: 491520n },
		{ trial: 491521n, expect: 524288n },
		{ trial: 720896n, expect: 720896n },
		{ trial: 720897n, expect: 786432n },
		{ trial: 1572864n, expect: 1572864n },
		{ trial: 1572865n, expect: 1703936n },
		{ trial: 3407872n, expect: 3407872n },
		{ trial: 3407873n, expect: 3670016n },
	]

	for (let i = 0; i < tests.length; i++) {
		let suggestion = getPaddedFileSize(tests[i].trial)
		if (suggestion !== tests[i].expect) {
			t.fail("got wrong result for", tests[i], "::", getPaddedFileSize(tests[i].trial))
		}
	}
}

// TestEncryptFileSmall performs testing on the encryptFileSmall and
// decryptFileSmall functions, ensuring that padding is happening, that the key
// is being adjusted, that authentication is happening, etc.
function TestEncryptFileSmall(t: any) {
	// Get a seed.
	let [seedPhrase, errGSPD] = generateSeedPhraseDeterministic("test-for-mysky")
	if (errGSPD !== null) {
		t.fail(errGSPD)
		return
	}
	let [seed, errVSP] = validSeedPhrase(seedPhrase)
	if (errVSP !== null) {
		t.fail(errVSP)
		return
	}

	// Establish the other inputs.
	let inode = "testFile"
	let revision = BigInt(0)
	let metadata = {
		filename: "test.txt",
	}
	let fileData = new TextEncoder().encode("this is some file data")

	// Attempt to encrypt the file.
	let [encryptedData, errEF] = encryptFileSmall(seed, inode, revision, metadata, fileData)
	if (errEF !== null) {
		t.fail(errEF)
		return
	}
	if (encryptedData.length !== 4096) {
		t.fail("encrypted data is supposed to be 4096 bytes")
		return
	}
	// Get the hash of the original encryptedData so we can verify it does not
	// change when the decryption happens.
	let encryptedDataHash = sha512(encryptedData)

	// Attempt to decrypt the file.
	let [recoveredMetadata, recoveredFileData, errDF] = decryptFileSmall(seed, inode, encryptedData)
	if (errDF !== null) {
		t.fail("received error when decrypting file", errDF)
		return
	}

	// Check that decryption did not change the encrypted data.
	let encryptedDataHash2 = sha512(encryptedData)
	for (let i = 0; i < encryptedDataHash.length; i++) {
		if (encryptedDataHash[i] !== encryptedDataHash2[i]) {
			t.fail("encrypted data appears to have been modified during decryption")
			return
		}
	}

	// Check that the file data matches the original file data.
	if (recoveredFileData.length !== fileData.length) {
		t.fail("decryption failed, fileData does not match")
		return
	}
	for (let i = 0; i < recoveredFileData.length; i++) {
		if (recoveredFileData[i] !== fileData[i]) {
			t.fail("recovered data does not equal original file data")
			return
		}
	}

	// Check that the metadata is intact.
	if (recoveredMetadata.filename !== metadata.filename) {
		t.fail("metadata seems to have changed")
		return
	}

	// Check that if the file gets encrypted again using a new revision number,
	// the resulting data is different.
	let [encData2, err] = encryptFileSmall(seed, inode, revision + 1n, metadata, fileData)
	if (err !== null) {
		t.fail("could not encrypt file for revision test")
		return
	}
	if (encData2.length !== encryptedData.length) {
		t.fail("encrypted data length should match when revision number changes")
		return
	}
	let matches = 0
	for (let i = 0; i < encData2.length; i++) {
		if (encData2[i] === encryptedData[i]) {
			matches += 1
		}
	}
	if (matches > encData2.length / 30) {
		t.fail("new encrypted data is very similar to old encrypted data", matches, encData2.length)
		return
	}

	// Check that changing the seed changes the encrypted output.
	let [spd, errGSPD2] = generateSeedPhraseDeterministic("a different seed")
	if (errGSPD2 !== null) {
		t.fail(errGSPD2)
		return
	}
	let [seed2, errVSP2] = validSeedPhrase(spd)
	if (errVSP2 !== null) {
		t.fail(errVSP2)
		return
	}

	let [encData3, errEFS] = encryptFileSmall(seed2, inode, revision, metadata, fileData)
	if (errEFS !== null) {
		t.fail("could not encrypt file for revision test")
		return
	}
	if (encData3.length !== encryptedData.length) {
		t.fail("encrypted data length should match when revision number changes")
		return
	}
	matches = 0
	for (let i = 0; i < encData3.length; i++) {
		if (encData3[i] === encryptedData[i]) {
			matches += 1
		}
	}
	if (matches > encData3.length / 30) {
		t.fail("new encrypted data is very similar to old encrypted data", matches, encData3.length)
		return
	}

	// Check that changing the file changes the data
	let fileDataAlt = new TextEncoder().encode("this is somm file data")
	// Attempt to encrypt the file.
	let [encFD, errFD] = encryptFileSmall(seed, inode, revision, metadata, fileDataAlt)
	if (errFD !== null) {
		t.fail(errFD)
		return
	}
	if (encFD.length !== encryptedData.length) {
		t.fail("encrypted data length should match when revision number changes")
		return
	}
	matches = 0
	for (let i = 0; i < encFD.length; i++) {
		if (encFD[i] === encryptedData[i]) {
			matches += 1
		}
	}
	if (matches > encryptedData.length / 30) {
		t.fail("new encrypted data is very similar to old encrypted data", matches, encFD.length)
		return
	}

	// Check that a modified file fails decryption. Try several different modifications.
	encFD[250] += 1
	let [, , errFD1] = decryptFileSmall(seed, inode, encFD)
	if (errFD1 === null) {
		t.fail("expecting an error when decrypting modified file")
		return
	}
	encFD[250] -= 1
	encFD[0] += 1
	let [, , errFD2] = decryptFileSmall(seed, inode, encFD)
	if (errFD2 === null) {
		t.fail("expecting an error when decrypting modified file")
		return
	}
	encFD[0] -= 1
	encFD[4095] += 1
	let [, , errFD3] = decryptFileSmall(seed, inode, encFD)
	if (errFD3 === null) {
		t.fail("expecting an error when decrypting modified file")
		return
	}
	encFD[4095] -= 1
	// This time try withtout the modification to make sure decryption still
	// works.
	let [decFDMeta, decFDData, errFD4] = decryptFileSmall(seed, inode, encFD)
	if (errFD4 !== null) {
		t.fail("file was reset to original state, should decrypt now")
		return
	}
	if (decFDMeta.filename !== "test.txt") {
		t.fail("metadata did not decrypt correctly")
		return
	}
	if (fileDataAlt.length !== decFDData.length) {
		t.fail("decrypted file has wrong length")
		return
	}
	for (let i = 0; i < fileDataAlt.length; i++) {
		if (fileDataAlt[i] !== decFDData[i]) {
			t.fail("encrypted data appears to have been modified during decryption")
			return
		}
	}

	// Check that a bad seed fails decryption
	let [x, y, errFD5] = decryptFileSmall(seed2, inode, encFD)
	if (errFD5 === null) {
		t.fail("expecting an error when decrypting with the wrong seed")
		return
	}
}

// TestOTPEncryptSpeed measures the performance of encrypting a 20 MB file using otpEncrypt.
function TestOTPEncryptSpeed(t: any) {
	let key = new TextEncoder().encode("any key")
	let data = new Uint8Array(20 * 1024 * 1024)
	let start = performance.now()
	otpEncrypt(key, data)
	let total = performance.now() - start
	t.log("milliseconds to encrypt 20 MiB:", total)
}

// TestEncryptDecryptSpeed measures the time it takes to encrypt and then
// decrypt a 20 MB file.
function TestEncryptDecryptSpeed(t: any) {
	// Get a seed.
	let [seedPhrase, errGSPD] = generateSeedPhraseDeterministic("test-for-speed")
	if (errGSPD !== null) {
		t.fail(errGSPD)
		return
	}
	let [seed, errVSP] = validSeedPhrase(seedPhrase)
	if (errVSP !== null) {
		t.fail(errVSP)
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

runTest(TestGenerateSeedPhraseDeterministic)
runTest(TestEd25519)
runTest(TestRegistry)
runTest(TestDecodeU64)
runTest(TestValidateSkyfilePath)
runTest(TestSkylinkV1Bitfield)
runTest(TestTryStringify)
runTest(TestJSONStringify)
runTest(TestMyskyEquivalence)
runTest(TestOTPEncrypt)
runTest(TestPaddedFileSize)
runTest(TestEncryptFileSmall)
runTest(TestOTPEncryptSpeed)
runTest(TestEncryptDecryptSpeed)

console.log()
if (failed) {
	console.log("tests had errors")
	process.exit(1)
}
console.log("tests have passed")

export {}
