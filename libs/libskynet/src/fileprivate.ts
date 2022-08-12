import { decodeU64, encodeU64 } from "./encoding.js";
import { otpEncrypt } from "./encrypt.js";
import { addContextToErr } from "./err.js";
import { parseJSON } from "./parse.js";
import { sha512 } from "./sha512.js";
import { jsonStringify } from "./stringifyjson.js";
import { Err } from "./types.js";

// decryptFileSmall will decrypt a file that was encrypted by encryptFileSmall.
// The input is the seed, the inode, and the encrypted data. The output will be
// the metadata and the filedata. The metadata will be presented as an object.
//
// There is no support for partial decryption, the whole file must be decrypted
// all at once.
function decryptFileSmall(
  seed: Uint8Array,
  inode: string,
  fullDataOrig: Uint8Array
): [metadata: any, fileData: Uint8Array, err: Err] {
  // Make a copy of the fullData so that we don't modify our inputs.
  const fullData = new Uint8Array(fullDataOrig);

  // Create the encryption key.
  const truncHash = fullData.slice(0, 16);
  const encryptionTag = new TextEncoder().encode(":encryptionTag:" + inode);
  const keyPreimage = new Uint8Array(seed.length + truncHash.length + encryptionTag.length);
  keyPreimage.set(seed, 0);
  keyPreimage.set(truncHash, seed.length);
  keyPreimage.set(encryptionTag, seed.length + truncHash.length);
  const encryptionKey = sha512(keyPreimage).slice(0, 16);

  // Perform the decryption. otpEncrypt is just a fancy XOR, so it can be
  // called for decryption.
  otpEncrypt(encryptionKey, fullData, 16);

  // Verify that the decryption was correct. We can verify it by hashing the
  // decrypted data and comparing it to the truncHash.
  const verify = sha512(fullData.slice(16, fullData.length));
  for (let i = 0; i < 16; i++) {
    if (verify[i] !== truncHash[i]) {
      return [{}, new Uint8Array(0), "decryption key appears to be incorrect"];
    }
  }

  // Pull out the length prefixes for the metadata and data.
  const [metadataBI, errDU641] = decodeU64(fullData.slice(24, 32));
  if (errDU641 !== null) {
    return [{}, new Uint8Array(0), addContextToErr(errDU641, "unable to decode metadata length")];
  }
  const metadataLen = Number(metadataBI);
  const [fileDataBI, errDU642] = decodeU64(fullData.slice(32, 40));
  if (errDU642 !== null) {
    return [{}, new Uint8Array(0), addContextToErr(errDU642, "unable to decode file data length")];
  }
  const fileDataLen = Number(fileDataBI);

  // Parse the metadata into an object. Note that parseJSON will read all
  // incoming numbers as bigints.
  const metadataBytes = fullData.slice(40, 40 + metadataLen);
  const metadataStr = new TextDecoder().decode(metadataBytes);
  const [metadata, errPJ] = parseJSON(metadataStr);
  if (errPJ !== null) {
    return [{}, new Uint8Array(0), addContextToErr(errPJ, "unable to parse metadata")];
  }

  // Extract the fileData and return
  const fileData = fullData.slice(40 + metadataLen, 40 + metadataLen + fileDataLen);
  return [metadata, fileData, null];
}

// encryptFileSmall takes a seed, an inode, a revision number, the file
// metadata, and the filedata and then produces an encrypted bundle that
// contains all of the information. The output is a securely encrypted file
// that is protected from a wide variety of privacy attacks. This is meant for
// small files: every update to a file encrypted using this scheme will need to
// re-write the full file, and there is no support for partial decryption.
//
// The revision number is part of the encryption key derivation. This is useful
// because it means a user can frequently update a file, and an attacker cannot
// tell if a user has reverted a file to a previous state. This type of
// protection is particularly important for metadata encryption, as metadata
// often updates in predicatable ways.
//
// encryptFile will also pad the file out by up to 10%, padding the file to a
// standard boundary determined by 'getPaddedFileSize'. This protects the user
// against attacks which learn information based on the size of files.
//
// There is an optional argument 'minFullSize' which can be provided to ensure
// a padded file does not shrink between versions. This is important for files
// that may be close to a padding boundary (for example, files that are around
// 4000 bytes) - if you are close to a padding boundary, you may oscillate
// between file sizes in a way that leaks information to an attacker. By
// providing a minimum size (the largest size the file has ever been is what we
// recommend), you protect against oscillations and avoid leaking information
// to an attacker.
//
// It is recommended that the metadata contain a filename, and the filename
// does not need to match the inode string.
//
// The file will be able to be decrypted by providing the encrypted data, the
// seed, and the inode.
//
// NOTE: All numbers in the metadata will be decoded as BigInts.
function encryptFileSmall(
  seed: Uint8Array,
  inode: string,
  revision: bigint,
  metadata: any,
  fileData: Uint8Array,
  minFullSize?: bigint
): [encryptedData: Uint8Array, err: Err] {
  // Get a json encoding of the metadata. We need to know the size of the
  // metadata before allocating the full data for the file.
  const [metadataStr, errJS] = jsonStringify(metadata);
  if (errJS !== null) {
    return [new Uint8Array(0), addContextToErr(errJS, "unable to stringify the metadata")];
  }
  const metadataBytes = new TextEncoder().encode(metadataStr);

  // Establish the size of the raw file. There's 16 bytes for the hash of the
  // data, then 8 bytes to establish the length of the metadata, then 8 bytes
  // to establish the length of the file data, then the metadata itself, then
  // the file data itself.
  //
  // The hash includes the revision, the two length prefixes, all of the
  // metadataBytes and the file data bytes as well.
  //
  // The hash only needs to be 16 bytes because we don't need collision
  // resistance. A collision is only possible to create by someone who knows
  // the secret that will be used with the hash to create the encryption key,
  // and if they know the secret they can decrypt the full file anyway.
  const rawSize = BigInt(16 + 8 + 8 + 8 + metadataBytes.length + fileData.length);

  // Get the padded size of the file and create the full data array. If a
  // minFullSize has been passed in by the caller, ensure that the fullData
  // is at least as large as the minFullSize.
  let paddedSize = getPaddedFileSize(rawSize);
  if (minFullSize !== undefined && paddedSize < minFullSize) {
    paddedSize = getPaddedFileSize(minFullSize);
  }
  const fullData = new Uint8Array(Number(paddedSize));

  // Create the prefixes that we need for the full data. This includes the
  // revision number, because the revision number is used as an extra step of
  // protection for the user. If the user updates their file to a new
  // version, then switches back to an old version of the file, an onlooker
  // will not be able to determine that the file has been reverted to a prior
  // state.
  const [encodedRevision, errEU643] = encodeU64(revision);
  if (errEU643 !== null) {
    return [new Uint8Array(), addContextToErr(errEU643, "unable to encode revision number")];
  }
  const [encodedMetadataSize, errEU642] = encodeU64(BigInt(metadataBytes.length));
  if (errEU642 !== null) {
    return [new Uint8Array(), addContextToErr(errEU642, "unable to encode metadata size")];
  }
  const [encodedFileSize, errEU641] = encodeU64(BigInt(fileData.length));
  if (errEU641 !== null) {
    return [new Uint8Array(), addContextToErr(errEU641, "unable to encode file data size")];
  }

  // Fill out the fullData so that it can be hashed.
  fullData.set(encodedRevision, 16);
  fullData.set(encodedMetadataSize, 24);
  fullData.set(encodedFileSize, 32);
  fullData.set(metadataBytes, 40);
  fullData.set(fileData, 40 + metadataBytes.length);

  // Get the hash of the full data and set it in the metadata.
  const fullHash = sha512(fullData.slice(16, fullData.length));
  const truncHash = fullHash.slice(0, 16);
  fullData.set(truncHash, 0);

  // Create the encryption key. We need to use the seed, the inode, and the
  // truncHash. The truncHash includes the revision thus the revision will
  // change the encryption key. Similarly, any change to the metadata or file
  // data will also change the encryption key.
  const encryptionTag = new TextEncoder().encode(":encryptionTag:" + inode);
  const keyPreimage = new Uint8Array(seed.length + truncHash.length + encryptionTag.length);
  keyPreimage.set(seed, 0);
  keyPreimage.set(truncHash, seed.length);
  keyPreimage.set(encryptionTag, seed.length + truncHash.length);
  const encryptionKey = sha512(keyPreimage).slice(0, 16);

  // Encrypt the file. Don't encrypt the truncHash, which needs to be visible
  // to decrypt the file. The truncHash is just random data, and is not
  // useful without the seed, and therefore is safe to leave as-is.
  otpEncrypt(encryptionKey, fullData, 16);

  // Return the encrypted data.
  return [fullData, null];
}

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
function getPaddedFileSize(originalSize: bigint): bigint {
  // Determine the rounding factor.
  let blockSize = 4096n;
  let largestAllowed = 1024n * 80n;
  while (largestAllowed < originalSize) {
    largestAllowed *= 2n;
    blockSize *= 2n;
  }

  // Perform the rounding.
  let finalSize = blockSize;
  while (finalSize < originalSize) {
    finalSize += blockSize;
  }
  return finalSize;
}

export { decryptFileSmall, encryptFileSmall, getPaddedFileSize };
