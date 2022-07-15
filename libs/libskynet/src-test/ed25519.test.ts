import { Ed25519Keypair, ed25519KeypairFromEntropy, ed25519Sign, ed25519Verify } from "../src/ed25519";
import { sha512 } from "../src/sha512";

test("ed25519", () => {
  // Make a keypair with some entropy, then test that signing and verifying
  // don't fail.
  let entropy = sha512(new TextEncoder().encode("fake entropy"));
  let [keypair, errKPFE] = ed25519KeypairFromEntropy(entropy.slice(0, 32));
  expect(errKPFE).toBe(null);
  let message = new TextEncoder().encode("fake message");
  let [signature, errS] = ed25519Sign(message, keypair.secretKey);
  expect(errS).toBe(null);
  let validSig = ed25519Verify(message, signature, keypair.publicKey);
  expect(validSig).toBe(true);
});
