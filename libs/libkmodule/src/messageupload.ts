import { callModule } from "./queries.js"
import { errTuple } from "libskynet"

// upload will take a filename and some file data and perform a secure upload
// to Skynet. All data is verified and the correct Skylink is returned. This
// function cannot fully guarantee that the data was pinned, but it can fully
// guarantee that the final skylink matches the data that was presented for the
// upload.
function upload(filename: string, fileData: Uint8Array): Promise<errTuple> {
	let uploadModule = "AQAT_a0MzOInZoJzt1CwBM2U8oQ3GIfP5yKKJu8Un-SfNg"
	let data = {
		filename,
		fileData,
	}
	return callModule(uploadModule, "secureUpload", data)
}

export { upload }
