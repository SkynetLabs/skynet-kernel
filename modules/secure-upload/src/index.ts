// secure-upload is a module which will upload a file to Skynet. The skylink is
// computed locally before uploading to ensure that the portal cannot modify
// the data in the middle of the upload.
//
// secure-upload will use portal-dac to determine the user's portals.

import { log, logErr } from "./lib/log";
import { encodeNumber, bufToB64 } from "./lib/encode";
import { addLeafBytesToBlake2bProofStack, blake2bProofStackRoot } from "./lib/blake2bmerkle";
import { skylinkBitfield } from "./lib/skylinks";
import { progressiveFetch } from "./lib/progressivefetch";

// TODO: Split progressiveFetch out into its own module. progressiveFetch will
// use the portals module to figure out the best portal for the user initially,
// but progressiveFetch will also later be extended to support passing in
// custom portals, which will give the upload module a chance to optimize based
// on qualities like performance or price.

// Create helper function for responding to a query with an error.
function respondErr(event: MessageEvent, err: string) {
  postMessage({
    nonce: event.data.nonce,
    method: "response",
    err,
    data: null,
  });
}

// onmessage receives messages from the kernel. The kernel will ensure the
// standard fields are all included.
onmessage = function (event) {
  // Check for known methods.
  if (event.data.method === "secureUpload") {
    handleSecureUpload(event);
    return;
  }

  // Check for 'presentSeed', which we currently ignore but it's not an
  // unrecognized method.
  if (event.data.method === "presentSeed") {
    return;
  }

  // The kernelMethod was not recognized.
  respondErr(event, "unrecognized method: " + event.data.method);
  return;
};

// handleSecureUpload will handle a call to secureUpload.
function handleSecureUpload(event: MessageEvent) {
  // Check for the two required fields: filename and fileData.
  if (!("filename" in event.data.data)) {
    respondErr(event, "missing filename from module data");
    return;
  }
  if (typeof event.data.data.filename !== "string") {
    respondErr(event, "filename is expected to be a string");
    return;
  }
  if (!("fileData" in event.data.data)) {
    respondErr(event, "missing fileData from module data");
    return;
  }
  // TODO: I don't know how to check if fileData is a Uint8Array. This is
  // important to enusre the module is byzantine fault tolerant.

  // Compute the binary version of the metadata.
  const metadataString = JSON.stringify({
    Filename: event.data.data.filename,
    Length: event.data.data.fileData.length,
  });
  const metadataBytes = new TextEncoder().encode(metadataString);

  // Compute the binary
  const layoutBytes = new Uint8Array(99);
  // Set the version.
  let offset = 0;
  layoutBytes[offset] = 1;
  offset++;
  // Set the filesize.
  const filesizeBytes = encodeNumber(event.data.data.fileData.length);
  layoutBytes.set(filesizeBytes, offset);
  offset += 8;
  // Set the metadata size.
  const mdSizeBytes = encodeNumber(metadataBytes.length);
  layoutBytes.set(mdSizeBytes, offset);
  offset += 8;
  // Skip the fanout size and fanout data+parity pieces.
  offset += 10;
  // Set the cipher type.
  offset += 7;
  layoutBytes[offset] = 1;
  offset++;
  // The rest is key data, which is deprecated.

  // Build the base sector.
  const totalSize = event.data.data.fileData.length + layoutBytes.length + metadataBytes.length;
  if (totalSize > 4194304) {
    respondErr(event, "file is too large for secure-upload, only small files supported for now");
    return;
  }
  const baseSector = new Uint8Array(4194304 + 92);
  offset = 92;
  baseSector.set(layoutBytes, offset);
  offset += layoutBytes.length;
  baseSector.set(metadataBytes, offset);
  offset += metadataBytes.length;
  baseSector.set(event.data.data.fileData, offset);

  // Compute the merkle root of the base sector
  const ps = {
    subtreeRoots: <Uint8Array[]>[],
    subtreeHeights: <number[]>[],
  };
  for (let i = 92; i < baseSector.length; i += 64) {
    const errALB = addLeafBytesToBlake2bProofStack(ps, baseSector.slice(i, i + 64));
    if (errALB !== null) {
      respondErr(event, "unable to build merkle root of file: " + errALB);
      return;
    }
  }
  const [merkleRoot, errPSR] = blake2bProofStackRoot(ps);
  if (errPSR !== null) {
    respondErr(event, "unable to finalize merkle root of file: " + errPSR);
    return;
  }

  // Compute the bitfield, given that version is 1, the offset is zero,
  // and the fetch size is at least totalSize.
  const bitfield = skylinkBitfield(totalSize);

  // Compute the skylink.
  const bLink = new Uint8Array(34);
  bLink.set(bitfield, 0);
  bLink.set(merkleRoot, 2);
  const skylink = bufToB64(bLink);

  // Create the metadata header.
  const lenPrefix1 = encodeNumber(15);
  const str1 = new TextEncoder().encode("Skyfile Backup\n");
  const lenPrefix2 = encodeNumber(7);
  const str2 = new TextEncoder().encode("v1.5.5\n");
  const lenPrefix3 = encodeNumber(46);
  const str3 = new TextEncoder().encode(skylink);
  const backupHeader = new Uint8Array(92);
  offset = 0;
  backupHeader.set(lenPrefix1, offset);
  offset += 8;
  backupHeader.set(str1, offset);
  offset += 15;
  backupHeader.set(lenPrefix2, offset);
  offset += 8;
  backupHeader.set(str2, offset);
  offset += 7;
  backupHeader.set(lenPrefix3, offset);
  offset += 8;
  backupHeader.set(str3, offset);

  // Set the first 92 bytes of the base sector to the backup header.
  baseSector.set(backupHeader, 0);

  // Do the POST request to /skynet/restore
  const fetchOpts = {
    method: "post",
    body: baseSector,
  };
  const endpoint = "/skynet/restore";
  progressiveFetch(endpoint, fetchOpts, ["siasky.net", "eu-ger-12.siasky.net", "dev1.siasky.dev"], null!, null!)
    .then((output) => {
      // We are assuming that progressiveFetch
      postMessage({
        nonce: event.data.nonce,
        method: "response",
        err: null,
        data: {
          skylink,
        },
      });
    })
    .catch((err) => {
      respondErr(event, "progressiveFetch failed: " + err);
    });
}
