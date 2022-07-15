import { dictionary } from "../src/dictionary";
import { Ed25519Keypair, ed25519KeypairFromEntropy, ed25519Sign, ed25519Verify } from "../src/ed25519";
import { bufToHex, bufToB64, decodeU64, encodeU64 } from "../src/encoding";
import { objAsString } from "../src/objAsString";
import { generateSeedPhraseDeterministic, validSeedPhrase } from "../src/seed";
import { sha512 } from "../src/sha512";

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
