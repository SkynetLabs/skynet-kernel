import { activeQuery } from "./messages.js"

// Define a set of helper variables that track whether the seed has been
// received by the kernel yet.
let resolveSeed: any
let seedPromise: Promise<Uint8Array> = new Promise((resolve) => {
	resolveSeed = resolve
})

// getSeed will return a promise that resolves when the seed is available.
function getSeed(): Promise<Uint8Array> {
	return seedPromise
}

// handlePresentSeed will accept a seed from the kernel and unblock any method
// that is waiting for the seed.
function handlePresentSeed(aq: activeQuery) {
	resolveSeed(aq.callerInput.seed)
}

export { getSeed, handlePresentSeed }
