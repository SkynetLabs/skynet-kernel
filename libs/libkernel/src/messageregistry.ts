import { callModule } from "./queries.js"
import { ed25519Keypair, errTuple } from "libskynet"

// registryRead will perform a registry read on a portal. readEntry does not
// guarantee that the latest revision has been provided, however it does
// guarantee that the provided data has a matching signature.
function registryRead(publicKey: Uint8Array, dataKey: Uint8Array): Promise<errTuple> {
	let registryModule = "AQCovesg1AXUzKXLeRzQFILbjYMKr_rvNLsNhdq5GbYb2Q"
	let data = {
		publicKey,
		dataKey,
	}
	return callModule(registryModule, "readEntry", data)
}

// registryWrite will perform a registry write on a portal.
//
// registryWrite is not considered a safe function, there are easy ways to
// misuse registryWrite such that user data will be lost. We recommend using a
// safe set of functions for writing to the registry such as getsetjson.
function registryWrite(
	keypair: ed25519Keypair,
	dataKey: Uint8Array,
	entryData: Uint8Array,
	revision: BigInt
): Promise<errTuple> {
	let registryModule = "AQCovesg1AXUzKXLeRzQFILbjYMKr_rvNLsNhdq5GbYb2Q"
	let callData = {
		publicKey: keypair.publicKey,
		secretKey: keypair.secretKey,
		dataKey,
		entryData,
		revision,
	}
	return callModule(registryModule, "writeEntry", callData)
}

export { registryRead, registryWrite }
