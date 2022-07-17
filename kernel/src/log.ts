import { objAsString } from "libskynet";

// wLog is a wrapper for the log and logErr functions, to deduplicate code.
//
// TODO: Need to implement a tag system for the logging. We will use the
// dashboard to control logging messages and verbosity.
function wLog(isErr: boolean, tag: string, ...inputs: any) {
  let message = "[skynet-kernel]\n" + tag;
  for (let i = 0; i < inputs.length; i++) {
    message += "\n";
    message += objAsString(inputs[i]);
  }
  window.parent.postMessage(
    {
      method: "log",
      data: {
        isErr,
        message,
      },
    },
    "*"
  );
}
function log(tag: string, ...inputs: any) {
  wLog(false, tag, ...inputs);
}
function logErr(tag: string, ...inputs: any) {
  wLog(true, tag, ...inputs);
}

export { log, logErr };
