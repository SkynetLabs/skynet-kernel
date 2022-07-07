import { addHandler, handleMessage } from "libkmodule";
import type { ActiveQuery } from "libkmodule";

// Required for libkmodule to work.
onmessage = handleMessage;

// Will route calls to "repeatMessage" to handleRepeatMessage.
addHandler("repeatMessage", handleRepeatMessage);

// handleRepeatMessage will handle a call to repeatMessage.
function handleRepeatMessage(aq: ActiveQuery) {
  // We are expecting there to be one input field
  // 'message' which has a string value.
  if (typeof aq.callerInput.message !== "string") {
    aq.reject("Field `message` expected to be a string");
    return;
  }

  // Respond to query with data
  aq.respond({ resp: "got message: " + aq.callerInput.message });
}
