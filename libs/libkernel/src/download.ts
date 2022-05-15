import { addContextToErr, composeErr } from "./err.js"
import { init, newKernelQuery } from "./init.js"
import { logErr } from "./log.js"

/**
 * download will take a skylink and return the fileData for that skylink.
 *
 * @remarks
 * download currently only supports downloading files that fully fit into
 * the base sector.
 *
 * @param skylink Skylink to be downloaded
 * @returns Promise that resolves to the binary fileData
 *
 * @example
 * ```ts
 * download('AQC5gTfpTI-4DV9C5_k7VDTuXa5_DVbGsNbf4FG2SkCBpg')
 * 	.then( (data)=>{ console.log(data) } )
 * 	.catch( (error) => { console.error(error) });
 * ```
 *
 * @public
 */
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
