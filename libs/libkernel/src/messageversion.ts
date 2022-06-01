import { newKernelQuery } from "./queries.js"
import { errTuple } from "libskynet"

// kernelVersion will fetch the version number of the kernel. If successful, the
// returned value will be an object containing a field 'version' with a version
// string.
function kernelVersion(): Promise<errTuple> {
	let [, query] = newKernelQuery("version", {}, false)
	return query
}

export { kernelVersion }
