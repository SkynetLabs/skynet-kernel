import { ActiveQuery } from "./messages.js";

// handleNoOp create a no-op function for the module that allows the module to
// be "warmed up", meaning the kernel will stick the module into the cache so
// that it loads faster when a user actually needs the module.
function handleNoOp(aq: ActiveQuery) {
  aq.respond({ success: true });
}

export { handleNoOp };
