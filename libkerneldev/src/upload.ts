import { addContextToErr } from "./err.js"
import { encodeNumber, bufToB64 } from "./encoding.js"
import { blake2bMerkleRoot } from "./merkle.js"
import { progressiveFetch, progressiveFetchResult } from "./progressivefetch.js"
import { defaultPortalList } from "./defaultportals.js"
import { skylinkV1Bitfield } from "./skylinkbitfield.js"

// Helper variables for returning empty values alongside errors.
const nu8 = new Uint8Array(0)

// validateSkyfilePath checks whether the provided path is a valid path for a
// file in a skylink.
function validateSkyfilePath(path: string): string | null {
	if (path === "") {
		return "path cannot be blank"
	}
	if (path === "..") {
		return "path cannot be .."
	}
	if (path === ".") {
		return "path cannot be ."
	}
	if (path.startsWith("/")) {
		return "metdata.Filename cannot start with /"
	}
	if (path.startsWith("../")) {
		return "metdata.Filename cannot start with ../"
	}
	if (path.startsWith("./")) {
		return "metdata.Filename cannot start with ./"
	}
	let pathElems = path.split("/")
	for (let i = 0; i < pathElems.length; i++) {
		if (pathElems[i] === ".") {
			return "path cannot have a . element"
		}
		if (pathElems[i] === "..") {
			return "path cannot have a .. element"
		}
		if (pathElems[i] === "") {
			return "path cannot have an empty element, cannot contain //"
		}
	}
	return null
}

// validateSkyfileMetadata checks whether the provided metadata is valid
// metadata for a skyfile.
function validateSkyfileMetadata(metadata: any): string | null {
	// Check that the filename is valid.
	if (!("Filename" in metadata)) {
		return "metadata.Filename does not exist"
	}
	if (typeof metadata.Filename !== "string") {
		return "metadata.Filename is not a string"
	}
	let errVSP = validateSkyfilePath(metadata.Filename)
	if (errVSP !== null) {
		return addContextToErr(errVSP, "metadata.Filename does not have a valid path")
	}

	// Check that there are no subfiles.
	if ("Subfiles" in metadata) {
		// TODO: Fill this out using code from
		// skymodules.ValidateSkyfileMetadata to support subfiles.
		return "cannot upload files that have subfiles"
	}

	// Check that the default path rules are being respected.
	if ("DisableDefaultPath" in metadata && "DefaultPath" in metadata) {
		return "cannot set both a DefaultPath and also DisableDefaultPath"
	}
	if ("DefaultPath" in metadata) {
		// TODO: Fill this out with code from
		// skymodules.validateDefaultPath to support subfiles and
		// default paths.
		return "cannot set a default path if there are no subfiles"
	}

	if ("TryFiles" in metadata) {
		if (!metadata.TryFiles.IsArray()) {
			return "metadata.TryFiles must be an array"
		}
		if (metadata.TryFiles.length === 0) {
			return "metadata.TryFiles should not be empty"
		}
		if ("DefaultPath" in metadata) {
			return "metadata.TryFiles cannot be used alongside DefaultPath"
		}
		if ("DisableDefaultPath" in metadata) {
			return "metadata.TryFiles cannot be used alongside DisableDefaultPath"
		}
		// TODO: finish the TryFiles checking using skymodules.ValidateTryFiles
		return "TryFiles is not supported at this time"
	}
	if ("ErrorPages" in metadata) {
		// TODO: finish using skymodules.ValidateErrorPages
		return "ErrorPages is not supported at this time"
	}

	return null
}

// upload will upload the provided fileData to Skynet using the provided
// metadata and then return the resulting skylink. Upload is a secure function
// that computes the skylink of the upload locally, ensuring that the server
// cannot return a malicious skylink and convince a user to run modified code.
function upload(fileData: Uint8Array, metadata: any): Promise<string> {
	return new Promise((resolve, reject) => {
		// Check that this is a small file.
		if (fileData.length > 4 * 1000 * 1000) {
			reject("currently only small uploads are supported, please use less than 4 MB")
			return
		}

		// Encode the metadata after checking that it is valid.
		let errVSM = validateSkyfileMetadata(metadata)
		if (errVSM !== null) {
			reject(addContextToErr(errVSM, "upload is using invalid metadata"))
			return
		}
		let metadataBytes = new TextEncoder().encode(JSON.stringify(metadata))

		// Build the layout of the skyfile.
		let layoutBytes = new Uint8Array(99)
		let offset = 0
		layoutBytes[offset] = 1 // Set the Version
		offset += 1
		let filesizeBytes = encodeNumber(fileData.length)
		layoutBytes.set(filesizeBytes, offset)
		offset += 8
		let mdSizeBytes = encodeNumber(metadataBytes.length)
		layoutBytes.set(mdSizeBytes, offset)
		offset += 8
		let fanoutSizeBytes = encodeNumber(0)
		layoutBytes.set(fanoutSizeBytes, offset)
		offset += 8
		layoutBytes[offset] = 0 // Set the fanout data pieces
		offset += 1
		layoutBytes[offset] = 0 // Set the fanout parity pieces
		offset += 1
		layoutBytes[offset + 7] = 1 // Set the cipher type
		offset += 8
		if (offset + 64 !== 99) {
			reject("error when building the layout bytes, got wrong final offset")
			return
		}

		// Build the base sector.
		let totalSize = layoutBytes.length + metadataBytes.length + fileData.length
		if (totalSize > 1 << 22) {
			reject("error when building the base sector: total sector is too large")
			return
		}
		let baseSector = new Uint8Array(1 << 22)
		offset = 0
		baseSector.set(layoutBytes, offset)
		offset += layoutBytes.length
		baseSector.set(metadataBytes, offset)
		offset += metadataBytes.length
		baseSector.set(fileData, offset)

		// Compute the Skylink of this file.
		let [sectorRoot, errBMR] = blake2bMerkleRoot(baseSector)
		if (errBMR !== null) {
			reject(addContextToErr(errBMR, "unable to create bitfield for skylink"))
			return
		}
		let skylinkBytes = new Uint8Array(34)
		let [bitfield, errSV1B] = skylinkV1Bitfield(totalSize)
		if (errSV1B !== null) {
			reject(addContextToErr(errSV1B, "unable to create bitfield for skylink"))
			return
		}
		skylinkBytes.set(bitfield, 0)
		skylinkBytes.set(sectorRoot, 2)

		// Build the header for the upload call.
		let header = new Uint8Array(92)
		let headerMetadataPrefix = encodeNumber(15)
		let headerMetadata = new TextEncoder().encode("Skyfile Backup\n")
		let versionPrefix = encodeNumber(7)
		let version = new TextEncoder().encode("v1.5.5\n")
		let skylinkPrefix = encodeNumber(46)
		let skylink = bufToB64(skylinkBytes)
		offset = 0
		header.set(headerMetadataPrefix, offset)
		offset += 8
		header.set(headerMetadata, offset)
		offset += 15
		header.set(versionPrefix, offset)
		offset += 8
		header.set(version, offset)
		offset += 7
		header.set(skylinkPrefix, offset)
		offset += 8
		header.set(new TextEncoder().encode(skylink), offset)

		// Build the full request body.
		let reqBody = new Uint8Array((1 << 22) + 92)
		reqBody.set(header, 0)
		reqBody.set(baseSector, 92)

		// Call progressiveFetch to perform the upload.
		let endpoint = "/skynet/restore"
		let fetchOpts = {
			method: "post",
			body: reqBody,
		}
		let portals = defaultPortalList
		progressiveFetch(endpoint, fetchOpts, portals).then((result: progressiveFetchResult) => {
			if (!result.success) {
				reject("could not complete upload\n" + JSON.stringify(result.logs))
			}
			result.response.json().then((j: any) => {
				resolve(j)
			})
		})
	})
}

export { validateSkyfilePath, upload }
