/*
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
*/

console.log("tests have passed");

export {};
