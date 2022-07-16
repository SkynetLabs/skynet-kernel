test("registry", () => {
  let [, , errREK1] = taggedRegistryEntryKeys(new TextEncoder().encode("not a seed"), "", "");
  expect(errREK1).toBe(null);
  let [seedPhrase, errGSP] = generateSeedPhraseDeterministic("TestRegistry");
  expect(errGSP).toBe(null);
  let [seed, errVSP] = validSeedPhrase(seedPhrase);
  expect(errVSP).toBe(null);

  // Check that keypairs are deterministic.
  let [keypair2, datakey2, errREK2] = taggedRegistryEntryKeys(seed, "test-keypair", "test-datakey");
  expect(errREK2).toBe(null);
  let [keypair3, datakey3, errREK3] = taggedRegistryEntryKeys(seed, "test-keypair", "test-datakey");
  expect(errREK3).toBe(null);
  expect(datakey2).toEqual(datakey3);
  expect(keypair2).toEqual(keypair3);

  // Check that changing the keypair also changes the datakey even if the
  // datakeyTag is unchanged.
  let [keypair4, datakey4, errREK4] = taggedRegistryEntryKeys(seed, "test-keypair2", "test-datakey");
  expect(errREK4).toBe(null);
  expect(keypair3).toEqual(keypair4);
  expect(datakey3).toEqual(datakey4);

  // Check that changing the datakey doesn't change the keypair.
  let [keypair5, datakey5, errREK5] = taggedRegistryEntryKeys(seed, "test-keypair2", "test-datakey2");
  expect(errREK5).toBe(null);
  expect(keypair4).toEqual(keypair5);
  expect(datakey4).toEqual(datakey5);

  // Check that we can derive a registry entry id.
  let [entryID, errDREID] = deriveRegistryEntryID(keypair5.publicKey, datakey5);
  expect(errDREID).toBe(null);
  console.log("example entry id:     ", bufToHex(entryID));
  // Convert to resolver link.
  let rl = entryIDToSkylink(entryID);
  console.log("example resolver link:", rl);
});
