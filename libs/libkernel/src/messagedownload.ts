import { callModule } from "./queries.js"
import { errTuple } from "libskynet"

// download will take a skylink and return the file data for that skylink.
function download(skylink: string): Promise<errTuple> {
	let downloadModule = "AQCIaQ0P-r6FwPEDq3auCZiuH_jqrHfqRcY7TjZ136Z_Yw"
	let data = {
		skylink,
	}
	return callModule(downloadModule, "secureDownload", data)
}

export { download }
