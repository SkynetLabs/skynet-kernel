import { init, newKernelQuery } from "./queries.js"
import { errTuple } from "libskynet"

// testMessage will send a test message to the kernel. If successful, the
// returned value will be an object containing a field 'version' with a version
// string.
function testMessage(): Promise<errTuple> {
	return new Promise((resolve) => {
		init().then(() => {
			let [, query] = newKernelQuery("test", {}, false)
			query.then((et: errTuple) => {
				resolve(et)
			})
		})
	})
}

export { testMessage }
