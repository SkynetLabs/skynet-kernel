import { decryptFileSmall, encryptFileSmall, getPaddedFileSize } from "./filePrivate.js"
import { generateSeedPhraseDeterministic, seedPhraseToSeed } from "./seed.js"
import { sha512 } from "./sha512.js"

// unit tests for getPaddedFileSize.
test.each([
  { inputFileSize: 0n, outputFileSize: 4096n },
  { inputFileSize: 1n, outputFileSize: 4096n },
  { inputFileSize: 100n, outputFileSize: 4096n },
  { inputFileSize: 200n, outputFileSize: 4096n },
  { inputFileSize: 4095n, outputFileSize: 4096n },
  { inputFileSize: 4096n, outputFileSize: 4096n },
  { inputFileSize: 4097n, outputFileSize: 8192n },
  { inputFileSize: 8191n, outputFileSize: 8192n },
  { inputFileSize: 8192n, outputFileSize: 8192n },
  { inputFileSize: 8193n, outputFileSize: 12288n },
  { inputFileSize: 12287n, outputFileSize: 12288n },
  { inputFileSize: 12288n, outputFileSize: 12288n },
  { inputFileSize: 12289n, outputFileSize: 16384n },
  { inputFileSize: 16384n, outputFileSize: 16384n },
  { inputFileSize: 32767n, outputFileSize: 32768n },
  { inputFileSize: 32768n, outputFileSize: 32768n },
  { inputFileSize: 32769n, outputFileSize: 36864n },
  { inputFileSize: 36863n, outputFileSize: 36864n },
  { inputFileSize: 36864n, outputFileSize: 36864n },
  { inputFileSize: 36865n, outputFileSize: 40960n },
  { inputFileSize: 45056n, outputFileSize: 45056n },
  { inputFileSize: 45057n, outputFileSize: 49152n },
  { inputFileSize: 65536n, outputFileSize: 65536n },
  { inputFileSize: 65537n, outputFileSize: 69632n },
  { inputFileSize: 106496n, outputFileSize: 106496n },
  { inputFileSize: 106497n, outputFileSize: 114688n },
  { inputFileSize: 163840n, outputFileSize: 163840n },
  { inputFileSize: 163841n, outputFileSize: 180224n },
  { inputFileSize: 491520n, outputFileSize: 491520n },
  { inputFileSize: 491521n, outputFileSize: 524288n },
  { inputFileSize: 720896n, outputFileSize: 720896n },
  { inputFileSize: 720897n, outputFileSize: 786432n },
  { inputFileSize: 1572864n, outputFileSize: 1572864n },
  { inputFileSize: 1572865n, outputFileSize: 1703936n },
  { inputFileSize: 3407872n, outputFileSize: 3407872n },
  { inputFileSize: 3407873n, outputFileSize: 3670016n },
])("testGetPaddedFileSize with input '$inputFileSize'", ({ inputFileSize, outputFileSize }) => {
  expect(getPaddedFileSize(inputFileSize)).toBe(outputFileSize);
});

// smoke testing for encryptFileSmall.
test("testEncryptFileSmall", () => {
	// Get a seed.
	let [seedPhrase, errGSPD] = generateSeedPhraseDeterministic("test-for-mysky")
  expect(errGSPD).toBe(null)
	let [seed, errSPTS] = seedPhraseToSeed(seedPhrase)
  expect(errSPTS).toBe(null)

  // Establish the other inputs to encryptFileSmall.
	let inode = "testFile"
	let revision = BigInt(0)
	let metadata = {
		filename: "test.txt",
	}
	let fileData = new TextEncoder().encode("this is some file data")

	// Attempt to encrypt the file.
	let [encryptedData, errEF] = encryptFileSmall(seed, inode, revision, metadata, fileData)
  expect(errEF).toBe(null)
  expect(encryptedData.length).toBe(4096)

  // Get the hash of the original encryptedData so we can verify that the
  // encrypted data does not change when the decryption happens.
	let encryptedDataHash = sha512(encryptedData)

	// Attempt to decrypt the file.
	let [recoveredMetadata, recoveredFileData, errDF] = decryptFileSmall(seed, inode, encryptedData)
  expect(errDF).toBe(null)

	// Check that decryption did not change the encrypted data.
	let encryptedDataHash2 = sha512(encryptedData)
  expect(encryptedDataHash).toEqual(encryptedDataHash2)

	// Check that the file data matches the original file data.
  expect(recoveredFileData).toEqual(fileData)

	// Check that the metadata is intact.
  expect(recoveredMetadata.filename).toBe(metadata.filename)

	// Check that if the file gets encrypted again using a new revision number,
	// the resulting data is different.
	let [encData2, errEFS] = encryptFileSmall(seed, inode, revision + 1n, metadata, fileData)
  expect(errEFS).toBe(null)
  expect(encData2).not.toEqual(encryptedData)
  expect(encData2.length).toBe(encryptedData.length)
  // Check that there is substantial difference between the two ciphertexts.
	let matches = 0
	for (let i = 0; i < encData2.length; i++) {
		if (encData2[i] === encryptedData[i]) {
			matches += 1
		}
	}
  expect(matches).toBeLessThan(encData2.length / 30)

	// Check that changing the seed changes the encrypted output.
	let [spd, errGSPD2] = generateSeedPhraseDeterministic("a different seed")
  expect(errGSPD2).toBe(null)
	let [seed2, errSPTS2] = seedPhraseToSeed(spd)
  expect(errSPTS2).toBe(null)
	let [encData3, errEFS2] = encryptFileSmall(seed2, inode, revision, metadata, fileData)
  expect(errEFS2).toBe(null)
  expect(encData3.length).toBe(encryptedData.length)
  // Check that there is substantial difference between the two ciphertexts.
	matches = 0
	for (let i = 0; i < encData3.length; i++) {
		if (encData3[i] === encryptedData[i]) {
			matches += 1
		}
	}
  expect(matches).toBeLessThan(encData3.length / 30)

	// Check that changing the file changes the data
	let fileDataAlt = new TextEncoder().encode("this is somm file data")
	let [encFD, errFD] = encryptFileSmall(seed, inode, revision, metadata, fileDataAlt)
  expect(errFD).toBe(null)
  expect(encFD.length).toBe(encryptedData.length)
	matches = 0
	for (let i = 0; i < encFD.length; i++) {
		if (encFD[i] === encryptedData[i]) {
			matches += 1
		}
	}
  expect(matches).toBeLessThan(encryptedData.length / 30)

	// Check that a modified file fails decryption. Try several different modifications.
	encFD[250] += 1
	let [, , errFD1] = decryptFileSmall(seed, inode, encFD)
  expect(errFD1).not.toBe(null)
	encFD[250] -= 1
	encFD[0] += 1
	let [, , errFD2] = decryptFileSmall(seed, inode, encFD)
  expect(errFD2).not.toBe(null)
	encFD[0] -= 1
	encFD[4095] += 1
	let [, , errFD3] = decryptFileSmall(seed, inode, encFD)
  expect(errFD3).not.toBe(null)
	encFD[4095] -= 1
	// This time try withtout the modification to make sure decryption still
	// works.
	let [decFDMeta, decFDData, errFD4] = decryptFileSmall(seed, inode, encFD)
  expect(errFD4).toBe(null)
  expect(decFDMeta.filename).toBe("test.txt")
  expect(fileDataAlt).toEqual(decFDData)

	// Check that a bad seed fails decryption
	let [, , errFD5] = decryptFileSmall(seed2, inode, encFD)
  expect(errFD5).not.toBe(null)
})
