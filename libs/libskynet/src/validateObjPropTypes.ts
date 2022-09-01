import { addContextToErr } from "./err.js";
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
//   ["aUint8Array", "Uint8Array"],
// ]);
function validateObjPropTypes(obj: any, checks: [string, string][]): Err {
  for (let i = 0; i < checks.length; i++) {
    const [property, expectedType] = checks[i];

    // Loop through the array cases.
    const arrayCases = [
      ["booleanArray", "boolean"],
      ["numberArray", "number"],
      ["bigintArray", "bigint"],
      ["stringArray", "string"],
    ];
    let checkPassed = false;
    for (let j = 0; j < arrayCases.length; j++) {
      // If this is not an array case, ignore it.
      const [arrCaseType, arrType] = arrayCases[j];
      if (expectedType !== arrCaseType) {
        continue;
      }

      // Check every element in the array.
      const err = validateArrayTypes(obj[property], arrType);
      if (err !== null) {
        return addContextToErr(err, `check failed for array property '${property}'`);
      }

      // We found the expected type for this check, we can stop checking the
      // rest.
      checkPassed = true;
      break;
    }
    // If the type was an array type, we don't need to perform the next check.
    if (checkPassed === true) {
      continue;
    }

    // Uint8Array check.
    if (expectedType === "Uint8Array") {
      if (obj[property] instanceof Uint8Array) {
        continue;
      } else {
        return `check failed for property '${property};, expecting Uint8Array`;
      }
    }

    // Generic typeof check.
    const type = typeof obj[property];
    if (type !== expectedType) {
      return `check failed for property '${property}', expecting ${expectedType} got ${type}`;
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
  return null;
}

export { validateObjPropTypes };
