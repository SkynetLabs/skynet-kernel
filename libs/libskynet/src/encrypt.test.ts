import { bufToHex } from "../src/encoding.js";
import { otpEncrypt } from "../src/encrypt.js";
import { sha512 } from "../src/sha512.js";

test("otpEncrypt", () => {
  // Perform a basic encryption and ensure that the data changes.
  const initialData1 = new TextEncoder().encode("this is a test string to encrypt");
  const initialData2 = new TextEncoder().encode("this is a test string to encrypt");
  const key1 = sha512(new TextEncoder().encode("this is a key preimage"));
  const key2 = sha512(new TextEncoder().encode("this is a different key preimage"));
  console.log("before encrypt:", bufToHex(initialData2));
  otpEncrypt(key1, initialData2);
  console.log("after encrypt: ", bufToHex(initialData2));
  expect(initialData1.length).toBe(initialData2.length);
  expect(initialData1).not.toEqual(initialData2);

  // Check that decryption works.
  otpEncrypt(key1, initialData2);
  expect(initialData1).toEqual(initialData2);

  // Check that encrypting with a different key will give a different data.
  otpEncrypt(key1, initialData1);
  otpEncrypt(key2, initialData2);
  console.log("different key: ", bufToHex(initialData2));
  expect(initialData1).not.toEqual(initialData2);
});

test("otpEncryptSpeed", () => {
  const key = new TextEncoder().encode("any key");
  const data = new Uint8Array(20 * 1024 * 1024);
  const start = performance.now();
  otpEncrypt(key, data);
  const total = performance.now() - start;
  console.log("milliseconds to encrypt 20 MiB:", total);
});
