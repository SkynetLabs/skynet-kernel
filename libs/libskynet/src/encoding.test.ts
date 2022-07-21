import { bufToHex, bufToB64, decodeU64, encodeU64, hexToBuf } from "../src/encoding";

test("encodeAndDecodeU64", () => {
  const tests = [0n, 1n, 2n, 35n, 500n, 12345n, 642156n, 9591335n, 64285292n];
  for (let i = 0; i < tests.length; i++) {
    const [enc, errEU64] = encodeU64(tests[i]);
    expect(errEU64).toBe(null);
    const [dec, errDU64] = decodeU64(enc);
    expect(errDU64).toBe(null);
    expect(dec).toBe(tests[i]);
  }
});

test("bufToB64", () => {
  const tests = [
    { trial: new Uint8Array(0), result: "" },
    { trial: new Uint8Array([1]), result: "AQ" },
    { trial: new Uint8Array([1, 2]), result: "AQI" },
    { trial: new Uint8Array([255]), result: "_w" },
    { trial: new Uint8Array([23, 51, 0]), result: "FzMA" },
    { trial: new Uint8Array([0]), result: "AA" },
    { trial: new Uint8Array([0, 0, 0]), result: "AAAA" },
    { trial: new Uint8Array([30, 1, 3, 45, 129, 127]), result: "HgEDLYF_" },
    { trial: new Uint8Array([155, 196, 150, 83, 71, 54, 205, 231, 249, 34]), result: "m8SWU0c2zef5Ig" },
    { trial: new Uint8Array([57, 58, 59, 60, 61, 62, 63, 64]), result: "OTo7PD0-P0A" },
  ];
  for (let i = 0; i < tests.length; i++) {
    const result = bufToB64(tests[i].trial);
    expect(result.length).toBe(tests[i].result.length);
    for (let j = 0; j < result.length; j++) {
      expect(result[j]).toBe(tests[i].result[j]);
    }
  }
});

test("bufToHexAndBufToHex", () => {
  const tests = [
    { trial: new Uint8Array(0), result: "" },
    { trial: new Uint8Array([1]), result: "01" },
    { trial: new Uint8Array([1, 2]), result: "0102" },
    { trial: new Uint8Array([255]), result: "ff" },
    { trial: new Uint8Array([23, 51, 0]), result: "173300" },
    { trial: new Uint8Array([3, 7, 63, 127, 200, 5]), result: "03073f7fc805" },
    { trial: new Uint8Array([0]), result: "00" },
    { trial: new Uint8Array([0, 0, 0]), result: "000000" },
  ];

  // Test hexToBuf
  for (let i = 0; i < tests.length; i++) {
    const result = bufToHex(tests[i].trial);
    expect(result.length).toBe(tests[i].result.length);
    for (let j = 0; j < result.length; j++) {
      expect(result[j]).toBe(tests[i].result[j]);
    }
  }

  // Test bufToHex.
  for (let i = 0; i < tests.length; i++) {
    const [result, err] = hexToBuf(tests[i].result);
    expect(err).toBe(null);
    expect(result.length).toBe(tests[i].trial.length);
    for (let j = 0; j < result.length; j++) {
      expect(result[j]).toBe(tests[i].trial[j]);
    }

    // Check that upper case is also okay.
    const [result2, err2] = hexToBuf(tests[i].result.toUpperCase());
    expect(err2).toBe(null);
    expect(result2.length).toBe(tests[i].trial.length);
    for (let j = 0; j < result2.length; j++) {
      expect(result2[j]).toBe(tests[i].trial[j]);
    }
  }

  // Create tests to check for invalid inputs.
  const invalids = ["0", "000", "aX", "123O", "XX"];
  for (let i = 0; i < invalids.length; i++) {
    const [, err] = hexToBuf(invalids[i]);
    if (err === null) {
      console.log(invalids[i]);
    }
    expect(err).not.toBe(null);
  }
});
