import { error } from "./types.js"

// namespaceInode is a function for namespacing inodes based on the type of
// file that is being used, this way a file that is created using
// 'createIndependentFileSmall' will not accidentally be read by
// 'openIndependentFile' - it can only be opened by 'openIndependentFileSmall'
// as the two functions with the same inode will actually reference different
// files on Skynet.
//
// No cryptography is needed here, the inodes don't get exposed publicly.
function namespaceInode(filetype: string, inode: string): [string, error] {
	if (filetype.length > 32) {
		return ["", "filetype can be at most 32 characters"]
	}
	while (filetype.length < 32) {
		filetype += " "
	}
	return [filetype + inode, null]
}

export { namespaceInode }
