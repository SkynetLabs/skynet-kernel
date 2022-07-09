import { callModule } from "./queries"
import { addContextToErr, error } from "libskynet"

// upload will take a filename and some file data and perform a secure upload
// to Skynet. All data is verified and the correct Skylink is returned. This
// function cannot fully guarantee that the data was pinned, but it can fully
// guarantee that the final skylink matches the data that was presented for the
// upload.
//
// The return value is a skylink and an error.
function upload(filename: string, fileData: Uint8Array): Promise<[skylink: string, err: error]> {
	return new Promise((resolve) => {
		// Build the module call.
		let uploadModule = "AQAT_a0MzOInZoJzt1CwBM2U8oQ3GIfP5yKKJu8Un-SfNg"
		let data = {
			filename,
			fileData,
		}

		// Perform the module call and extract the skylink from the result.
		callModule(uploadModule, "secureUpload", data).then(([result, err]) => {
			if (err !== null) {
				resolve(["", addContextToErr(err, "secureUpload module call failed")])
				return
			}
			resolve([result.skylink, null])
		})
	})
}

export { upload }
