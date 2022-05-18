import { init, newKernelQuery } from "./init.js"

// upload will take a filename and some file data and perform a secure upload
// to Skynet. Secure in this case means that all data is verified before being
// uploaded - the portal cannot lie about the skylink that it returns after
// uploading the data.
//
// NOTE: The largest allowed file is currently slightly less than 4 MiB
// (roughly 500 bytes less)
function upload(filename: string, fileData: Uint8Array): Promise<string> {
	return new Promise((resolve, reject) => {
		init()
			.then(() => {
				let [, query] = newKernelQuery(
					{
						method: "moduleCall",
						data: {
							module: "AQAT_a0MzOInZoJzt1CwBM2U8oQ3GIfP5yKKJu8Un-SfNg",
							method: "secureUpload",
							data: {
								filename,
								fileData,
							},
						},
					},
					null as any
				)
				query
					.then((response) => {
						resolve(response.skylink)
					})
					.catch((err) => {
						reject(err)
					})
			})
			.catch((x) => {
				reject(x)
			})
	})
}

export { upload }
