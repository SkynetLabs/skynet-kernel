import { encodeU64 } from "./encoding.js";
import { SHA512_HASH_SIZE, sha512 } from "./sha512.js";

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
// Data is encrypted in-place. The optional value 'skip' allows the caller to
// specify a number of bytes to skip initially.
//
// NOTE: otpEncrypt can be useful over other encryption methods because it does
// not introduce any new dependencies. For the Skynet Kernel bootloader, the
// only cryptography present is ed25519 signatures (which includes sha512 as a
// dependency). This is a tiny piece of code that can provide encryption
// support without needing to add a full encryption library as a dependency.
//
// WARNING: otpEncrypt is not a "safe" function. It's a useful cryptographic
// primitive, but there are easy ways to misuse it and create insecure
// encryption schemes. Please avoid using this function unless you have a
// strong understanding of encryption techniques and typical encryption
// attacks.
function otpEncrypt(key: Uint8Array, data: Uint8Array, skip = 0): Uint8Array {
  // Build an array to hold the preimage for each step of encryption. We are
  // just going to be altering the final 8 bytes as we encrypt the file.
  const preimageHolder = new Uint8Array(key.length + 8);
  preimageHolder.set(key, 0);

  // Iterate over the data and encrypt each section.
  for (let i = skip; i < data.length; i += SHA512_HASH_SIZE) {
    // Set the nonce for this shard and then create the pad data. The error of
    // encodeU64 is ignored because it'll only error if the passed in data is
    // larger than 2^64 bytes, which is not likely. It was decided that the
    // tradeoff of not having to check an error every time after calling
    // otpEncrypt was worth ignoring the error here - this is an unusual
    // omission and is generally discouraged.
    const [iBytes] = encodeU64(BigInt(i));
    preimageHolder.set(iBytes, key.length);
    const keyData = sha512(preimageHolder);

    // XOR the keyData with the data. Watch for out-of-bounds on the
    // file data.
    for (let j = 0; j < keyData.length; j++) {
      if (data.length <= i + j) {
        break;
      }
      data[i + j] = data[i + j] ^ keyData[j];
    }
  }
  return data;
}

export { otpEncrypt };
