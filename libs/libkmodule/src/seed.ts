import { activeQuery } from "./messages.js"
import { b64ToBuf } from "libskynet"

// Define a set of helper variables that track whether the seed has been
// received by the kernel yet.
let resolveSeed: any
let getSeed = new Promise((resolve) => {
	resolveSeed = resolve
})

// handlePresentSeed will accept a seed from the kernel and unblock any method
// that is waiting for the seed.
//
// NOTE: "presentSeed" is not expected to provide a response, therefore the
// 'accept' and 'reject' inputs are omitted. This omission only applies to the
// "presentSeed" method, and therefore this is not a good example for how other
// handlers should be implemented.
function handlePresentSeed(aq: activeQuery) {
	// Decode the seed from base64 - the kernel will not provide us with
	// invalid base64 for the seed so we don't need to check the error here.
	let [u8arraySeed] = b64ToBuf(aq.callerInput.seed)
	resolveSeed(u8arraySeed)
}

export { getSeed, handlePresentSeed }
