import { validateSkyfilePath } from "../src/skylinkValidate.js";

test.each([
  { path: "test", result: null },
  { path: "test/subtrial", result: null },
  { path: "test/subtrial.ext", result: null },
  { path: "test/trial.ext/subtrial.ext", result: null },
  { path: ".foo", result: null },
  { path: ".foo/.bar", result: null },
  { path: "foo/.bar", result: null },
  { path: "/", result: "metdata.Filename cannot start with /" },
  { path: "", result: "path cannot be blank" },
  { path: ".", result: "path cannot be ." },
  { path: "./", result: "metdata.Filename cannot start with ./" },
  { path: "a//b", result: "path cannot have an empty element, cannot contain //" },
  { path: "a/./b", result: "path cannot have a . element" },
  { path: "a/../b", result: "path cannot have a .. element" },
  { path: "../a/b", result: "metdata.Filename cannot start with ../" },
  { path: "/sometrial", result: "metdata.Filename cannot start with /" },
  { path: "sometrial/", result: "path cannot have an empty element, cannot contain //" },
])("testValidateSkyfilePath with path '$path'", ({ path, result }) => {
  expect(validateSkyfilePath(path)).toBe(result);
});
