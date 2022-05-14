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
function handlePresentSeed(data: any) {
	resolveSeed(data.seed)
}

export { getSeed, handlePresentSeed }
