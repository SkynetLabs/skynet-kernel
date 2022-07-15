import { bufToB64 } from "./encoding.js"
import { sha512 } from "./sha512.js"
import { Err } from "./types.js"

// namespaceInode is a function for namespacing inodes based on the type of
// file that is being used, this way a file that is created using
// 'createIndependentFileSmall' will not accidentally be read by
// 'openIndependentFile' - it can only be opened by 'openIndependentFileSmall'
// as the two functions with the same inode will actually reference different
// files on Skynet.
function namespaceInode(filetype: string, inode: string): [string, Err] {
	// We pad out the filetype to 32 characters to ensure that two different
	// filetypes can never have a filetype+inode combination that will collide.
	// If the filetype is different, the final result will definitely also be
	// different.
	if (filetype.length > 32) {
		return ["", "filetype can be at most 32 characters"]
	}
	while (filetype.length < 32) {
		filetype += "_"
	}
	// Add the inode to the extended filetype.
	filetype += inode

	// We hash the result to make it smaller. Because we use this as an
	// encryption key and not for authentication, our security model only
	// requires 16 bits of entropy. We therefore only take the first 16 bytes
	// of the hash and return the base64 encoded string.
	const fullHash = sha512(new TextEncoder().encode(filetype + inode))
	const quarterHash = fullHash.slice(0, 16)
	const b64 = bufToB64(quarterHash)
	return [b64, null]
}

export { namespaceInode }
