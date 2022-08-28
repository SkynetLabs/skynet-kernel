import { deriveRegistryEntryID, taggedRegistryEntryKeys } from "../src/registry.js";
import { generateSeedPhraseDeterministic, seedPhraseToSeed } from "../src/seed.js";

test("registry", () => {
  // The fake seed needs to be 16 bytes so that taggedRegistryEntryKeys will
  // accept it as a real seed.
  const fakeSeed = new TextEncoder().encode("1234567890123456");
  const [, , errREK1] = taggedRegistryEntryKeys(fakeSeed, "", "");
  expect(errREK1).toBe(null);
  const [seedPhrase, errGSP] = generateSeedPhraseDeterministic("TestRegistry");
  expect(errGSP).toBe(null);
  const [seed, errVSP] = seedPhraseToSeed(seedPhrase);
  expect(errVSP).toBe(null);

  // Check that keypairs are deterministic.
  const [keypair2, datakey2, errREK2] = taggedRegistryEntryKeys(seed, "test-keypair", "test-datakey");
  expect(errREK2).toBe(null);
  const [keypair3, datakey3, errREK3] = taggedRegistryEntryKeys(seed, "test-keypair", "test-datakey");
  expect(errREK3).toBe(null);
  expect(datakey2).toEqual(datakey3);
  expect(keypair2).toEqual(keypair3);

  // Check that changing the keypair also changes the datakey even if the
  // datakeyTag is unchanged.
  const [keypair4, datakey4, errREK4] = taggedRegistryEntryKeys(seed, "test-keypair2", "test-datakey");
  expect(errREK4).toBe(null);
  expect(keypair3).not.toEqual(keypair4);
  expect(datakey3).not.toEqual(datakey4);

  // Check that changing the datakey doesn't change the keypair.
  const [keypair5, datakey5, errREK5] = taggedRegistryEntryKeys(seed, "test-keypair2", "test-datakey2");
  expect(errREK5).toBe(null);
  expect(keypair4).toEqual(keypair5);
  expect(datakey4).not.toEqual(datakey5);

  // Check that we can derive a registry entry id.
  const [, errDREID] = deriveRegistryEntryID(keypair5.publicKey, datakey5);
  expect(errDREID).toBe(null);
});
