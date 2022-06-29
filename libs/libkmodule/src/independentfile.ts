// independentfile.ts defines an API for working with independent files. This
// is the easiest way to put private data onto Skynet. This ease of use comes
// with some tradeoffs: namely the list of files cannot be queried (you have to
// already know the file by its filename), and files created using this API are
// not meant to be shared.

// TODO: Need to implement delete using the special registry value that
// signifies a deleted file.

import { download } from "./messagedownload.js"
import { registryRead, registryWrite } from "./messageregistry.js"
import { upload } from "./messageupload.js"
import {
	addContextToErr,
	decryptFile,
	deriveRegistryEntryID,
	ed25519Keypair,
	encryptFile,
	entryIDToSkylink,
	error,
	skylinkToResolverEntryData,
	taggedRegistryEntryKeys,
} from "libskynet"

// overwriteDataFn is the function signature for calling 'overwriteData' on an
// independentFile.
type overwriteDataFn = (newData: Uint8Array) => Promise<error>

// independentFileMetadata defines the established metadata for an
// independentFile. The metadata is not allowed to be adjusted because we want
// to keep the api for an independentFile as simple as possible.
//
// We track the largestHistoricSize of the file so that we can protect the user
// from leaking information if they shrink the size of the file between writes.
interface independentFileMetadata {
	filename: string
	largestHistoricSize: number
}

// independentFile is a safe object for working with independent files. It
// supports the 'overwriteData' function, which will replace the existing data
// in the file with new data.
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
interface independentFile {
	dataKey: Uint8Array
	inode: string
	keypair: ed25519Keypair
	metadata: independentFileMetadata
	overwriteData: overwriteDataFn
	revision: bigint
	seed: Uint8Array
}

// createIndependentFile will create a new independent file with the provided
// data. The revision number is intentionally set to '0' to ensure that any
// existing file at the same inode will not be obliterated on accident in the
// event of an erroneus call to 'createIndependentFile'.
//
// If an independent file with the provided inode already exists, an error will
// be returned.
function createIndependentFile(
	seed: Uint8Array,
	inode: string,
	fileData: Uint8Array
): Promise<[independentFile, error]> {
	return new Promise(async (resolve) => {
		// Derive the registry entry keys for the file at this inode.
		let [keypair, dataKey, errTREK] = taggedRegistryEntryKeys(seed, inode, inode)
		if (errTREK !== null) {
			resolve([{} as any, addContextToErr(errTREK, "unable to get registry entry for provided inode")])
			return
		}

		// Read from the registry entry to check that this file doesn't already
		// exist. If it does, return an error.
		let [result, errRR] = await registryRead(keypair.publicKey, dataKey)
		if (errRR !== null) {
			resolve([{} as any, addContextToErr(errRR, "unable to read registry entry for file")])
			return
		}
		if (result.exists === true) {
			resolve([
				{} as any,
				"cannot create new file, a file already exists at this inode. Use openIndepdendentFile instead",
			])
			return
		}

		// Create the encrypted file blob.
		let metadata: independentFileMetadata = {
			filename: inode,
			largestHistoricSize: fileData.length,
		}
		let revision = 0n
		let [encryptedData, errEF] = encryptFile(seed, inode, revision, metadata, fileData, metadata.largestHistoricSize)
		if (errEF !== null) {
			resolve([{} as any, addContextToErr(errEF, "unable to encrypt file")])
			return
		}

		// Upload the data to get the immutable link.
		let [skylink, errU] = await upload(metadata.filename, encryptedData)
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
		let [entryID, errRW] = await registryWrite(keypair, dataKey, entryData, revision)
		if (errRW !== null) {
			resolve([{} as any, addContextToErr(errRW, "could not write to registry entry")])
			return
		}

		// TODO: May want to subscribe to the registry etnry to watch for
		// changes that other instances of this user's account might be making.
		// Basically it'd be some hook inside of the indyFile that would
		// cause the independent file to be updated or produce an error or something
		// in the event of a write from another location.

		// Create and return the independentFile.
		let ifile: independentFile = {
			dataKey,
			inode,
			keypair,
			metadata,
			revision,
			seed,

			overwriteData: function (newData: Uint8Array): Promise<error> {
				return overwriteIndependentFile(ifile, newData)
			},
		}
		resolve([ifile, null])
	})
}

// openIndependentFile is used to open an already existing independent file. If
// one does not exist, an error will be returned.
function openIndependentFile(seed: Uint8Array, inode: string): Promise<[independentFile, error]> {
	return new Promise(async (resolve) => {
		// Derive the registry entry keys for the file at this inode.
		let [keypair, dataKey, errTREK] = taggedRegistryEntryKeys(seed, inode, inode)
		if (errTREK !== null) {
			resolve([{} as any, addContextToErr(errTREK, "unable to get registry entry for provided inode")])
			return
		}

		// Read from the registry entry to check that this file doesn't already
		// exist. If it does, return an error.
		let [result, errRR] = await registryRead(keypair.publicKey, dataKey)
		if (errRR !== null) {
			resolve([{} as any, addContextToErr(errRR, "unable to read registry entry for file")])
			return
		}
		if (result.exists !== true) {
			resolve([{} as any, "cannot open file, file does not appear to exist"])
			return
		}

		// Download the file to read the metadata.
		let [entryID, errDREID] = deriveRegistryEntryID(keypair.publicKey, dataKey)
		if (errDREID !== null) {
			resolve([{} as any, addContextToErr(errDREID, "unable to derive registry entry id")])
			return
		}
		let skylink = entryIDToSkylink(entryID)
		let [encryptedData, errD] = await download(skylink)
		if (errD !== null) {
			resolve([{} as any, addContextToErr(errD, "unable to download file metadata")])
			return
		}

		// Decrypt the file to read the metadata.
		let [metadata, , errDF] = decryptFile(seed, inode, encryptedData)
		if (errDF !== null) {
			resolve([{} as any, addContextToErr(errDF, "unable to decrypt file")])
			return
		}

		// TODO: May want to subscribe to the registry etnry to watch for changes
		// that other instances of this user's account might be making.

		let ifile: independentFile = {
			dataKey,
			inode,
			keypair,
			metadata,
			revision: result.revision!,
			seed,

			overwriteData: function (newData: Uint8Array): Promise<error> {
				return overwriteIndependentFile(ifile, newData)
			},
		}
		resolve([ifile, null])
	})
}

// overwriteIndependentFile will replace the fileData of the file with the
// provided data.
//
// NOTE: This function is not thread safe, it should only be called by one
// process at a time.
function overwriteIndependentFile(file: independentFile, newData: Uint8Array): Promise<error> {
	return new Promise(async (resolve) => {
		// Create a new metadata for the file based on the current file
		// metadata. Need to update the largest historic size.
		let newMetadata: independentFileMetadata = {
			filename: file.metadata.filename,
			largestHistoricSize: file.metadata.largestHistoricSize,
		}
		if (newData.length > newMetadata.largestHistoricSize) {
			newMetadata.largestHistoricSize = newData.length
		}

		// Create a new encrypted blob for the data.
		//
		// NOTE: Need to supply the data that would be in place after a
		// successful update, which means using the new metadata and also using
		// an incremented revision number.
		let [encryptedData, errEF] = encryptFile(
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
		let [skylink, errU] = await upload(file.metadata.filename, encryptedData)
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
		let [entryID, errRW] = await registryWrite(file.keypair, file.dataKey, entryData, file.revision + 1n)
		if (errRW !== null) {
			resolve(addContextToErr(errRW, "could not write to registry entry"))
			return
		}

		// File update was successful, update the file metadata.
		file.revision += 1n
		file.metadata = newMetadata
		resolve(null)
	})
}

export { createIndependentFile }
