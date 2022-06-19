import { ed25519Keypair } from "libskynet"

// moduleQuery defines a query that can be sent to a module. The method is used
// to tell the module what query is being made. The domain is set by the
// kernel, and is guaranteed to match the domain of the caller. The module can
// use the 'domain' to enforce access control policies. The 'data' can be any
// arbitrary object, and will depend on the method. The module developer is
// ultimately the one who decides what data should be provided as input to each
// method call.
//
// NOTE: While the kerenl does do verification for the method and domain, the
// kernel does not do any verification for the data field. The module itself is
// responsible for verifying all inputs provided in the data field.
interface moduleQuery {
	method: string
	domain: string
	data: any
}

// presentSeedData contains the data that gets sent in a 'presentSeed' call
// from the kernel. 'presentSeed' is called on the module immediately after the
// module starts up.
//
// The 'seed' is a unique seed dervied by the kernel for the module based on
// the module's domain and the seed of the user. Modules in different domains
// will have different seeds, and have no way to guess what the seeds of other
// modules are.
//
// It is safe to use the 'seed' for things like blockchain wallets.
//
// If the module has been given access to the mysky root keypair,
// presentSeedData will include the myskyRootKeypair. If the module does not
// have access to the mysky root keypair, the field will not be included. A
// module that receives the mysky root keypair has full read and write access
// to all of the user's public and private mysky files.
//
// NOTE: Using mysky for private files is considered deprecated.
interface presentSeedData {
	seed: Uint8Array
	myskyRootKeypair?: ed25519Keypair
}

export { moduleQuery, presentSeedData }
