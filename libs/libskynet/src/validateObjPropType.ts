import { Err } from "./types.js";

// validateObjPropTypes takes an object as input, along with a list of checks
// that should performed on the properties of the object. If all of the
// properties are present in the object and adhere to the suggested types,
// `null` is returned. Otherwise a string is returned indicating the first
// property that failed a check.
//
// This function is intended to be used on objects that were decoded from JSON
// after being received by an untrusted source.
//
// validateObjProperties supports all of the basic types, as well as arrays for
// types boolean, number, bigint, and string. In the future, support for more
// types may be added as well.
//
// Below is an example object, followed by the call that you would make to
// checkObj to verify the object.
//
// const expectedObj = {
//   aNum: 35,
//   aStr: "hi",
//   aBig: 10n,
//   aArr: [1, 2, 3],
// };
//
// const err = validateObjPropTypes(expectedObj, [
//   ["aNum", "number"],
//   ["aStr", "string"],
//   ["aBig", "bigint"],
//   ["aArr", "numberArray"],
// ]);
function validateObjPropTypes(obj: any, checks: [string, string][]): Err {
  for (let i = 0; i < checks.length; i++) {
    const [property, expectedType] = checks[i];

    // Special cases for arrays.
    if (expectedType === "booleanArray") {
      const err = validateArrayTypes(object[property], "boolean");
      if (err !== null) {
        return addContextToErr(err, `check failed for array property '${property}'`);
      }
      continue;
    }
    if (expectedType === "numberArray") {
      const err = validateArrayTypes(object[property], "number");
      if (err !== null) {
        return addContextToErr(err, `check failed for array property '${property}'`);
      }
      continue;
    }
    if (expectedType === "bigintArray") {
      const err = validateArrayTypes(object[property], "bigint");
      if (err !== null) {
        return addContextToErr(err, `check failed for array property '${property}'`);
      }
      continue;
    }
    if (expectedType === "stringArray") {
      const err = validateArrayTypes(object[property], "string");
      if (err !== null) {
        return addContextToErr(err, `check failed for array property '${property}'`);
      }
      continue;
    }

    // Generic typeof check.
    const type = typeof object[property];
    if (type !== expectedType) {
      return `check failed for property ${property}, expecting ${expectedType} got ${type}`;
    }
  }
  return null;
}

// validateArrayTypes takes an array as input and validates that every element
// in the array matches the provided type.
//
// This is a helper function for validateObjPropTypes, the property is provided
// as an input to produce a more coherent error message.
function validateArrayTypes(arr: any, expectedType: string): Err {
  // Check that the provided input is actually an array.
  if (!Array.isArray(arr)) {
    return `not an array`;
  }
  for (let i = 0; i < arr.length; i++) {
    const type = typeof arr[i];
    if (type !== expectedType) {
      return `element ${i} is expected to be ${expectedType}, got ${type}`;
    }
  }
}

export { validateObjPropTypes };
