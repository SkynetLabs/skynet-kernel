import { callModule } from "./queries.js";
import { addContextToErr, Err } from "libskynet";

// download will take a skylink and return the file data for that skylink. The
// download occurs using a kernel module that verifies the data's integrity and
// prevents the portal from lying about the download.
function download(skylink: string): Promise<[Uint8Array, Err]> {
  return new Promise((resolve) => {
    const downloadModule = "AQCIaQ0P-r6FwPEDq3auCZiuH_jqrHfqRcY7TjZ136Z_Yw";
    const data = {
      skylink,
    };
    callModule(downloadModule, "secureDownload", data).then(([result, err]) => {
      // Pull the fileData out of the result.
      if (err !== null) {
        resolve([new Uint8Array(0), addContextToErr(err, "unable to complete download")]);
        return;
      }
      resolve([result.fileData, null]);
    });
  });
}

export { download };
