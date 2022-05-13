// Define a set of helper variables that track whether the seed has been
// received by the kernel yet.
let resolveSeed: any
let getSeed = new Promise((resolve) => {
	resolveSeed = resolve
})

// handlePresentSeed will accept a seed from the kernel and unblock any method
// that is waiting for the seed.
function handlePresentSeed(data: any) {
	resolveSeed(data.seed)
}

export { getSeed, handlePresentSeed }
