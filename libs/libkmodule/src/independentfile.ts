// independentfile.ts defines an API for working with independent files. This
// is the easiest way to put private data onto Skynet. This ease of use comes
// with some tradeoffs: namely the list of files cannot be queried (you have to
// already know the file by its inode), and files created using this API are
// not meant to be shared.

// TODO: Need to implement delete using the special registry value that
// signifies a deleted file, then implement deleteFile on IndependentFileSmall.

// TODO: Need to implement registry subscriptions so that we can detect if the
// file has been modified elsewhere and invalidate the file / update the
// caller.

// NOTE: One thing that happens in this file is the randomization of the
// revision number, to help hide the total number of times that the user has
// modified the file. The initial revision number starts between 0 and 2^16,
// and then each revision after that randomly adds between 1 and 256 to the
// revision number.
//
// If you do this naively (with truly randomly generated revision numbers), you
// introduce safety issues. An outdated version of the file may be updated and
// skip over the revision number of the most recent version of the file,
// causing data loss.
//
// We avoid this by ensuring that the revision number sequence is deterministic
// based on the seed and inode of the file. If an outdated version of the file
// tries to make an update, it is guaranteed to not skip over the revision
// number of the latest version of the file. If you repeat this pattern of
// randomizing the revision number in your own code, please ensure that you
// make the updates deterministic based on some secret.

import { download } from "./messagedownload"
import { registryRead, registryWrite } from "./messageregistry"
import { upload } from "./messageupload"
import {
	addContextToErr,
	b64ToBuf,
	bufToB64,
	decryptFileSmall,
	deriveChildSeed,
	deriveRegistryEntryID,
	ed25519Keypair,
	encodeU64,
	encryptFileSmall,
	entryIDToSkylink,
	error,
	namespaceInode,
	skylinkToResolverEntryData,
	taggedRegistryEntryKeys,
} from "libskynet"

const ERR_EXISTS = "exists"
const ERR_NOT_EXISTS = "DNE"
const STD_FILENAME = "file"

// OverwriteDataFn is the function signature for calling 'overwriteData' on an
// IndependentFile.
type OverwriteDataFn = (newData: Uint8Array) => Promise<error>

// ReadDataFn defines the function signature for calling 'readData' on an
// indepdendentFile.
//
// NOTE: When implementing a full sized independent file, the 'readData'
// function should either return an error or return the full file. To do
// partial reads, use/implement the function 'read'.
type ReadDataFn = () => Promise<[Uint8Array, error]>

type IndependentFileSmallType = IndependentFileSmall | IndependentFileSmallViewer

// IndependentFileMetadataSmall defines the established metadata for an
// IndependentFile. The metadata is not allowed to be adjusted because we want
// to keep the api for an independentFile as simple as possible.
//
// We track the largestHistoricSize of the file so that we can protect the user
// from leaking information if they shrink the size of the file between writes.
interface IndependentFileSmallMetadata {
	largestHistoricSize: bigint
}

// IndependentFileSmall is a safe object for working with small independent
// files. It supports the 'overwriteData' function, which will replace the
// existing data in the file with new data.
//
// The file is called 'independent' because it is not connected to any
// filesystem. The only way to look up the file is to use its inode. An inode
// is similar to a filename, except that it cannot be changed. If the inode is
// changed, the whole file is changed (the file will need to be re-encrypted,
// and any prior encryption keys that were given out will no longer be able to
// view the file).
//
// Independent files are **secure**. They are encrypted using the user's seed,
// they are padded, and they can be used freely and updated freely with no
// concern of exposing
//
// The small independent files keep all of the data in memory at all times.
// When making modifications to a small independent file, the entire file needs
// to be re-encrypted and re-uploaded. We recommend small files stay under 4
// MB, however there's no formal limitation in the size of an independent file.
interface IndependentFileSmall {
	dataKey: Uint8Array
	fileData: Uint8Array
	inode: string
	keypair: ed25519Keypair
	metadata: IndependentFileSmallMetadata
	revision: bigint
	seed: Uint8Array

	// These fields allow the file to be shared in read-only mode. Someone who
	// has this data can read the file, but cannot update the file.
	skylink: string
	viewKey: string

	// overwriteData is a function that takes the new file data (a uint8array)
	// as input and updates the file on Skynet to contain the new data.
	overwriteData: OverwriteDataFn

	// readData is a function that returns the fileData of the IndependentFile.
	// It is a safe passthrough to fileData - it makes a copy before returning
	// the data.
	readData: ReadDataFn
}

// IndependentFileSmallViewer allows someone with a viewKey to read from an
// IndependentFileSmall, without giving them any write access.
interface IndependentFileSmallViewer {
	fileData: Uint8Array
	skylink: string
	viewKey: string

	// readData is a function that returns the fileData of the IndependentFile.
	// It is a safe passthrough to fileData - it makes a copy before returning
	// the data.
	readData: ReadDataFn
}

// createIndependentFileSmall will create a new independent file with the
// provided data. The revision number is intentionally set to '0' to ensure
// that any existing file at the same inode will not be obliterated on accident
// in the event of an erroneus call to 'createIndependentFileSmall'.
//
// If an independent file with the provided inode already exists, an error will
// be returned.
function createIndependentFileSmall(
	seed: Uint8Array,
	userInode: string,
	fileData: Uint8Array
): Promise<[IndependentFileSmall, error]> {
	return new Promise(async (resolve) => {
		// Namespace the inode so that inodes created by the user using
		// different filetypes cannot be accessed by calling the wrong
		// function.
		let [inode, errNI] = namespaceInode("IndependentFileSmall", userInode)
		if (errNI !== null) {
			resolve([{} as any, addContextToErr(errNI, "unable to namespace inode")])
			return
		}

		// Derive the registry entry keys for the file at this inode.
		let [keypair, dataKey, errTREK] = taggedRegistryEntryKeys(seed, inode, inode)
		if (errTREK !== null) {
			resolve([{} as any, addContextToErr(errTREK, "unable to get registry entry for provided inode")])
			return
		}

		// Read from the registry entry to check that this file doesn't already
		// exist. If it does, return an error. We need to check both the exists
		// and deleted value on the registry entry because the registry entry
		// may exist yet still indicate that the file has been deleted.
		let [result, errRR] = await registryRead(keypair.publicKey, dataKey)
		if (errRR !== null) {
			resolve([{} as any, addContextToErr(errRR, "unable to read registry entry for file")])
			return
		}
		if (result.exists === true && result.deleted === false) {
			resolve([{} as any, "exists"])
			return
		}

		// Create the encrypted file blob. When creating the encrypted file
		// blob, we derive a separate seed so that we can provide the seed as a
		// view key for this file. The seed will depend on the inode so that
		// view keys for individual files can be passed around.
		let encryptionKey = deriveChildSeed(seed, inode)
		let metadata: IndependentFileSmallMetadata = {
			largestHistoricSize: BigInt(fileData.length),
		}

		// Compute the revision number. We need the revision number to be
		// random, but deterministic so parallel writes will use the same
		// number as we do. Every update increments the revision by a random
		// number between 0 and 2^16.
		let revisionSeed = new Uint8Array(seed.length + 8)
		revisionSeed.set(seed, 0)
		let revisionKey = deriveChildSeed(revisionSeed, inode)
		let revision = BigInt(revisionKey[0]) * 256n + BigInt(revisionKey[1])
		let [encryptedData, errEF] = encryptFileSmall(
			encryptionKey,
			inode,
			revision,
			metadata,
			fileData,
			metadata.largestHistoricSize
		)
		if (errEF !== null) {
			resolve([{} as any, addContextToErr(errEF, "unable to encrypt file")])
			return
		}

		// Upload the data to get the immutable link.
		let [immutableSkylink, errU] = await upload(STD_FILENAME, encryptedData)
		if (errU !== null) {
			resolve([{} as any, addContextToErr(errU, "upload failed")])
			return
		}

		// Write to the registry entry.
		let [entryData, errSTRED] = skylinkToResolverEntryData(immutableSkylink)
		if (errSTRED !== null) {
			resolve([{} as any, addContextToErr(errSTRED, "couldn't create resovler link from upload skylink")])
			return
		}
		let [, errRW] = await registryWrite(keypair, dataKey, entryData, revision)
		if (errRW !== null) {
			resolve([{} as any, addContextToErr(errRW, "could not write to registry entry")])
			return
		}

		// Get the skylink for this file.
		let [entryID, errDREID] = deriveRegistryEntryID(keypair.publicKey, dataKey)
		if (errDREID !== null) {
			resolve([{} as any, addContextToErr(errDREID, "could not compute entry id")])
			return
		}
		let skylink = entryIDToSkylink(entryID)

		// Create the view key, which is a composition of the inode and the
		// encryption key.
		let encStr = bufToB64(encryptionKey)
		let viewKey = encStr + inode

		// Create and return the IndependentFile.
		let ifile: IndependentFileSmall = {
			dataKey,
			fileData,
			inode,
			keypair,
			metadata,
			revision,
			seed,

			skylink,
			viewKey,

			overwriteData: function (newData: Uint8Array): Promise<error> {
				return overwriteIndependentFileSmall(ifile, newData)
			},
			readData: function (): Promise<[Uint8Array, error]> {
				return new Promise((resolve) => {
					let data = new Uint8Array(ifile.fileData.length)
					data.set(ifile.fileData, 0)
					resolve([data, null])
				})
			},
		}
		resolve([ifile, null])
	})
}

// openIndependentFileSmall is used to open an already existing independent file. If
// one does not exist, an error will be returned.
function openIndependentFileSmall(seed: Uint8Array, userInode: string): Promise<[IndependentFileSmall, error]> {
	return new Promise(async (resolve) => {
		// Namespace the inode so that inodes created by the user using
		// different filetypes cannot be accessed by calling the wrong
		// function.
		let [inode, errNI] = namespaceInode("IndependentFileSmall", userInode)
		if (errNI !== null) {
			resolve([{} as any, addContextToErr(errNI, "unable to namespace inode")])
			return
		}

		// Derive the registry entry keys for the file at this inode.
		let [keypair, dataKey, errTREK] = taggedRegistryEntryKeys(seed, inode, inode)
		if (errTREK !== null) {
			resolve([{} as any, addContextToErr(errTREK, "unable to get registry entry for provided inode")])
			return
		}

		// Read from the registry entry to check that this file doesn't already
		// exist. If it does, return an error. We need to check both the
		// 'exists' value and the 'deleted' value on the registry result to
		// know if a file exists, because the registry entry may exist yet
		// still indicate the file was deleted.
		let [result, errRR] = await registryRead(keypair.publicKey, dataKey)
		if (errRR !== null) {
			resolve([{} as any, addContextToErr(errRR, "unable to read registry entry for file")])
			return
		}
		if (result.exists !== true || result.deleted === true) {
			resolve([{} as any, ERR_NOT_EXISTS])
			return
		}

		// Determine the skylink of the encrypted file.
		let [entryID, errDREID] = deriveRegistryEntryID(keypair.publicKey, dataKey)
		if (errDREID !== null) {
			resolve([{} as any, addContextToErr(errDREID, "unable to derive registry entry id")])
			return
		}
		let skylink = entryIDToSkylink(entryID)

		// Download the file to load the metadata and file data.
		let [encryptedData, errD] = await download(skylink)
		if (errD !== null) {
			resolve([{} as any, addContextToErr(errD, "unable to download file")])
			return
		}

		// Decrypt the file to read the metadata.
		let encryptionKey = deriveChildSeed(seed, inode)
		let [metadata, fileData, errDF] = decryptFileSmall(encryptionKey, inode, encryptedData)
		if (errDF !== null) {
			resolve([{} as any, addContextToErr(errDF, "unable to decrypt file")])
			return
		}

		// Create the view key
		let encStr = bufToB64(encryptionKey)
		let viewKey = encStr + inode

		let ifile: IndependentFileSmall = {
			dataKey,
			fileData,
			inode,
			keypair,
			metadata,
			revision: result.revision!,
			seed,

			skylink,
			viewKey,

			// overwriteData will replace the fileData with the provided
			// newData.
			overwriteData: function (newData: Uint8Array): Promise<error> {
				return overwriteIndependentFileSmall(ifile, newData)
			},
			// readData will return the data contained in the file.
			readData: function (): Promise<[Uint8Array, error]> {
				return new Promise((resolve) => {
					let data = new Uint8Array(ifile.fileData.length)
					data.set(ifile.fileData, 0)
					resolve([data, null])
				})
			},
		}
		resolve([ifile, null])
	})
}

// viewIndependentFileSmall creates a viewer object that allows the caller to
// download and decrypt the file. The file cannot be updated using this
// function.
function viewIndependentFileSmall(skylink: string, viewKey: string): Promise<[IndependentFileSmallViewer, error]> {
	return new Promise(async (resolve) => {
		// Download the file to load the metadata and file data.
		let [encryptedData, errD] = await download(skylink)
		if (errD !== null) {
			resolve([{} as any, addContextToErr(errD, "unable to download file")])
			return
		}
		// Break the viewKey into the inode and encryption key.
		let encStr = viewKey.slice(0, 22)
		let [encryptionKey, errBTB] = b64ToBuf(encStr)
		if (errBTB !== null) {
			resolve([{} as any, addContextToErr(errBTB, "unable to extract encryption key from view key")])
			return
		}
		let inode = viewKey.slice(22, viewKey.length)
		let [, fileData, errDF] = decryptFileSmall(encryptionKey, inode, encryptedData)
		if (errDF !== null) {
			resolve([{} as any, addContextToErr(errDF, "unable to decrypt file")])
			return
		}

		// Create and return the viewer file.
		let ifile: IndependentFileSmallViewer = {
			fileData,
			skylink,
			viewKey,

			// readData will return the data contained in the file.
			readData: function (): Promise<[Uint8Array, error]> {
				return new Promise((resolve) => {
					let data = new Uint8Array(ifile.fileData.length)
					data.set(ifile.fileData, 0)
					resolve([data, null])
				})
			},
		}
		resolve([ifile, null])
	})
}

// overwriteIndependentFileSmall will replace the fileData of the file with the
// provided data.
//
// NOTE: This function is not thread safe, it should only be called by one
// process at a time.
function overwriteIndependentFileSmall(file: IndependentFileSmall, newData: Uint8Array): Promise<error> {
	return new Promise(async (resolve) => {
		// Create a new metadata for the file based on the current file
		// metadata. Need to update the largest historic size.
		let newMetadata: IndependentFileSmallMetadata = {
			largestHistoricSize: BigInt(file.metadata.largestHistoricSize),
		}
		if (BigInt(newData.length) > newMetadata.largestHistoricSize) {
			newMetadata.largestHistoricSize = BigInt(newData.length)
		}

		// Compute the new revision number for the file. This is done
		// deterministically using the seed and the current revision number, so
		// that multiple concurrent updates will end up with the same revision.
		// We use a random number between 1 and 256 for our increment.
		let [encodedRevision, errEU64] = encodeU64(file.revision)
		if (errEU64 !== null) {
			resolve(addContextToErr(errEU64, "unable to encode revision"))
			return
		}
		let revisionSeed = new Uint8Array(file.seed.length + encodedRevision.length)
		revisionSeed.set(file.seed, 0)
		revisionSeed.set(encodedRevision, file.seed.length)
		let revisionKey = deriveChildSeed(revisionSeed, file.inode)
		let newRevision = file.revision + BigInt(revisionKey[0]) + 1n

		// Get the encryption key.
		let encryptionKey = deriveChildSeed(file.seed, file.inode)

		// Create a new encrypted blob for the data.
		//
		// NOTE: Need to supply the data that would be in place after a
		// successful update, which means using the new metadata and revision
		// number.
		let [encryptedData, errEFS] = encryptFileSmall(
			encryptionKey,
			file.inode,
			newRevision,
			newMetadata,
			newData,
			newMetadata.largestHistoricSize
		)
		if (errEFS !== null) {
			resolve(addContextToErr(errEFS, "unable to encrypt updated file"))
			return
		}

		// Upload the data to get the immutable link.
		let [skylink, errU] = await upload(STD_FILENAME, encryptedData)
		if (errU !== null) {
			resolve(addContextToErr(errU, "new data upload failed"))
			return
		}

		// Write to the registry entry.
		let [entryData, errSTRED] = skylinkToResolverEntryData(skylink)
		if (errSTRED !== null) {
			resolve(addContextToErr(errSTRED, "could not create resolver link from upload skylink"))
			return
		}
		let [, errRW] = await registryWrite(file.keypair, file.dataKey, entryData, newRevision)
		if (errRW !== null) {
			resolve(addContextToErr(errRW, "could not write to registry entry"))
			return
		}

		// File update was successful, update the file metadata.
		file.revision = newRevision
		file.metadata = newMetadata
		file.fileData = newData
		resolve(null)
	})
}

export { createIndependentFileSmall, openIndependentFileSmall, viewIndependentFileSmall, ERR_EXISTS, ERR_NOT_EXISTS }
