import { newKernelQuery } from "./queries.js"
import { Err } from "libskynet"

// kernelVersion will fetch the version number of the kernel. If successful,
// the returned value will be an object containing a field 'version' with a
// version string, and a 'distribtion' field with a string that states the
// distribution of the kernel".
function kernelVersion(): Promise<[string, string, Err]> {
	return new Promise((resolve) => {
		let [, query] = newKernelQuery("version", {}, false)
		query.then(([result, err]) => {
			if (err !== null) {
				resolve(["", "", err])
				return
			}
			resolve([result.version, result.distribution, err])
		})
	})
}

export { kernelVersion }
