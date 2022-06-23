import { addContextToErr, addHandler, activeQuery, handleMessage } from "libkmodule"
import { dataFn, ed25519Keypair, ed25519Sign, ed25519Verify, error } from "libskynet"

// Track any errors that come up during execution. This is non-standard, most
// modules will not need to do this.
let errors: string[] = []

// Establish a promise to receive the mysky root.
let myskyRootKeypairResolve: dataFn
let myskyRootKeypairPromise: Promise<[ed25519Keypair, error]> = new Promise((resolve) => {
	myskyRootKeypairResolve = resolve
})

// Establish 'onmessage' for the worker, we'll just be using the libkmodule
// method 'handleMessage' nakedly.
onmessage = function (event: MessageEvent) {
	// Have a special handler to look for the mysky root - this handler is not
	// provided by libkmodule by default. Check the presentSeed message for the
	// myskyRootKeypair, otherwise just let the message pass through to
	// handleMessage so that everything else can be handled as well.
	if (event.data.method === "presentSeed") {
		if (event.data.data.myskyRootKeypair === undefined) {
			myskyRootKeypairResolve([{}, "did not receive the myskyRootKeypair"])
			errors.push("did not receive myskyRootKeypair")
		} else {
			myskyRootKeypairResolve([event.data.data.myskyRootKeypair, null])
		}
	}
	handleMessage(event)
}

// handleConfirmMyskyRoot is a function that will confirm it has received the
// mysky root.
//
// NOTE: Because this module receives the mysky root, we have to be careful not
// to reveal that root as other untrusted modules can call this module.
function handleConfirmMyskyRoot(aq: activeQuery) {
	myskyRootKeypairPromise.then(([keypair, err]) => {
		// Check that the keypair was recovered without error.
		if (err !== null) {
			aq.reject(addContextToErr(err, "did not get the mysky root keypair"))
			errors.push(err)
			return
		}

		// Try doing a sign and verify with the keypair.
		let msg = new TextEncoder().encode("test msg")
		let [sig, errSign] = ed25519Sign(msg, keypair.secretKey)
		if (errSign !== null) {
			aq.reject(addContextToErr(errSign, "could not sign a message with the keypair"))
			errors.push("could not sign keypair")
			return
		}
		if (ed25519Verify(msg, sig, keypair.publicKey) !== true) {
			aq.reject("signature verification failed")
			errors.push("signature verifiaction failed")
			return
		}

		// Establish that the myksy root is a working key. We can't really do
		// more than that in this test, we just want to make sure the kernel is
		// getting a key.
		aq.respond("success, we appear to have a real keypair")
	})
}
addHandler("confirmMyskyRoot", handleConfirmMyskyRoot)

// handleViewErrors exposes the errors object that accumulates all the errors
// the module finds throughout testing.
function handleViewErrors(aq: activeQuery) {
	aq.respond({ errors })
}
addHandler("viewErrors", handleViewErrors)
