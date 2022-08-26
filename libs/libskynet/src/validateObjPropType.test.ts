import { validateObjPropTypes } from "./validateObjPropTypes.js";

// unit testing for validateObjPropTypes. Doesn't use test.each because the
// test inputs are complex.
test("validateObjPropTypes", () => {
  // Validate a basic object.
  const obj1 = {
    prop1: "a",
  };
  const obj1Err = validateObjPropTypes(obj1, [["prop1", "string"]]);
  expect(obj1Err).toBe(null);

  // Validate a complex object without arrays.
  const someVar = 12;
  const obj2 = {
    prop: "a",
    prop1: `some var: ${someVar}`,
    prop2: 5,
    butter: 5n,
    toast: false,
    pecans: true,
  };
  const obj2Err = validateObjPropTypes(obj2, [
    ["prop", "string"],
    ["prop1", "string"],
    ["prop2", "number"],
    ["butter", "bigint"],
    ["toast", "boolean"],
    ["pecans", "boolean"],
  ]);
  expect(obj2Err).toBe(null);

  // Validate an object that is missing a field.
  const obj3 = {
    prop: "a",
    prop1: `some var: ${someVar}`,
    prop2: 5,
    toast: false,
    pecans: true,
  };
  const obj3Err = validateObjPropTypes(obj3, [
    ["prop", "string"],
    ["prop1", "string"],
    ["prop2", "number"],
    ["butter", "bigint"],
    ["toast", "boolean"],
    ["pecans", "boolean"],
  ]);
  expect(obj3Err).not.toBe(null);

  // Validate an object that is missing the last field.
  const obj4 = {
    prop: "a",
    prop1: `some var: ${someVar}`,
    prop2: 5,
    butter: 5n,
    toast: false,
  };
  const obj4Err = validateObjPropTypes(obj4, [
    ["prop", "string"],
    ["prop1", "string"],
    ["prop2", "number"],
    ["butter", "bigint"],
    ["toast", "boolean"],
    ["pecans", "boolean"],
  ]);
  expect(obj4Err).not.toBe(null);

  // Validate an object that is missing the first field.
  const obj5 = {
    prop1: `some var: ${someVar}`,
    prop2: 5,
    butter: 5n,
    toast: false,
    pecans: true,
  };
  const obj5Err = validateObjPropTypes(obj5, [
    ["prop", "string"],
    ["prop1", "string"],
    ["prop2", "number"],
    ["butter", "bigint"],
    ["toast", "boolean"],
    ["pecans", "boolean"],
  ]);
  expect(obj5Err).not.toBe(null);

  // Validate an object with an array in it.
  const obj6 = {
    arr: ["hi", "hello"],
  };
  const obj6Err = validateObjPropTypes(obj6, [["arr", "stringArray"]]);
  expect(obj6Err).toBe(null);

  // Validate an object with the wrong array type in it.
  const obj7 = {
    arr: ["hi", "hello", 5],
  };
  const obj7Err = validateObjPropTypes(obj7, [["arr", "stringArray"]]);
  expect(obj7Err).not.toBe(null);

  // Validate an object with every array type, sprinkled in between normal
  // types.
  const obj8 = {
    arrStr: ["hi", "hello"],
    prop: "a",
    arrNumber: [1, 2, 3],
    prop1: `some var: ${someVar}`,
    prop2: 5,
    butter: 5n,
    arrBool: [true, true, false],
    toast: false,
    pecans: true,
    arrBig: [1n, 2n, 3n],
  };
  // We are now checking the objects out of order as another test.
  const obj8Err = validateObjPropTypes(obj8, [
    ["prop", "string"],
    ["prop1", "string"],
    ["prop2", "number"],
    ["butter", "bigint"],
    ["toast", "boolean"],
    ["pecans", "boolean"],
    ["arrStr", "stringArray"],
    ["arrNumber", "numberArray"],
    ["arrBig", "bigintArray"],
    ["arrBool", "booleanArray"],
  ]);
  expect(obj8Err).toBe(null);

  // Validate an object with array types, but some of the types are wrong.
  // 'pecans' has the wrong type in this test.
  const obj9 = {
    arrStr: ["hi", "hello"],
    prop: "a",
    arrNumber: [1, 2, 3],
    prop1: `some var: ${someVar}`,
    prop2: 5,
    butter: 5n,
    arrBool: [true, true, false],
    toast: false,
    pecans: 1,
    arrBig: [1n, 2n, 3n],
  };
  // We are now checking the objects out of order as another test.
  const obj9Err = validateObjPropTypes(obj9, [
    ["arrStr", "stringArray"],
    ["prop", "string"],
    ["prop1", "string"],
    ["prop2", "number"],
    ["butter", "bigint"],
    ["toast", "boolean"],
    ["pecans", "boolean"],
    ["arrNumber", "numberArray"],
    ["arrBig", "bigintArray"],
    ["arrBool", "booleanArray"],
  ]);
  expect(obj9Err).not.toBe(null);

  // Validate an object with array types, but some of the types are wrong.
  // 'arrNumber' has the wrong type in this test.
  const obj10 = {
    arrStr: ["hi", "hello"],
    prop: "a",
    arrNumber: ["1", "2", "3"],
    prop1: `some var: ${someVar}`,
    prop2: 5,
    butter: 5n,
    arrBool: [true, true, false],
    toast: false,
    pecans: true,
    arrBig: [1n, 2n, 3n],
  };
  // We are now checking the objects out of order as another test.
  const obj10Err = validateObjPropTypes(obj10, [
    ["arrStr", "stringArray"],
    ["prop", "string"],
    ["prop1", "string"],
    ["prop2", "number"],
    ["butter", "bigint"],
    ["toast", "boolean"],
    ["pecans", "boolean"],
    ["arrNumber", "numberArray"],
    ["arrBig", "bigintArray"],
    ["arrBool", "booleanArray"],
  ]);
  expect(obj10Err).not.toBe(null);
});
