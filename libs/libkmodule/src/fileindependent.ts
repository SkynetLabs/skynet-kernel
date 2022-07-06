// independentfile.ts defines an API for working with independent files. This
// is the easiest way to put private data onto Skynet. This ease of use comes
// with some tradeoffs: namely the list of files cannot be queried (you have to
// already know the file by its filename), and files created using this API are
// not meant to be shared.

// TODO: Need to implement delete using the special registry value that
// signifies a deleted file, then implement deleteFile on independentFileSmall.

// TODO: Need to implement registry subscriptions so that we can detect if the
// file has been modified elsewhere and invalidate the file / update the
// caller.

import { download } from "./messagedownload.js"
import { registryRead, registryWrite } from "./messageregistry.js"
import { upload } from "./messageupload.js"
import {
	addContextToErr,
	decryptFileSmall,
	deriveRegistryEntryID,
	ed25519Keypair,
	encryptFileSmall,
	entryIDToSkylink,
	error,
	skylinkToResolverEntryData,
	taggedRegistryEntryKeys,
	tryStringify,
} from "libskynet"

const ERR_EXISTS = "exists"
const ERR_NOT_EXISTS = "DNE"
const STD_FILENAME = "file"

// overwriteDataFn is the function signature for calling 'overwriteData' on an
// independentFile.
type overwriteDataFn = (newData: Uint8Array) => Promise<error>

// readDataFn defines the function signature for calling 'readData' on an
// indepdendentFile.
//
// NOTE: When implementing a full sized independent file, the 'readData'
// function should either return an error or return the full file. To do
// partial reads, use/implement the function 'read'.
type readDataFn = () => Promise<[Uint8Array, error]>

// independentFileMetadataSmall defines the established metadata for an
// independentFile. The metadata is not allowed to be adjusted because we want
// to keep the api for an independentFile as simple as possible.
//
// We track the largestHistoricSize of the file so that we can protect the user
// from leaking information if they shrink the size of the file between writes.
interface independentFileSmallMetadata {
	filename: string
	largestHistoricSize: bigint
}

// independentFileSmall is a safe object for working with small independent
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
interface independentFileSmall {
	dataKey: Uint8Array
	fileData: Uint8Array
	inode: string
	keypair: ed25519Keypair
	metadata: independentFileSmallMetadata
	revision: bigint
	seed: Uint8Array

	// overwriteData is a function that takes the new file data (a uint8array)
	// as input and updates the file on Skynet to contain the new data.
	overwriteData: overwriteDataFn

	// readData is a function that returns the fileData of the independentFile.
	// It is a safe passthrough to fileData - it makes a copy before returning
	// the data.
	readData: readDataFn
}

// createIndependentFile will create a new independent file with the provided
// data. The revision number is intentionally set to '0' to ensure that any
// existing file at the same inode will not be obliterated on accident in the
// event of an erroneus call to 'createIndependentFile'.
//
// If an independent file with the provided inode already exists, an error will
// be returned.
function createIndependentFileSmall(
	seed: Uint8Array,
	inode: string,
	fileData: Uint8Array
): Promise<[independentFileSmall, error]> {
	return new Promise(async (resolve) => {
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

		// Create the encrypted file blob.
		let metadata: independentFileSmallMetadata = {
			filename: inode,
			largestHistoricSize: BigInt(fileData.length),
		}
		let revision = 0n
		let [encryptedData, errEF] = encryptFileSmall(
			seed,
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
		let [skylink, errU] = await upload(STD_FILENAME, encryptedData)
		if (errU !== null) {
			resolve([{} as any, addContextToErr(errU, "upload failed")])
			return
		}

		// Write to the registry entry.
		let [entryData, errSTRED] = skylinkToResolverEntryData(skylink)
		if (errSTRED !== null) {
			resolve([{} as any, addContextToErr(errSTRED, "could not create resovler link from upload skylink")])
			return
		}
		let [, errRW] = await registryWrite(keypair, dataKey, entryData, revision)
		if (errRW !== null) {
			resolve([{} as any, addContextToErr(errRW, "could not write to registry entry")])
			return
		}

		// Create and return the independentFile.
		let ifile: independentFileSmall = {
			dataKey,
			fileData,
			inode,
			keypair,
			metadata,
			revision,
			seed,

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

// openIndependentFileSmall is used to open an already existing independent file. If
// one does not exist, an error will be returned.
function openIndependentFileSmall(seed: Uint8Array, inode: string): Promise<[independentFileSmall, error]> {
	return new Promise(async (resolve) => {
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
			resolve([{} as any, addContextToErr(errD, "unable to download file metadata")])
			return
		}

		// Decrypt the file to read the metadata.
		let [metadata, fileData, errDF] = decryptFileSmall(seed, inode, encryptedData)
		if (errDF !== null) {
			resolve([{} as any, addContextToErr(errDF, "unable to decrypt file")])
			return
		}

		let ifile: independentFileSmall = {
			dataKey,
			fileData,
			inode,
			keypair,
			metadata,
			revision: result.revision!,
			seed,

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

// overwriteIndependentFileSmall will replace the fileData of the file with the
// provided data.
//
// NOTE: This function is not thread safe, it should only be called by one
// process at a time.
function overwriteIndependentFileSmall(file: independentFileSmall, newData: Uint8Array): Promise<error> {
	return new Promise(async (resolve) => {
		// Create a new metadata for the file based on the current file
		// metadata. Need to update the largest historic size.
		let newMetadata: independentFileSmallMetadata = {
			filename: file.metadata.filename,
			largestHistoricSize: BigInt(file.metadata.largestHistoricSize),
		}
		if (BigInt(newData.length) > newMetadata.largestHistoricSize) {
			newMetadata.largestHistoricSize = BigInt(newData.length)
		}

		// Create a new encrypted blob for the data.
		//
		// NOTE: Need to supply the data that would be in place after a
		// successful update, which means using the new metadata and also using
		// an incremented revision number.
		let [encryptedData, errEF] = encryptFileSmall(
			file.seed,
			file.inode,
			file.revision + 1n,
			newMetadata,
			newData,
			newMetadata.largestHistoricSize
		)
		if (errEF !== null) {
			resolve(addContextToErr(errEF, "unable to encrypt updated file"))
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
			resolve(addContextToErr(errSTRED, "could not create resovler link from upload skylink"))
			return
		}
		// NOTE: Don't forget to increment the revision here.
		let [, errRW] = await registryWrite(file.keypair, file.dataKey, entryData, file.revision + 1n)
		if (errRW !== null) {
			resolve(addContextToErr(errRW, "could not write to registry entry"))
			return
		}

		// File update was successful, update the file metadata.
		file.revision += 1n
		file.metadata = newMetadata
		file.fileData = newData
		resolve(null)
	})
}

export { createIndependentFileSmall, openIndependentFileSmall, ERR_EXISTS, ERR_NOT_EXISTS }
