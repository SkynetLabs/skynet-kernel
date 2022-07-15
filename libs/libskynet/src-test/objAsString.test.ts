import { objAsString } from "../src/objAsString";

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

  // Try testing an error object.
  let err1 = new Error("this is an error");
  let err1Result = objAsString(err1);
  expect(err1Result).toBe("this is an error");
});
