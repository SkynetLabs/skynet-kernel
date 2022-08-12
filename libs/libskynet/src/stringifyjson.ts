import { addContextToErr } from "./err.js";
import { objAsString } from "./objAsString.js";
import { Err } from "./types.js";

// jsonStringify is a replacement for JSON.stringify that returns an error
// rather than throwing.
function jsonStringify(obj: any): [string, Err] {
  try {
    const str = JSON.stringify(obj, (_, v) => {
      if (typeof v === "bigint") {
        return Number(v);
      }
      return v;
    });
    return [str, null];
  } catch (err) {
    return ["", addContextToErr(objAsString(err), "unable to stringify object")];
  }
}

export { jsonStringify };
