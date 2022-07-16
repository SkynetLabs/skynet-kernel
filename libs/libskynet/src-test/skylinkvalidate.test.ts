import { validateSkyfilePath } from "../src/skylinkvalidate.js";

test("testValidateSkyfilePath", () => {
  let tests = [
    { trial: "test", result: true },
    { trial: "test/subtrial", result: true },
    { trial: "test/subtrial.ext", result: true },
    { trial: "test/trial.ext/subtrial.ext", result: true },
    { trial: "", result: false },
    { trial: ".", result: false },
    { trial: "./", result: false },
    { trial: "a//b", result: false },
    { trial: "a/./b", result: false },
    { trial: "a/../b", result: false },
    { trial: "../a/b", result: false },
    { trial: "/sometrial", result: false },
    { trial: "sometrial/", result: false },
  ];
  for (let i = 0; i < tests.length; i++) {
    let err = validateSkyfilePath(tests[i].trial);
    if (tests[i].result === true) {
      expect(err).toBe(null);
    } else {
      expect(err).not.toBe(null);
    }
  }
});
