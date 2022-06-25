import { encodeU64 } from "./encoding.js"
import { otpEncrypt } from "./encrypt.js"
import { addContextToErr } from "./err.js"
import { taggedRegistryEntryKeys } from "./registry.js"
import { sha512 } from "./sha512.js"
import { jsonStringify } from "./stringifyjson.js"
import { error } from "./types.js"

// getPaddedFileSize will pad the file out to a common filesize, to prevent
// onlookers from learning about the file based on the file's size.
//
// Files under 80 kib in size are padded out to the nearest 4 kib. Files under
// 160 kib are padded out to the nearest 8 kib. Files under 320 kib are padded
// out to the nearest 16 kib... and so on.
//
// NOTE: A common intuition that people have when padding files to hide the
// filesize is to add a random amount of padding. Though this does somewhat
// obfuscate the size of the file, the randomness leaks information especially
// when the attacker has a chance to get a lot of samples (for example, the
// user has a large number of files or the file is being modified and resized
// frequently). By padding to explicit, pre-chosen boundaries you significantly
// reduce the total amount of inforamation that gets leaked.
//
// There is one edge case to be aware of: if a file ever gets resized, you
// should avoid if at all possible downsizing the file, as this can leak
// information, especially if the file is being resized frequently and is also
// right along a padding boundary.
function getPaddedFileSize(originalSize: number): number {
	// Determine the rounding factor.
	let blockSize = 4096
	let largestAllowed = 1024 * 80
	while(largestAllowed < originalSize) {
		largestAllowed *= 2
		blockSize *= 2
	}

	// Perform the rounding.
	let finalSize = blockSize
	while(finalSize < originalSize) {
		finalSize += blockSize
	}
	return finalSize
}

// saveFile takes a seed, an inode, and the fileData and then saves the file to
// Skynet.
//
// The seed will be used to determine the privacy. The inode is used for
// derivation - all files that use the same seed and inode will result in the
// same resolver link.
//
// The revision number is required to ensure that data isn't overwritten
// unintentionally. The caller needs to supply a revision number to show they
// know what data they are expecting to overwrite.
//
// The metadata should contain a filename. If no filename is provided, the
// inode name will be used, however the inode name is not intended to always
// match the filename. By keeping the inode distinct, the file can be renamed
// without having to change its resolver link.
//
// TODO: You didn't provide any way to tell if decryption key is correct. I
// guess actually we should just be able to derive the tweak and know from
// that.
function saveFile(seed: Uint8Array, inode: string, revision: bigint, metadata: any, fileData: Uint8Array): error {
	// Derive the registry entry keys. The registry entry keys need to be
	// derived based solely on the seed and the inode.
	let [keypair, datakey, errTREK] = taggedRegistryEntryKeys(seed, inode, inode)
	if (errTREK !== null) {
		return addContextToErr(errTREK, "unable to derive registry entry keys")
	}

	// Get a json encoding of the metadata.
	let [metadataStr, errJS] = jsonStringify(metadata)
	if (errJS !== null) {
		return addContextToErr(errJS, "unable to stringify the metadata")
	}
	let metadataBytes = new TextEncoder().encode(metadataStr)

	// Create the array that will contain the full padded file. The full padded
	// file will need to have the file data, the metadata, a size for each, and
	// then a unique 16 byte prefix which will be used to tweak the encryption
	// key.
	//
	// Tweaking the encryption key is necessary because the encryption we use
	// functions like a one-time-pad - if different data gets encrypted, the
	// key needs to be entirely altered. We get the encryption key tweak by
	// hashing the full padded file, which will include the revision number
	// stashed in front.
	let rawSize = fileData.length+metadataBytes.length+16+8+8
	let paddedSize = getPaddedFileSize(rawSize)
	let fullData = new Uint8Array(paddedSize)
	let [encodedFileSize, errEU641] = encodeU64(BigInt(fileData.length))
	if (errEU641 !== null) {
		return addContextToErr(errEU641, "unable to encode file data size")
	}
	let [encodedMetadataSize, errEU642]  = encodeU64(BigInt(metadataBytes.length))
	if (errEU642 !== null) {
		return addContextToErr(errEU642, "unable to encode metadata size")
	}
	let [encodedRevision, errEU643] = encodeU64(revision)
	if (errEU643 !== null) {
		return addContextToErr(errEU643, "unable to encode revision number")
	}
	fullData.set(encodedRevision, 0)
	fullData.set(encodedFileSize, 16) // revision is hiding where the tweak will go, so we need to leave 16 bytes
	fullData.set(encodedMetadataSize, 24)
	fullData.set(metadataBytes, 32)
	fullData.set(fileData, 32+metadataBytes.length)

	// Create the encryption tweak and place it at the front of the fullData.
	let fileHash = sha512(fullData)
	let tweak = fileHash.slice(0, 16)
	fullData.set(tweak, 0)

	// Add the encryption. The revision number is used to derive the encryption
	// key to minimize the chance of key reuse as files get modified.
	let encryptionTag = new TextEncoder().encode(" encryption " + inode)
	let preimage = new Uint8Array(seed.length + encryptionTag.length + tweak.length)
	preimage.set(seed, 0)
	preimage.set(encryptionTag, seed.length)
	preimage.set(tweak, seed.length + encryptionTag.length)
	let encryptionKey = sha512(preimage).slice(0, 16)

	// Encrypt the file.
	otpEncrypt(encryptionKey, fullData.slice(16, fullData.length))

	// TODO: Upload the file.

	// TODO: Update the registry entry.

	return null
}

export { getPaddedFileSize, saveFile }
