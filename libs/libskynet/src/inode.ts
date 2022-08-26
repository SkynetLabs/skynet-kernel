// inode.ts is a file with helper functions for manging inodes. An inode is the
// canonical name for a file within a filesystem. Inodes on Skynet are
// specifiers that allow you to look up a specfic file on Skynet.

import { bufToB64 } from "./encoding.js";
import { sha512 } from "./sha512.js";
import { Err } from "./types.js";

// namespaceInode is a function for namespacing inodes based on the type of
// file that is being used. Two files of different types that use this function
// will have fully non-overlapping namespaces for inodes, meaning that two
// files of different types but that have the same name will point to different
// locations on Skynet.
function namespaceInode(filetype: string, inode: string): [string, Err] {
  // We pad out the filetype to 32 characters to ensure that two different
  // filetypes can never have a filetype+inode combination that will collide.
  // If the filetype is different, the final result will definitely also be
  // different.
  if (filetype.length > 32) {
    return ["", "filetype can be at most 32 characters"];
  }
  const paddedFiletype = filetype.padEnd(32, "_");
  const hashPreimage = new TextEncoder().encode(paddedFiletype + inode);

  // We hash the result to make it smaller. Because we use this as an
  // encryption key and not for authentication, our security model only
  // requires 16 bits of entropy. We therefore only take the first 16 bytes
  // of the hash and return the base64 encoded string.
  const fullHash = sha512(hashPreimage);
  const quarterHash = fullHash.slice(0, 16);
  const b64 = bufToB64(quarterHash);
  return [b64, null];
}

export { namespaceInode };
