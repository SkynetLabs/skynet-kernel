import { init, postKernelMessage } from './init'

// testMessage will send a test message to the kernel, ensuring that basic
// kernel communications are working.
export function testMessage(): Promise<string> {
	// Retrun a promise that will resolve when a response is received from
	// the kernel.
	return new Promise((resolve, reject) => {
		// Every message should start with init. If initialization has
		// already happened, this will be a no-op that instantly
		// resolves.
		init()
		.then(x => {
			// Send a 'requestTest' message to the kernel. The
			// request test message uniquely doesn't have any other
			// parameters.
			postKernelMessage(resolve, reject, {
				kernelMethod: "requestTest",
			})
		})
		.catch(x => {
			// For some reason, the bridge is not available.
			// Likely, this means that the user has not installed
			// the browser extension.
			reject(x)
		})
	})
}
