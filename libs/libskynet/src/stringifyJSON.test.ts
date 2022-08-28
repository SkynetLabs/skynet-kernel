import { jsonStringify } from "./stringifyJSON.js";

test("testJSONStringify", () => {
  // Check that the function works as expected with basic input.
  const basicObj = {
    test: 5,
  };
  const [str1, err1] = jsonStringify(basicObj);
  expect(err1).toBe(null);

  // Count the number of quotes in str1, we are expecting 2.
  let quotes = 0;
  for (let i = 0; i < str1.length; i++) {
    if (str1[i] === '"') {
      quotes += 1;
    }
  }
  expect(quotes).toBe(2);

  // Try encoding a bignum.
  const bigNumObj = {
    test: 5n,
    testBig: 122333444455555666666777777788888888999999999000000000012345n,
  };
  const [str2, err2] = jsonStringify(bigNumObj);
  expect(err2).toBe(null);
  // Count the number of quotes in str2, we are expecting 4.
  quotes = 0;
  for (let i = 0; i < str2.length; i++) {
    if (str2[i] === '"') {
      quotes += 1;
    }
  }
  expect(quotes).toBe(4);
});
