import { notableErrors, respondErr } from "./err.js";
import { log, logErr } from "./log.js";
import { DEFAULT_MYSKY_ROOT_MODULES, activeSeed, myskyRootKeypair } from "./seed.js";
import { KERNEL_DISTRO, KERNEL_VERSION } from "./version.js";
import {
  Err,
  SkynetPortal,
  addContextToErr,
  bufToB64,
  downloadSkylink,
  encodeU64,
  objAsString,
  sha512,
} from "libskynet";
import { moduleQuery, presentSeedData } from "libkmodule";

// DEFAULT_PERSISTENT_MODULES defines the set of modules that are allowed to
// process all queries using a single webworker, rather than have each query
// get a dedicated webworker.
//
// This is a temporary work-around until the 'getSetObject' part of the SDK has
// been more fully built out.
const DEFAULT_PERSISTENT_MODULES = [
  "AQCoaLP6JexdZshDDZRQaIwN3B7DqFjlY7byMikR7u1IEA", // kernel-test-helper
  "AQCPJ9WRzMpKQHIsPo8no3XJpUydcDCjw7VJy8lG1MCZ3g", // kernel-test-suite
  "AQCBPFvXNvdtnLbWCRhC5WKhLxxXlel-EDwNM7-GQ-XV3Q", // skynet-portal module
  "AQBmFdF14nfEQrERIknEBvZoTXxyxG8nejSjH6ebCqcFkQ", // redsolvers-identity-dac
  "AQAXZpiIGQFT3lKGVwb8TAX3WymVsrM_LZ-A9cZzYNHWCw", // redsolvers-profile-dac
  "AQAPFg2Wdtld0HoVP0sIAQjQlVnXC-KY34WWDxXBLtzfbw", // redsolvers-query-dac
  "AQDETEWOzNYZu5YeOIPhvwpqIn3aL6ghf-ccLpbj3O1EIw", // redsolvers-social-dac
  "AQCSRGL0vey8Nccy_Pqk3fYTMm0y2nE_dK0I8ro8bZyZ3Q", // redsolvers-feed-dac
  "AQAKn33Pm9WPcm872JuxnRhowH5UA3Mm_hCb6CMT79nQdw", // redsolvers-bridge-dac
  "AQDgPeyl2j30aY7tLnYI5aEvbrptQuz90bfSgwjKlmpOvw", // redsolvers-permission-module
];

// BOOTSTRAP_PORTALS declares the list of portals that should be used by
// default to connect the user to Skynet. These are the portals that get used
// by the portal module in the event that the user has not established a set of
// preferred portals.
//
// For brand new users, this list is the only way that a user can potentially
// get online, so it's worth making the list as complete as possible.
const BOOTSTRAP_PORTALS: SkynetPortal[] = [
  { url: "https://skynetfree.net", name: "skynetfree.net" },
  { url: "https://web3portal.com", name: "web3portal.com" },
];

const DEFAULT_PORTAL_MODULES = ["AQCBPFvXNvdtnLbWCRhC5WKhLxxXlel-EDwNM7-GQ-XV3Q"];

// WorkerLaunchFn is the type signature of the function that launches the
// worker to set up for processing a query.
type WorkerLaunchFn = () => [Worker, Err];

// modules is a hashmap that maps from a domain to the module that handles
// queries to that domain. It maintains the domain and URL of the module so
// that the worker doesn't need to be downloaded multiple times to keep
// launching queries.
//
// a new worker gets launched for every query.
interface Module {
  domain: string;
  url: string;
  launchWorker: WorkerLaunchFn;

  // isPersistent indicates whether we keep the worker around after processing
  // a query. If it is set to false, worker will be undefined. If set to true,
  // the worker will be the worker that should be used to process a query.
  isPersistent: boolean;
  worker?: Worker;
}

// OpenQuery holds all of the information necessary for managing an open query.
interface OpenQuery {
  isWorker: boolean;
  domain: string;
  source: any;
  dest: Worker;
  nonce: string;
  origin: string;
}

// Define the stateful variables for managing the modules. We track the set of
// queries that are in progress, the set of modules that we've downloaded, and
// the set of modules that are actively being downloaded.
let queriesNonce = 0;
const queries = {} as any;
const modules = {} as any;
const modulesLoading = {} as any;

// Create a standard message handler for messages coming from workers.
//
// TODO: If the worker makes a mistake or has a bug that makes it seem
// unstable, we should create some sort of debug log that can be viewed from
// the kernel debug/control panel. We'll need to make sure the debug logs don't
// consume too much memory, and we'll need to terminate workers that are
// bugging out.
//
// TODO: Set up a ratelimiting system for modules making logs, we don't want
// modules to be able to pollute the kernel and cause instability by logging
// too much.
//
// TODO: Need to check that the postMessage call in respondErr isn't going to
// throw or cause issuse in the event that the worker who sent the message has
// been terminated.
//
// TODO: We probably need to have timeouts for queries, if a query doesn't send
// an update after a certain amount of time we drop it.
function handleWorkerMessage(event: MessageEvent, mod: Module, worker: Worker) {
  // TODO: Use of respondErr here may not be correct, should only be using
  // respondErr for functions that are expecting a response and aren't
  // already part of a separate query. If they are part of a separate query
  // we need to close that query out gracefully.

  // Perform input verification for a worker message.
  if (!("method" in event.data)) {
    logErr("worker", mod.domain, "received worker message with no method");
    respondErr(event, worker, true, "received message with no method");
    return;
  }

  // Check whether this is a logging call.
  if (event.data.method === "log") {
    // Perform the input verification for logging.
    if (!("data" in event.data)) {
      logErr("worker", mod.domain, "received worker log message with no data field");
      respondErr(event, worker, true, "received log messsage with no data field");
      return;
    }
    if (typeof event.data.data.message !== "string") {
      logErr("worker", mod.domain, "worker log data.message is not of type 'string'");
      respondErr(event, worker, true, "received log messsage with no message field");
      return;
    }
    if (event.data.data.isErr === undefined) {
      event.data.data.isErr = false;
    }
    if (typeof event.data.data.isErr !== "boolean") {
      logErr("worker", mod.domain, "worker log data.isErr is not of type 'boolean'");
      respondErr(event, worker, true, "received log messsage with invalid isErr field");
      return;
    }

    // Send the log to the parent so that the log can be put in the
    // console.
    if (event.data.data.isErr === false) {
      log("worker", "[" + mod.domain + "]", event.data.data.message);
    } else {
      logErr("worker", "[" + mod.domain + "]", event.data.data.message);
    }
    return;
  }

  // Check for a nonce - log is the only message from a worker that does not
  // need a nonce.
  if (!("nonce" in event.data)) {
    event.data.nonce = "N/A";
    logErr("worker", mod.domain, "worker sent a message with no nonce", event.data);
    respondErr(event, worker, true, "received message with no nonce");
    return;
  }

  // Handle a version request.
  if (event.data.method === "version") {
    worker.postMessage({
      nonce: event.data.nonce,
      method: "response",
      err: null,
      data: {
        distribution: KERNEL_DISTRO,
        version: KERNEL_VERSION,
        err: null,
      },
    });
    return;
  }

  // Handle a call from the worker to another module.
  if (event.data.method === "moduleCall") {
    handleModuleCall(event, worker, mod.domain, true);
    return;
  }

  // The only other methods allowed are the queryUpdate, responseUpdate,
  // and response methods.
  const isQueryUpdate = event.data.method === "queryUpdate";
  const isResponseUpdate = event.data.method === "responseUpdate";
  const isResponse = event.data.method === "response";
  if (isQueryUpdate || isResponseUpdate || isResponse) {
    handleModuleResponse(event, mod, worker);
    return;
  }

  // We don't know what this message was.
  logErr("worker", mod.domain, "received message from worker with unrecognized method");
}

// createModule will create a module from the provided worker code and domain.
// This call does not launch the worker, that should be done separately.
function createModule(workerCode: Uint8Array, domain: string): [Module, Err] {
  // Generate the URL for the worker code.
  const url = URL.createObjectURL(new Blob([workerCode]));

  // Create the module object.
  const mod: Module = {
    domain,
    url,
    launchWorker: function (): [Worker, Err] {
      return launchWorker(mod);
    },

    isPersistent: false,
  };

  // Check whether the worker is supposed to be persistent.
  for (let i = 0; i < DEFAULT_PERSISTENT_MODULES.length; i++) {
    if (domain === DEFAULT_PERSISTENT_MODULES[i]) {
      mod.isPersistent = true;
      const [worker, err] = mod.launchWorker();
      if (err !== null) {
        return [{} as Module, addContextToErr(err, "unable to launch persistent worker")];
      }
      mod.worker = worker;
      return [mod, null];
    }
  }
  return [mod, null];
}

// launchWorker will launch a worker and perform all the setup so that the
// worker is ready to receive a query.
function launchWorker(mod: Module): [Worker, Err] {
  // Create and launch the worker.
  let worker: Worker;
  try {
    worker = new Worker(mod.url);
  } catch (err: any) {
    logErr("worker", mod.domain, "unable to create worker", mod.domain, err);
    return [{} as Worker, addContextToErr(objAsString(err), "unable to create worker")];
  }

  // Set the onmessage and onerror functions.
  worker.onmessage = function (event: MessageEvent) {
    handleWorkerMessage(event, mod, worker);
  };
  worker.onerror = function (event: ErrorEvent) {
    const errStr = objAsString(event.message) + "\n" + objAsString(event.error) + "\n" + objAsString(event);
    logErr("worker", mod.domain, addContextToErr(errStr, "received onerror event"));
  };

  // Check if the module is on the whitelist to receive the mysky seed.
  const sendMyskyRoot = DEFAULT_MYSKY_ROOT_MODULES.includes(mod.domain);
  const sendBootstrapPortals = DEFAULT_PORTAL_MODULES.includes(mod.domain);

  // Send the seed to the module.
  const path = "moduleSeedDerivation" + mod.domain;
  const u8Path = new TextEncoder().encode(path);
  const moduleSeedPreimage = new Uint8Array(u8Path.length + 16);
  moduleSeedPreimage.set(u8Path, 0);
  moduleSeedPreimage.set(activeSeed, u8Path.length);
  const moduleSeed = sha512(moduleSeedPreimage).slice(0, 16);
  const msgData: presentSeedData = {
    seed: moduleSeed,
  };
  const msg: moduleQuery = {
    method: "presentSeed",
    domain: "root",
    data: msgData,
  };
  if (sendMyskyRoot === true) {
    msg.data.myskyRootKeypair = myskyRootKeypair;
  }
  if (sendBootstrapPortals === true) {
    msg.data.bootstrapPortals = BOOTSTRAP_PORTALS;
  }
  worker.postMessage(msg);
  return [worker, null];
}

// handleModuleCall will handle a callModule message sent to the kernel from an
// extension or webpage.
function handleModuleCall(event: MessageEvent, messagePortal: any, callerDomain: string, isWorker: boolean) {
  if (!("data" in event.data) || !("module" in event.data.data)) {
    logErr("moduleCall", "received moduleCall with no module field in the data", event.data);
    respondErr(event, messagePortal, isWorker, "moduleCall is missing 'module' field: " + JSON.stringify(event.data));
    return;
  }
  if (typeof event.data.data.module !== "string" || event.data.data.module.length != 46) {
    logErr("moduleCall", "received moduleCall with malformed module");
    respondErr(event, messagePortal, isWorker, "'module' field in moduleCall is expected to be a base64 skylink");
    return;
  }
  if (!("method" in event.data.data)) {
    logErr("moduleCall", "received moduleCall without a method set for the module");
    respondErr(event, messagePortal, isWorker, "no 'data.method' specified, module does not know what method to run");
    return;
  }
  if (typeof event.data.data.method !== "string") {
    logErr("moduleCall", "recieved moduleCall with malformed method", event.data);
    respondErr(event, messagePortal, isWorker, "'data.method' needs to be a string");
    return;
  }
  if (event.data.data.method === "presentSeed") {
    logErr("moduleCall", "received malicious moduleCall - only root is allowed to use presentSeed method");
    respondErr(event, messagePortal, isWorker, "presentSeed is a priviledged method, only root is allowed to use it");
    return;
  }
  if (!("data" in event.data.data)) {
    logErr("moduleCall", "received moduleCall with no input for the module");
    respondErr(event, messagePortal, isWorker, "no field data.data in moduleCall, data.data contains the module input");
    return;
  }

  // TODO: Load any overrides.
  const finalModule = event.data.data.module; // Can change with overrides.
  const moduleDomain = event.data.data.module; // Does not change with overrides.

  // Define a helper function to create a new query to the module. It will
  // both open a query on the module and also send an update message to the
  // caller with the kernel nonce for this query so that the caller can
  // perform query updates.
  const newModuleQuery = function (mod: Module) {
    let worker: Worker;
    if (mod.isPersistent) {
      worker = mod.worker!;
    } else {
      const [newWorker, err] = mod.launchWorker();
      if (err !== null) {
        const errCtx = addContextToErr(err, "unable to launch worker");
        logErr("worker", errCtx);
        respondErr(event, messagePortal, isWorker, errCtx);
        return;
      }
      worker = newWorker;
    }

    // Get the nonce for this query. The nonce is a
    // cryptographically secure string derived from a number and
    // the user's seed. We use 'kernelNonceSalt' as a salt to
    // namespace the nonces and make sure other processes don't
    // accidentally end up using the same hashes.
    const nonceSalt = new TextEncoder().encode("kernelNonceSalt");
    const [nonceBytes] = encodeU64(BigInt(queriesNonce));
    const noncePreimage = new Uint8Array(nonceSalt.length + activeSeed.length + nonceBytes.length);
    noncePreimage.set(nonceSalt, 0);
    noncePreimage.set(activeSeed, nonceSalt.length);
    noncePreimage.set(nonceBytes, nonceSalt.length + activeSeed.length);
    const nonce = bufToB64(sha512(noncePreimage));
    queriesNonce = queriesNonce + 1;
    const query: OpenQuery = {
      isWorker,
      domain: callerDomain,
      source: messagePortal,
      dest: worker,
      nonce: event.data.nonce,
      origin: event.origin,
    };
    queries[nonce] = query;

    // Send the message to the worker to start the query.
    worker.postMessage({
      nonce: nonce,
      domain: callerDomain,
      method: event.data.data.method,
      data: event.data.data.data,
    });

    // If the caller is asking for the kernel nonce for this query,
    // send the kernel nonce. We don't always send the kernel nonce
    // because messages have material overhead.
    if (event.data.sendKernelNonce === true) {
      const msg = {
        nonce: event.data.nonce,
        method: "responseNonce",
        data: {
          nonce,
        },
      };
      if (isWorker) {
        messagePortal.postMessage(msg);
      } else {
        messagePortal.postMessage(msg, event.origin);
      }
    }
  };

  // Check the worker pool to see if this module is already available.
  if (moduleDomain in modules) {
    const module = modules[moduleDomain];
    newModuleQuery(module);
    return;
  }

  // Check if another thread is already fetching the module.
  if (moduleDomain in modulesLoading) {
    const p = modulesLoading[moduleDomain];
    p.then((errML: Err) => {
      if (errML !== null) {
        respondErr(event, messagePortal, isWorker, addContextToErr(errML, "module could not be loaded"));
        return;
      }
      const module = modules[moduleDomain];
      newModuleQuery(module);
    });
    return;
  }

  // Fetch the module in a background thread, and launch the query once the
  // module is available.
  const moduleLoadedPromise = new Promise(async (resolve) => {
    // TODO: Check localStorage for the module.

    // Download the code for the worker.
    const [moduleData, errDS] = await downloadSkylink(finalModule);
    if (errDS !== null) {
      const err = addContextToErr(errDS, "unable to load module");
      respondErr(event, messagePortal, isWorker, err);
      resolve(err);
      delete modulesLoading[moduleDomain];
      return;
    }

    // The call to download the skylink is async. That means it's possible that
    // some other thread created the module successfully and already added it.
    // Based on the rest of the code, this should not be possible, but we check
    // for it anyway at runtime so that any concurrency bugs will be made
    // visible through the `notableErrors` field.
    //
    // This check is mainly here as a verification that the rest of the kernel
    // code is correct.
    if (moduleDomain in modules) {
      // Though this is an error, we do already have the module so we
      // use the one we already loaded.
      logErr("a module that was already loaded has been loaded");
      notableErrors.push("module loading experienced a race condition");
      const mod = modules[moduleDomain];
      newModuleQuery(mod);
      resolve(null);
      return;
    }

    // TODO: Save the result to localStorage. Can't do that until
    // subscriptions are in place so that localStorage can sync
    // with any updates from the remote module.

    // Create a new module.
    const [mod, errCM] = createModule(moduleData, moduleDomain);
    if (errCM !== null) {
      const err = addContextToErr(errCM, "unable to create module");
      respondErr(event, messagePortal, isWorker, err);
      resolve(err);
      delete modulesLoading[moduleDomain];
      return;
    }
    modules[moduleDomain] = mod;
    newModuleQuery(mod);
    resolve(null);
    delete modulesLoading[moduleDomain];
  });
  modulesLoading[moduleDomain] = moduleLoadedPromise;
}

function handleModuleResponse(event: MessageEvent, mod: Module, worker: Worker) {
  // TODO: Need to figure out what to do with the errors here. Do we call
  // 'respondErr'? That doesn't seem correct. It's not correct because if we
  // end a query we need to let both sides know that the query was killed by
  // the kernel.

  // Technically the caller already computed these values, but it's easier to
  // compute them again than to pass them as function args.
  const isQueryUpdate = event.data.method === "queryUpdate";
  const isResponse = event.data.method === "response";

  // Check that the data field is present.
  if (!("data" in event.data)) {
    logErr("worker", mod.domain, "received response or update from worker with no data field");
    return;
  }

  // Grab the query information so that we can properly relay the worker
  // response to the original caller.
  if (!(event.data.nonce in queries)) {
    // If there's no corresponding query and this is a response, send an
    // error.
    if (isResponse === true) {
      logErr("worker", mod.domain, "received response for an unknown nonce");
      return;
    }

    // If there's no responding query and this isn't a response, it could
    // just be an accident. queryUpdates and responseUpdates are async and
    // can therefore be sent before both sides know that a query has been
    // closed but not get processed untila afterwards.
    //
    // This can't happen with a 'response' message because the response
    // message is the only message that can close the query, and there's
    // only supposed to be one response message.
    return;
  }

  // If the message is a query update, relay the update to the worker.
  if (isQueryUpdate) {
    const dest = queries[event.data.nonce].dest;
    dest.postMessage({
      nonce: event.data.nonce,
      method: event.data.method,
      data: event.data.data,
    });
    return;
  }

  // Check that the err field is being used correctly for response messages.
  if (isResponse) {
    // If the worker has sent a response, it means the query is over and the
    // worker can be terminated. We don't however terminate the persistent
    // workers.
    if (mod.isPersistent !== true) {
      worker.terminate();
    }

    // Check that the err field exists.
    if (!("err" in event.data)) {
      logErr("worker", mod.domain, "got response from worker with no err field");
      return;
    }

    // Check that exactly one of 'err' and 'data' are null.
    const errNull = event.data.err === null;
    const dataNull = event.data.data === null;
    if (errNull === dataNull) {
      logErr("worker", mod.domain, "exactly one of err and data must be null");
      return;
    }
  }

  // We are sending either a response message or a responseUpdate message,
  // all other possibilities have been handled.
  const sourceIsWorker = queries[event.data.nonce].isWorker;
  const sourceNonce = queries[event.data.nonce].nonce;
  const source = queries[event.data.nonce].source;
  const origin = queries[event.data.nonce].origin;
  const msg: any = {
    nonce: sourceNonce,
    method: event.data.method,
    data: event.data.data,
  };
  // For responses only, set an error and close out the query by deleting it
  // from the query map.
  if (isResponse) {
    msg["err"] = event.data.err;
    delete queries[event.data.nonce];
  }
  if (sourceIsWorker === true) {
    source.postMessage(msg);
  } else {
    source.postMessage(msg, origin);
  }
}

function handleQueryUpdate(event: MessageEvent) {
  // Check that the module still exists before sending a queryUpdate to
  // the module.
  if (!(event.data.nonce in queries)) {
    logErr("auth", "received queryUpdate but nonce is not recognized", event.data, queries);
    return;
  }
  const dest = queries[event.data.nonce].dest;
  dest.postMessage({
    nonce: event.data.nonce,
    method: event.data.method,
    data: event.data.data,
  });
}

export { Module, handleModuleCall, handleModuleResponse, handleQueryUpdate, modules, modulesLoading, queries };
