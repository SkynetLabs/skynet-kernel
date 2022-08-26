import { verifyDownloadResponse } from "./apidownloadverifyresponse.js";
import { progressiveFetch, progressiveFetchResult } from "./apiprogressivefetch.js";
import { defaultPortalList } from "./apidefaultportals.js";
import { addContextToErr } from "./err.js";
import { b64ToBuf } from "./encoding.js";
import { objAsString } from "./objAsString.js";
import { validateSkylink } from "./skylinkValidate.js";
import { Err } from "./types.js";

// downloadSkylink will download the provided skylink.
function downloadSkylink(skylink: string): Promise<[data: Uint8Array, err: Err]> {
  return new Promise((resolve) => {
    // Get the Uint8Array of the input skylink.
    const [u8Link, errBTB] = b64ToBuf(skylink);
    if (errBTB !== null) {
      resolve([new Uint8Array(0), addContextToErr(errBTB, "unable to decode skylink")]);
      return;
    }
    const errVS = validateSkylink(u8Link);
    if (errVS !== null) {
      resolve([new Uint8Array(0), addContextToErr(errVS, "skylink is invalid")]);
      return;
    }

    // Prepare the download call.
    const endpoint = "/skynet/trustless/basesector/" + skylink;
    const fileDataPtr = { fileData: new Uint8Array(0), err: null };
    const verifyFunction = function (response: Response): Promise<Err> {
      return verifyDownloadResponse(response, u8Link, fileDataPtr);
    };

    // Perform the download call.
    progressiveFetch(endpoint, null, defaultPortalList, verifyFunction).then((result: progressiveFetchResult) => {
      // Return an error if the call failed.
      if (result.success !== true) {
        // Check for a 404.
        for (let i = 0; i < result.responsesFailed.length; i++) {
          if (result.responsesFailed[i].status === 404) {
            resolve([new Uint8Array(0), "404"]);
            return;
          }
        }

        // Error is not a 404, return the logs as the error.
        const err = objAsString(result.logs);
        resolve([new Uint8Array(0), addContextToErr(err, "unable to complete download")]);
        return;
      }
      // Check if the portal is honest but the download is corrupt.
      if (fileDataPtr.err !== null) {
        resolve([new Uint8Array(0), addContextToErr(fileDataPtr.err, "download is corrupt")]);
        return;
      }
      resolve([fileDataPtr.fileData, null]);
    });
  });
}

export { downloadSkylink };
