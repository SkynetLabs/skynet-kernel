import { encodeU64 } from "./encoding.js"
import { sha512, sha512HashSize } from "./sha512.js"

// otpEncrypt takes a key and some data and encrypts the data with the key. The
// encryption happens by generating a sequence of bytes using sha512 hashes and
// then xor'ing those bytes with the data. This gives otpEncrypt similar
// security properties to a one-time-pad - which means that the same key cannot
// be used twice!
//
// It also means that there is no authentication on the data, and that an
// attacker could flip bits undetected if an authentication layer is not added
// on top.
//
// Data is encrypted in-place.
//
// NOTE: otpEncrypt can be useful over other encryption methods because it does
// not introduce any new dependencies. For the Skynet Kernel bootloader, the
// only cryptography present is ed25519 signatures (which includes sha512 as a
// dependency). This is a tiny piece of code that can provide encryption
// support without needing to add a full encryption library as a dependency.
function otpEncrypt(key: Uint8Array, data: Uint8Array): void {
	// Build an array to hold the preimage for each step of encryption. We are
	// just going to be altering the final 8 bytes as we encrypt the file.
	let preimageHolder = new Uint8Array(key.length + 8)
	preimageHolder.set(key, 0)

	// Iterate over the data and encrypt each section.
	let hashes = 0
	for (let i = 0; i < data.length; i += sha512HashSize) {
		// Set the nonce for this shard and then create the pad data.
		let [iBytes, ] = encodeU64(BigInt(i))
		preimageHolder.set(iBytes, key.length)
		let keyData = sha512(preimageHolder)
		hashes++

		// XOR the keyData with the data. Watch for out-of-bounds on the
		// file data.
		for (let j = 0; j < keyData.length; j++) {
			if (data.length <= i+j) {
				break
			}
			data[i+j] = data[i+j] ^ keyData[j]
		}
	}
}

export { otpEncrypt }
