import { verifyDownload } from "./apidownloadverify.js";
import { addContextToErr } from "./err.js";
import { objAsString } from "./objAsString.js";
import { parseJSON } from "./parse.js";
import { parseSkylinkBitfield } from "./skylinkBitfield.js";
import { verifyResolverLinkProofs } from "./skylinkVerifyResolver.js";
import { Err } from "./types.js";

// fileDataObj defines the fileData object that we use in
// verifyDownloadResponse to return the fileData back to the caller.
interface fileDataObj {
  fileData: Uint8Array;
  err: Err;
}

// Establish the function that verifies the result is correct.
//
// The fileDataPtr input is an empty object that verifyDownloadResponse will
// fill with the fileData. It basically allows the verify function to
// communicate back to the caller. Note that the verify function might be
// called multiple times in a row if early portals fail to retrieve the data,
// but the verify function doesn't write to the fileDataPtr until it knows that
// the download is final.
function verifyDownloadResponse(response: Response, u8Link: Uint8Array, fileDataPtr: fileDataObj): Promise<Err> {
  return new Promise((resolve) => {
    // Currently the only valid successful response for a download is a
    // 200. Anything else is unexpected and counts as an error.
    if (response.status !== 200) {
      resolve("unrecognized response status " + objAsString(response.status) + ", expecting 200");
      return;
    }

    // Break the input link into its components.
    let [version, offset, fetchSize, errBF] = parseSkylinkBitfield(u8Link);
    if (errBF !== null) {
      resolve(addContextToErr(errBF, "skylink bitfield could not be parsed"));
      return;
    }

    // If this is a resolver skylink, we need to verify the resolver
    // proofs. This conditional will update the value of 'u8Link' to be the
    // value of the fully resolved link.
    if (version === 2n) {
      // Verify the resolver proofs and update the link to the correct
      // link.
      const proofJSON = response.headers.get("skynet-proof");
      if (proofJSON === null || proofJSON === undefined) {
        resolve("response did not include resolver proofs");
        return;
      }
      const [proof, errPJ] = parseJSON(proofJSON);
      if (errPJ !== null) {
        resolve(addContextToErr(errPJ, "unable to parse resolver link proofs"));
        return;
      }
      // We need to update the u8Link in-place so that the rest of the
      // function doesn't need special handling.
      let errVRLP: string | null;
      [u8Link, errVRLP] = verifyResolverLinkProofs(u8Link, proof);
      if (errVRLP !== null) {
        resolve(addContextToErr(errVRLP, "unable to verify resolver link proofs"));
        return;
      }

      // We also need to update the parsed bitfield, because the link has
      // changed.
      [version, offset, fetchSize, errBF] = parseSkylinkBitfield(u8Link);
      if (errBF !== null) {
        resolve(addContextToErr(errBF, "fully resolved link has invalid bitfield"));
        return;
      }
      if (version !== 1n) {
        resolve("fully resolved link does not have version 1");
        return;
      }
    }

    response
      .arrayBuffer()
      .then((buf) => {
        const [fileData, portalAtFault, errVD] = verifyDownload(u8Link.slice(2, 34), offset, fetchSize, buf);
        if (errVD !== null && portalAtFault) {
          resolve("received invalid download from portal");
          return;
        }
        if (errVD !== null) {
          fileDataPtr.fileData = new Uint8Array(0);
          fileDataPtr.err = addContextToErr(errVD, "file is corrupt");
        } else {
          fileDataPtr.fileData = fileData;
          fileDataPtr.err = null;
        }
        // If the portal is not at fault, we tell progressiveFetch that
        // the download was a success. The caller will have to check
        // the fileDataPtr
        resolve(null);
      })
      .catch((err) => {
        resolve(addContextToErr(err, "unable to read response body"));
      });
  });
}

export { fileDataObj, verifyDownloadResponse };
