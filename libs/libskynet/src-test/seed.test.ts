import { dictionary } from "../src/dictionary.js";
import { Ed25519Keypair, ed25519KeypairFromEntropy, ed25519Sign, ed25519Verify } from "../src/ed25519.js";
import { bufToHex, bufToB64, decodeU64, encodeU64 } from "../src/encoding.js";
import { objAsString } from "../src/objAsString.js";
import {
  deriveMyskyRootKeypair,
  generateSeedPhraseDeterministic,
  seedPhraseToSeed,
  validSeedPhrase,
} from "../src/seed.js";
import { sha512 } from "../src/sha512.js";

test("generateSeedPhraseDeterministic", () => {
  // Generate three seed phrases, two matching and one not matching. Make sure
  // they match and don't match as expected.
  let [phraseTestInput, err3] = generateSeedPhraseDeterministic("Test");
  let [phraseTestInput2, err4] = generateSeedPhraseDeterministic("Test");
  let [phraseTestInput3, err5] = generateSeedPhraseDeterministic("Test2");
  expect(err3).toBe(null);
  expect(err4).toBe(null);
  expect(err5).toBe(null);
  expect(phraseTestInput).toBe(phraseTestInput2);
  expect(phraseTestInput).not.toBe(phraseTestInput3);

  // Check that both seed phrases are valid.
  let errVSP1 = validSeedPhrase(phraseTestInput);
  let errVSP2 = validSeedPhrase(phraseTestInput3);
  expect(errVSP1).toBe(null);
  expect(errVSP2).toBe(null);

  // Check that the generated seeds follow the 13th word rule, which is that
  // the 13th word must always be from the first 256 entries in the dictionary
  // (this keeps the final 2 bits clear)
  for (let i = 0; i < 128; i++) {
    let [phrase, err] = generateSeedPhraseDeterministic(i.toString());
    expect(err).toBe(null);

    let found = false;
    let words = phrase.split(" ");
    for (let j = 0; j < 256; j++) {
      if (words[12] === dictionary[j]) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  }
});

// TestMyskyEquivalence is a test that checks that the way libskynet derives
// the mysky seed for a user matches the code that derived a mysky seed for a
// user in skynet-mysky. Following the test are some unique dependencies so
// that the simulated mysky derivation is as close to the original code as
// possible.
import nacl from "tweetnacl";
const SALT_ROOT_DISCOVERABLE_KEY = "root discoverable key";
function genKeyPairFromSeed(seed: Uint8Array) {
  const hash = hashWithSalt(seed, SALT_ROOT_DISCOVERABLE_KEY);
  return genKeyPairFromHash(hash);
}
function hashWithSalt(message: Uint8Array, salt: string): Uint8Array {
  return s512(new Uint8Array([...s512(salt), ...s512(message)]));
}
function s512(message: Uint8Array | string): Uint8Array {
  if (typeof message === "string") {
    return nacl.hash(stringToUint8ArrayUtf8(message));
  }
  return nacl.hash(message);
}
function stringToUint8ArrayUtf8(str: string) {
  return Uint8Array.from(Buffer.from(str, "utf-8"));
}
function genKeyPairFromHash(hash: Uint8Array) {
  const hashBytes = hash.slice(0, 32);
  const { publicKey, secretKey } = nacl.sign.keyPair.fromSeed(hashBytes);
  return [publicKey, secretKey];
}
test("myskyEquivalence", () => {
  // Get a seed.
  let [seedPhrase, errGSPD] = generateSeedPhraseDeterministic("test-for-mysky");
  expect(errGSPD).toBe(null);
  let [seed, errVSP] = seedPhraseToSeed(seedPhrase);
  expect(errVSP).toBe(null);

  let [pkOld, skOld] = genKeyPairFromSeed(seed);
  let keypair = deriveMyskyRootKeypair(seed);
  expect(pkOld.length).toBe(keypair.publicKey.length);
  for (let i = 0; i < pkOld.length; i++) {
    expect(pkOld[i]).toBe(keypair.publicKey[i]);
  }
  expect(skOld.length).toBe(keypair.secretKey.length);
  for (let i = 0; i < skOld.length; i++) {
    expect(skOld[i]).toBe(keypair.secretKey[i]);
  }
});
