import { dictionary } from "../src/dictionary";
import { generateSeedPhraseDeterministic } from "../src/seed";

describe("seed", () => {
  // Generate 128 simple passwords, from 1 to 128.
  const dummyPasswords = Array(128)
    .fill(0)
    .map((_, i) => String(i));
  const first256DictionaryEntries = dictionary.slice(0, 256);

  describe.each(dummyPasswords)(`generateSeedPhraseDeterministic("%i")`, (password) => {
    const [phrase, err] = generateSeedPhraseDeterministic(password);

    it("is able to generate a seed phrase", () => {
      expect(err).toBe(null);
    });

    it("conforms to 13th word rule", () => {
      const words = phrase.split(" ");

      expect(first256DictionaryEntries).toContain(words[12]);
    });
  });
});
