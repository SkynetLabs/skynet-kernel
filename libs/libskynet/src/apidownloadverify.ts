import { decodeU64 } from "./encoding.js";
import { addContextToErr } from "./err.js";
import { blake2bVerifySectorRangeProof } from "./merkle.js";

// Helper consts to make it easier to return empty values in the event of an
// error.
const nu8 = new Uint8Array(0);

// verifyDownload will verify a download response from a portal. The input is
// essentially components of a skylink - the offset, length, and merkle root.
// The output is the raw file data.
//
// The 'buf' input should match the standard response body of a verified
// download request to a portal, which is the skylink raw data followed by a
// merkle proof. The offset and length provided as input indicate the offset
// and length of the skylink raw data - not the offset and length of the
// request within the file (that would be a different set of params).
//
// The skylink raw data itself breaks down into a metadata component and a file
// component. The metadata component will contain information like the length
// of the real file, and any fanout structure for large files. The first step
// we need to take is verifying the Merkel proof, which will appear at the end
// of the buffer. We'll have to hash the data we received and then compare it
// against the Merkle proof and ensure it matches the data we are expecting.
// Then we'll have to look at the layout to figure out which pieces of the data
// are the full file, while also checking for corruption as the file can be
// malicious independent of the portal operator.
//
// As long as the Merkle proof matches the root, offset, and length that we
// have as input, the portal is considered non-malicious. Any additional errors
// we find after that can be considered malice or incompetence on the part of
// the person who uploaded the file.
function verifyDownload(
  root: Uint8Array,
  offset: bigint,
  fetchSize: bigint,
  buf: ArrayBuffer
): [fileData: Uint8Array, portalAtFault: boolean, err: string | null] {
  const u8 = new Uint8Array(buf);
  // Input checking. If any of this is incorrect, its safe to blame the
  // server because the skylink format fundamentally should enable these
  // to be correct.
  if (u8.length < fetchSize) {
    return [nu8, true, "provided data is not large enough to cover fetchSize"];
  }
  if (u8.length < 99) {
    return [nu8, true, "provided data is not large enough to contain a skyfile"];
  }

  // Grab the skylinkData and Merkle proof from the array, and then
  // verify the Merkle proof.
  const skylinkData = u8.slice(0, Number(fetchSize));
  const merkleProof = u8.slice(Number(fetchSize), u8.length);
  const errVBSRP = blake2bVerifySectorRangeProof(root, skylinkData, offset, fetchSize, merkleProof);
  if (errVBSRP !== null) {
    return [nu8, true, addContextToErr(errVBSRP, "provided Merkle proof is not valid")];
  }

  // Up until this point, an error indicated that the portal was at fault for
  // either returning the wrong data or otherwise providing a malformed
  // repsonse. The remaining checks relate to the consistency of the file
  // itself, if the file is corrupt but the hash matches, there will be an
  // error and the portal will not be at fault.

  // The organization of the skylinkData is always:
  // 	layoutBytes || fanoutBytes || metadataBytes || fileBytes
  //
  // The layout is always exactly 99 bytes. Bytes [1,8] of the layout
  // contain the exact size of the fileBytes. Bytes [9, 16] of the layout
  // contain the exact size of the metadata. And bytes [17,24] of the
  // layout contain the exact size of the fanout. To get the offset of
  // the fileData, we need to extract the sizes of the metadata and
  // fanout, and then add those values to 99 to get the fileData offset.
  const fileSizeBytes = skylinkData.slice(1, 9);
  const mdSizeBytes = skylinkData.slice(9, 17);
  const fanoutSizeBytes = skylinkData.slice(17, 25);
  const [fileSize, errFSDN] = decodeU64(fileSizeBytes);
  if (errFSDN !== null) {
    return [nu8, false, addContextToErr(errFSDN, "unable to decode filesize")];
  }
  const [mdSize, errMDDN] = decodeU64(mdSizeBytes);
  if (errMDDN !== null) {
    return [nu8, false, addContextToErr(errMDDN, "unable to decode metadata size")];
  }
  const [fanoutSize, errFODN] = decodeU64(fanoutSizeBytes);
  if (errFODN !== null) {
    return [nu8, false, addContextToErr(errFODN, "unable to decode fanout size")];
  }
  if (BigInt(skylinkData.length) < 99n + fileSize + mdSize + fanoutSize) {
    return [nu8, false, "provided data is too short to contain the full skyfile"];
  }
  const fileData = skylinkData.slice(Number(99n + mdSize + fanoutSize), Number(99n + mdSize + fanoutSize + fileSize));
  return [fileData, false, null];
}

export { verifyDownload };
