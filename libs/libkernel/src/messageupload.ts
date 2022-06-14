import { callModule } from "./queries.js"
import { addContextToErr, error } from "libskynet"

// upload will take a filename and some file data and perform a secure upload
// to Skynet. All data is verified and the correct Skylink is returned. This
// function cannot fully guarantee that the data was pinned, but it can fully
// guarantee that the final skylink matches the data that was presented for the
// upload.
function upload(filename: string, fileData: Uint8Array): Promise<[string, error]> {
	return new Promise((resolve) => {
		// Prepare the module call.
		let uploadModule = "AQAT_a0MzOInZoJzt1CwBM2U8oQ3GIfP5yKKJu8Un-SfNg"
		let data = {
			filename,
			fileData,
		}
		callModule(uploadModule, "secureUpload", data).then(([result, err]) => {
			// Pull the skylink out of the result.
			if (err !== null) {
				resolve(["", addContextToErr(err, "uable to complete upload")])
				return
			}
			resolve([result.skylink, null])
		})
	})
}

export { upload }
