import { init, newKernelQuery } from "./init.js"

// download will take a skylink and return the fileData for that skylink.
//
// NOTE: download currently only supports downloading files that fully fit into
// the base sector.
function download(skylink: string): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		init()
			.then(() => {
				let [, query] = newKernelQuery(
					{
						method: "moduleCall",
						data: {
							module: "AQCIaQ0P-r6FwPEDq3auCZiuH_jqrHfqRcY7TjZ136Z_Yw",
							method: "secureDownload",
							data: {
								skylink,
							},
						},
					},
					null as any
				)
				query
					.then((response) => {
						resolve(response.fileData)
					})
					.catch((err) => {
						reject(err)
					})
			})
			.catch((err) => {
				reject(err)
			})
	})
}

export { download }
