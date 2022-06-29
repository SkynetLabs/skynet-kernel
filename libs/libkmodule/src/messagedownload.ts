import { callModule } from "./queries.js"
import { addContextToErr, error } from "libskynet"

// download will take a skylink and return the file data for that skylink. The
// download occurs using a kernel module that verifies the data's integrity and
// prevents the portal from lying about the download.
function download(skylink: string): Promise<[fileData: Uint8Array, err: error]> {
	return new Promise((resolve) => {
		// Construct the module call.
		let downloadModule = "AQCIaQ0P-r6FwPEDq3auCZiuH_jqrHfqRcY7TjZ136Z_Yw"
		let data = {
			skylink,
		}

		// Perform the module call and extract the fileData from the result.
		callModule(downloadModule, "secureDownload", data).then(([result, err]) => {
			if (err !== null) {
				resolve([new Uint8Array(0), addContextToErr(err, "secureDownload module call failed")])
				return
			}
			resolve([result.fileData, null])
		})
	})
}

export { download }
