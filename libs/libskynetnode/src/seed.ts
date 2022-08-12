import { randomBytes } from "crypto";
import { Err, addContextToErr, bufToB64, generateSeedPhraseDeterministic } from "libskynet";

// generateSeedPhraseRandom will randomly generate and verify a seed phrase for the user.
function generateSeedPhraseRandom(): [string, Err] {
  const buf = Uint8Array.from(randomBytes(32));
  const str = bufToB64(buf);
  const [sp, errGSPD] = generateSeedPhraseDeterministic(str);
  if (errGSPD !== null) {
    return ["", addContextToErr(errGSPD, "unable to generate seed from string")];
  }
  return [sp, null];
}

export { generateSeedPhraseRandom };
