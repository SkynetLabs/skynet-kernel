import { init, getNonce, queries } from './init'

// kernelRequestTest will send a message to the bridge asking for a kernel
// test.
export function testMessage() {
	let blockForBridge = init()

	return new Promise((resolve, reject) => {
		blockForBridge
		.then(x => {
			let nonce = getNonce()
			queries[nonce] = {resolve, reject}
			window.postMessage({
				method: "kernelMessage",
				nonce,
				kernelMessage: {
					kernelMethod: "requestTest",
				},
			}, window.location.origin)
		})
		.catch(x => {
			reject(x)
		})
	})
}
