import { Err } from "./types.js"

// checkObj take an untrusted object and a list of typechecks to perform and
// will check that the object adheres to the typechecks. If a type is missing
// or has the wrong type, an error will be returned. This is intended to be
// used to check untrusted objects after they get decoded from JSON. This is
// particularly useful when receiving objects from untrusted entities over the
// network or over postMessage.
//
// Below is an example object, followed by the call that you would make to
// checkObj to verify the object.
//
// const expectedObj = {
//   aNum: 35,
//   aStr: "hi",
//   aBig: 10n,
// };
//
// const err = checkObj(expectedObj, [
//   ["aNum", "number"],
//   ["aStr", "string"],
//   ["aBig", "bigint"],
// ]);
function checkObj(obj: any, checks: [string, string][]): Err {
	for (let i = 0; i < checks.length; i++) {
		const check = checks[i]
		const type = typeof obj[check[0]]
		if (type !== check[1]) {
			return "check failed, expecting " + check[1] + " got " + type
		}
	}
	return null
}

export { checkObj }
