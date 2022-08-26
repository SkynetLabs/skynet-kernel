import { ed25519KeypairFromEntropy, ed25519Sign, ed25519Verify } from "./ed25519.js";
import { sha512 } from "./sha512.js";

test("ed25519", () => {
  // Make a keypair with some entropy, then test that signing and verifying
  // don't fail.
  const entropy = sha512(new TextEncoder().encode("fake entropy"));
  const [keypair, errKPFE] = ed25519KeypairFromEntropy(entropy.slice(0, 32));
  expect(errKPFE).toBe(null);
  const message = new TextEncoder().encode("fake message");
  const [signature, errS] = ed25519Sign(message, keypair.secretKey);
  expect(errS).toBe(null);
  const validSig = ed25519Verify(message, signature, keypair.publicKey);
  expect(validSig).toBe(true);
});
