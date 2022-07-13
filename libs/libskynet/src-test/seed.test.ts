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
  let [, errVSP1] = validSeedPhrase(phraseTestInput);
  let [, errVSP2] = validSeedPhrase(phraseTestInput3);
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

test("encodeAndDecodeU64", () => {
  let tests = [0n, 1n, 2n, 35n, 500n, 12345n, 642156n, 9591335n, 64285292n];
  for (let i = 0; i < tests.length; i++) {
    let [enc, errEU64] = encodeU64(tests[i]);
    expect(errEU64).toBe(null);
    let [dec, errDU64] = decodeU64(enc);
    expect(errDU64).toBe(null);
    expect(dec).toBe(tests[i]);
  }
});

test("objAsString", () => {
  // Try undefined.
  let undefinedVar;
  let undefinedResult = objAsString(undefinedVar);
  expect(undefinedResult).toBe("[cannot convert undefined to string]");

  // Try null.
  let nullVar = null;
  let nullResult = objAsString(nullVar);
  expect(nullResult).toBe("[cannot convert null to string]");

  // Try a string.
  let strResult = objAsString("asdf");
  expect(strResult).toBe("asdf");
  let strVar = "asdfasdf";
  let strResult2 = objAsString(strVar);
  expect(strResult2).toBe("asdfasdf");

  // Try an object.
  let objVar = { a: "b", b: 7 };
  let objResult = objAsString(objVar);
  expect(objResult).toBe('{"a":"b","b":7}');

  // Try an object with a defined toString that is a function.
  objVar.toString = function () {
    return "b7";
  };
  let objResult3 = objAsString(objVar);
  expect(objResult3).toBe("b7");

  // Try an object with a defined toString that is not a function. We need to
  // specifiy 'as any' because we already made 'toString' a string, and now we
  // are redefining the field with a new type.
  (objVar as any).toString = "b7";
  let objResult2 = objAsString(objVar);
  expect(objResult2).toBe('{"a":"b","b":7,"toString":"b7"}');
});

/*
// TestBufToB64 unit tests converting a buffer to base64.
function TestBufToB64(t: any) {
  let tests = [
    { trial: new Uint8Array(0), expect: "" },
    { trial: new Uint8Array([1]), expect: "AQ" },
    { trial: new Uint8Array([1, 2]), expect: "AQI" },
    { trial: new Uint8Array([255]), expect: "_w" },
    { trial: new Uint8Array([23, 51, 0]), expect: "FzMA" },
    { trial: new Uint8Array([0]), expect: "AA" },
    { trial: new Uint8Array([0, 0, 0]), expect: "AAAA" },
    { trial: new Uint8Array([30, 1, 3, 45, 129, 127]), expect: "HgEDLYF_" },
    { trial: new Uint8Array([155, 196, 150, 83, 71, 54, 205, 231, 249, 34]), expect: "m8SWU0c2zef5Ig" },
    { trial: new Uint8Array([57, 58, 59, 60, 61, 62, 63, 64]), expect: "OTo7PD0-P0A" },
  ];
  for (let i = 0; i < tests.length; i++) {
    let result = bufToB64(tests[i].trial);
    if (result.length !== tests[i].expect.length) {
      t.log("got", bufToB64(tests[i].trial));
      t.fail("trial failed", tests[i].trial);
      continue;
    }
    for (let j = 0; j < result.length; j++) {
      if (result[j] !== tests[i].expect[j]) {
        t.log("got", bufToB64(tests[i].trial));
        t.fail("trial failed", tests[i].trial);
        break;
      }
    }
  }
}

// TestBufToHex unit tests converting a buffer to hexadecimal.
function TestBufToHex(t: any) {
  let tests = [
    { trial: new Uint8Array(0), expect: "" },
    { trial: new Uint8Array([1]), expect: "01" },
    { trial: new Uint8Array([1, 2]), expect: "0102" },
    { trial: new Uint8Array([255]), expect: "ff" },
    { trial: new Uint8Array([23, 51, 0]), expect: "173300" },
    { trial: new Uint8Array([3, 7, 63, 127, 200, 5]), expect: "03073f7fc805" },
    { trial: new Uint8Array([0]), expect: "00" },
    { trial: new Uint8Array([0, 0, 0]), expect: "000000" },
  ];
  for (let i = 0; i < tests.length; i++) {
    let result = bufToHex(tests[i].trial);
    if (result.length !== tests[i].expect.length) {
      t.log("got", bufToHex(tests[i].trial));
      t.fail("trial failed", tests[i].trial);
      continue;
    }
    for (let j = 0; j < result.length; j++) {
      if (result[j] !== tests[i].expect[j]) {
        t.log("got", bufToHex(tests[i].trial));
        t.fail("trial failed", tests[i].trial);
        break;
      }
    }
  }
}
*/
