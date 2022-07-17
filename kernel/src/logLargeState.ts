import { notableErrors } from "./err.js";
import { log } from "./log.js";
import { modules, modulesLoading, queries } from "./queries.js";

// Set up a loop that will periodically log all of the large objects in the
// kernel, for the sake of making detection and debugging easier in the event
// of a
let waitTime = 30000;
function logLargeObjects() {
  let queriesLenStr = Object.keys(queries).length.toString();
  let modulesLenStr = Object.keys(modules).length.toString();
  let modulesLoadingLenStr = Object.keys(modulesLoading).length.toString();
  log(
    "open queries :: open modules :: modules loading :: notable errors : " +
      queriesLenStr +
      " :: " +
      modulesLenStr +
      " :: " +
      modulesLoadingLenStr +
      " :: " +
      notableErrors.length
  );
  waitTime *= 1.25;
  setTimeout(logLargeObjects, waitTime);
}
setTimeout(logLargeObjects, waitTime);

export { logLargeObjects };
