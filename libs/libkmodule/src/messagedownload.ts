import { callModule } from "./queries.js"
import { errTuple } from "libskynet"

// download will take a skylink and return the file data for that skylink. The
// download occurs using a kernel module that verifies the data's integrity and
// prevents the portal from lying about the download.
function download(skylink: string): Promise<errTuple> {
	let downloadModule = "AQCIaQ0P-r6FwPEDq3auCZiuH_jqrHfqRcY7TjZ136Z_Yw"
	let data = {
		skylink,
	}
	return callModule(downloadModule, "secureDownload", data)
}

export { download }
