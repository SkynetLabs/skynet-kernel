// bootloader.ts is the bootloader for the kernel. The sole purpose of the
// bootloader is to load the user's kernel, ensuring along the way that the
// webserver is not able to maliciously inject code that could steal the user's
// seed.
//
// Throughout the bootloader, there are places where we need to do friviolous
// null checks and use types 'as any' due to typescript seemingly not
// understanding the types involved when working with the webbrowser. I'd like
// to fix it, but it fell off of the priorities list. They've been marked with
// the comment 'tsc'. We've tried to avoid them as much as possible, and if you
// know how to get rid of these exceptions, we'd love to see a pull request.

import {
  Ed25519Keypair,
  Err,
  addContextToErr,
  b64ToBuf,
  bufToHex,
  bufToStr,
  computeRegistrySignature,
  defaultPortalList,
  deriveChildSeed,
  deriveRegistryEntryID,
  downloadSkylink,
  entryIDToSkylink,
  hexToBuf,
  objAsString,
  progressiveFetch,
  progressiveFetchResult,
  taggedRegistryEntryKeys,
  verifyRegistryWriteResponse,
} from "libskynet";

declare let browser: any; // tsc

// Establish the skylink of the default kernel.
const defaultKernelResolverLink = "AQBFjXpEBwbMwkBwYg0gdkeAM-yy9vlajfLtZSee9f-MDg";

// Set a title and a message which indicates that the page should only be
// accessed via an invisible iframe.
document.title = "kernel.skynet";
const header = document.createElement("h1");
header.textContent =
  "Something went wrong! You should not be visiting this page, this page should only be accessed via an invisible iframe.";
document.body.appendChild(header);

// bootloaderWLog is a function that gets wrapped by bootloaderLog and
// bootloaderErr.
function bootloaderWLog(isErr: boolean, ...inputs: any) {
  // Build the message, each item gets its own line. We do this because items
  // are often full objects.
  let message = "[skynet-kernel-bootloader]";
  for (let i = 0; i < inputs.length; i++) {
    message += "\n";
    message += objAsString(inputs[i]);
  }

  // Create the log by sending it to the parent.
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
// Establish logging functions for the bootloader. The bootloader is in an
// iframe and can't console.log directly, so instead we need to send a message
// to the background and request that the background create the log message.
function log(...inputs: any) {
  bootloaderWLog(false, ...inputs);
}
function logErr(...inputs: any) {
  bootloaderWLog(true, ...inputs);
}

// Set up the message handler that will process messages coming from pages or
// from the background script.
//
// NOTE: For some reason, calling this function 'handleMessage' seems to break
// everything, so we call it 'handleIncomingMessage' instead.
let handleIncomingMessage = function (event: MessageEvent) {
  if (event.source === null) {
    // tsc
    return;
  }
  if (event.source === window) {
    // We want to ignore messages that are coming from ourself.
    return;
  }

  // Check that there's a nonce.
  if (!("nonce" in event.data)) {
    (event.source as WindowProxy).postMessage(
      {
        nonce: "N/A",
        method: "response",
        err: "message sent to kernel with no nonce",
      },
      event.origin
    );
    return;
  }

  // Check that there's a method.
  if (!("method" in event.data)) {
    (event.source as WindowProxy).postMessage(
      {
        nonce: event.data.nonce,
        method: "response",
        err: "message sent to kernel with no method",
      },
      event.origin
    );
    return;
  }

  // Create default handlers for the requestOverride and proxyInfo
  // methods. These methods are important during bootloading to ensure
  // that the default login page can be loaded for the user.
  if (event.data.method === "requestOverride") {
    handleSkynetKernelRequestOverride(event);
    return;
  }

  // Message that the method was not recognized.
  (event.source as WindowProxy).postMessage(
    {
      nonce: event.data.nonce,
      method: "response",
      err: "unrecognized method (user may need to log in): " + event.data.method,
    },
    event.origin
  );
  return;
};
window.addEventListener("message", (event: MessageEvent) => {
  handleIncomingMessage(event);
});

// handleSkynetKernelRequestOverride will respond to a request override
// message. This method will only respond to the browser extension, and it is
// used to trustlessly load the favicon.ico and the kernel auth page.
//
// As part of initializing this function, we launch a promise that fetches the
// favicon and the auth page so that we may send them to the background script
// at runtime.
let kernelFavicon: Uint8Array;
const blockForFavicon: Promise<void> = new Promise((resolve) => {
  // We wrap this whole block in a try-catch block to handle the case where
  // "icon@2x.png" is not available. This can happen in 'browser' is not
  // defined, which will happen if the bootloader is running on skt.us
  // instead of in an extension.
  try {
    const faviconURL = browser.runtime.getURL("icon@2x.png");
    fetch(faviconURL).then((response) => {
      response.arrayBuffer().then((faviconData) => {
        kernelFavicon = new Uint8Array(faviconData);
        resolve();
      });
    });
  } catch {
    kernelFavicon = new Uint8Array(0);
    resolve();
  }
});
let kernelAuthPage: Uint8Array;
const blockForAuthPage: Promise<void> = new Promise((resolve) => {
  // We wrap this whole block in a try-catch block to handle the case where
  // "auth.html" is not available. This can happen in 'browser' is not
  // defined, which will happen if the bootloader is running on skt.us
  // instead of in an extension.
  try {
    const authURL = browser.runtime.getURL("auth.html");
    fetch(authURL).then((response) => {
      response.arrayBuffer().then((authData) => {
        kernelAuthPage = new Uint8Array(authData);
        resolve();
      });
    });
  } catch (err: any) {
    kernelAuthPage = new TextEncoder().encode(addContextToErr(err, "unable to load the kernel auth page"));
    resolve();
  }
});
let handleSkynetKernelRequestOverride = function (event: MessageEvent) {
  if (event.source === null) {
    // tsc
    return;
  }

  // Only a browser extension is allowed to call requestOverride.
  if (!event.origin.startsWith("moz")) {
    return;
  }
  // Check that this is for a GET request, all other types are not handled.
  if (event.data.data.method !== "GET") {
    return;
  }

  // Establish the standard headers that we respond with.
  const respondOverride = function (headers: any, body: Uint8Array) {
    (event.source as WindowProxy).postMessage(
      {
        nonce: event.data.nonce,
        method: "response",
        err: null,
        data: {
          override: true,
          headers,
          body,
        },
      },
      event.origin
    );
  };

  // Set up a return value for the favicon.
  if (event.data.data.url === "http://kernel.skynet/favicon.ico") {
    blockForFavicon.then(() => {
      const headers = [
        {
          name: "content-type",
          value: "image/png",
        },
      ];
      respondOverride(headers, kernelFavicon);
    });
    return;
  }

  // Set up a return value for the auth page.
  if (event.data.data.url === "http://kernel.skynet/auth.html") {
    blockForAuthPage.then(() => {
      const headers = [
        {
          name: "content-type",
          value: "text/html; charset=utf8",
        },
      ];
      respondOverride(headers, kernelAuthPage);
    });
    return;
  }

  // The override request was not recognized, tell the extension not to
  // override this file.
  (event.source as WindowProxy).postMessage(
    {
      nonce: event.data.nonce,
      method: "response",
      err: null,
      data: {
        override: false,
      },
    },
    event.origin
  );
};

// Establish a handler for storage events. The kernel is intended to overwrite
// this handler after the kernel has loaded, therefore the name 'handleStorage'
// is part of the bootloading protocol and cannot be changed.
//
// handleStorage primarily listens for changes to the user seed that indicate
// that the user has either logged in or logged out.
const handleStorage = function (event: StorageEvent) {
  // Ignore any storage events that don't include v1-seed. The 'null' key
  // means that all storage entries were wiped, which does include changes to
  // v1-seed.
  if (event.key !== null && event.key !== "v1-seed") {
    return;
  }
  // If the user is already logged out, ignore the message as we should wait
  // until we've refreshed.
  if (logoutComplete === true) {
    window.location.reload();
    return;
  }

  // If the storage was wiped but the user is already not logged in, nothing
  // needs to happen.
  if (event.key === null && loginComplete === false) {
    return;
  }

  // If the user is not logged in and this is a v1-seed change, it means that
  // the user is now logged in.
  if (event.key === "v1-seed" && loginComplete === false) {
    // First load the new seed. If there's an error loading the seed,
    // assume the storage event was not a login event. If collecting the
    // seed fails, send an auth update again to assert to any listeners
    // that login failed.
    const userSeedString = window.localStorage.getItem("v1-seed");
    if (userSeedString === null) {
      sendAuthUpdate();
      return;
    }
    // Get the seed and convert it from hex to a Uint8Array.
    const [decodedSeed, errHTB] = hexToBuf(userSeedString);
    if (errHTB !== null) {
      // Log the error and report the user as not logged in.
      logErr(addContextToErr(errHTB, "seed could not be decoded from hex"));
      sendAuthUpdate();
      return;
    }
    // Set the global 'userSeed' object.
    userSeed = decodedSeed;

    log("user is now logged in, attempting to load kernel");
    loginComplete = true;
    loadKernel();
    sendAuthUpdate();
    return;
  }

  // The other two cases are where the user was already logged in and then
  // either v1-seed changed or all variables were deleted (which includes
  // v1-seed being changed). We set logoutComplete to true and then we
  // refresh the kernel, resetting the auth cycle.
  //
  // We refresh the kernel upon logout because we want to ensure that no
  // settings or private data leaks between different user account logins of
  // the kernel.
  logoutComplete = true;
  sendAuthUpdate();
  log("attempting to do a page reload");
  window.location.reload();
};
window.addEventListener("storage", (event) => handleStorage(event));

// downloadKernel will take the skylink for a kernel distro, download
// that kernel, and return the code that can be eval'd to load the kernel.
function downloadKernel(kernelSkylink: string): Promise<[kernelCode: string, err: Err]> {
  return new Promise((resolve) => {
    downloadSkylink(kernelSkylink).then(([fileData, err]) => {
      // Don't add any context to a 404 error.
      if (err === "404") {
        resolve(["", err]);
        return;
      }

      // Check the error.
      if (err !== null) {
        resolve(["", addContextToErr(err, "unable to download the default kernel")]);
        return;
      }

      // Decode the fileData to text and return the text.
      const [kernelCode, errBBTS] = bufToStr(fileData);
      if (errBBTS !== null) {
        resolve(["", addContextToErr(err, "unable to decode the default kernel")]);
        return;
      }
      resolve([kernelCode, null]);
    });
  });
}

// downloadDefaultKernel will attempt to download the default kernel
// and return the code that can be eval'd.
function downloadDefaultKernel(): Promise<[kernelCode: string, err: Err]> {
  return downloadKernel(defaultKernelResolverLink);
}

// setUserKernelAsDefault will set the user's kernel to be the default kernel.
//
// There is no return value for this function, if it doesn't work leave a log
// message.
function setUserKernelAsDefault(keypair: Ed25519Keypair, dataKey: Uint8Array) {
  // Log that we are setting the user's kernel.
  log("user kernel not found, setting user kernel to " + defaultKernelResolverLink);

  // Get the defaultKernelSkylink as a Uint8Array, which will be the data of
  // the registry entry that we need to write.
  const [defaultKernelSkylink, err64] = b64ToBuf(defaultKernelResolverLink);
  if (err64 !== null) {
    log("unable to convert default kernel link to a Uint8Array");
    return;
  }

  // Get the encoded data and signature.
  const [sig, errCRS] = computeRegistrySignature(keypair.secretKey, dataKey, defaultKernelSkylink, 0n);
  if (errCRS !== null) {
    log(addContextToErr(errCRS, "unable to compute registry signature to set user kernel"));
    return;
  }

  // Compute the parameters of the fetch call.
  const dataKeyHex = bufToHex(dataKey);
  const endpoint = "/skynet/registry";
  const postBody = {
    publickey: {
      algorithm: "ed25519",
      key: Array.from(keypair.publicKey),
    },
    datakey: dataKeyHex,
    revision: 0,
    data: Array.from(defaultKernelSkylink),
    signature: Array.from(sig),
  };
  const fetchOpts = {
    method: "post",
    body: JSON.stringify(postBody),
  };

  // Perform the fetch call.
  progressiveFetch(endpoint, fetchOpts, defaultPortalList, verifyRegistryWriteResponse).then(
    (result: progressiveFetchResult) => {
      // Return an error if the call failed.
      if (result.success !== true) {
        log("unable to update the user kernel registry entry\n", result.logs);
        return;
      }
      log("successfully updated the user kernel registry entry to the default kernel");
    }
  );
}

// downloadUserKernel will download the user's kernel and return the
// code that can be eval'd.
function downloadUserKernel(): Promise<[kernelCode: string, err: Err]> {
  return new Promise((resolve) => {
    // Create a child seed for working with the user's kernel entry. We
    // create a child seed here so that the user's kernel entry seed can be
    // exported without exposing the user's root seed. It's unlikely that
    // this will ever matter, but it's also trivial to implement.
    const kernelEntrySeed = deriveChildSeed(userSeed, "userPreferredKernel2");

    // Get the registry keys.
    const [keypair, dataKey, errTREK] = taggedRegistryEntryKeys(kernelEntrySeed, "user kernel");
    if (errTREK !== null) {
      resolve(["", addContextToErr(errTREK, "unable to create user kernel registry keys")]);
      return;
    }

    // Get the entry id for the user's kernel entry.
    const [entryID, errREID] = deriveRegistryEntryID(keypair.publicKey, dataKey);
    if (errREID !== null) {
      resolve(["", addContextToErr(errREID, "unable to derive registry entry id")]);
      return;
    }
    const userKernelSkylink = entryIDToSkylink(entryID);

    // Perform the download of the user kernel. If the user kernel is a 404, we
    // need to establish the default kernel of this  as the user's
    // kernel.
    //
    // We do this so that the user's first experience will be mirrored on any
    // other device they use to load Skynet. If the user wishes to change to a
    // new kernel from the one they initially bootstrapped to, they can do so
    // and then they won't see this  again. But at the very least, a
    // naive user will have the same experience every time when using Skynet
    // until they intentionally change their kernel.
    downloadKernel(userKernelSkylink).then(([kernelCode, err]) => {
      // If the error is a 404, we need to set the default kernel of the
      // user and then return the download for the default kernel.
      if (err === "404") {
        downloadDefaultKernel().then(([defaultCode, errDefault]) => {
          if (errDefault === null) {
            setUserKernelAsDefault(keypair, dataKey);
          }
          resolve([defaultCode, errDefault]);
          return;
        });
        return;
      }
      log("found user kernel, using: " + userKernelSkylink);

      // The error is not a 404, therefore use the result of the download
      // directly as the resolve/return values.
      resolve([kernelCode, err]);
    });
  });
}

// loadKernel will download the kernel code and eval it.
function loadKernel() {
  downloadUserKernel().then(([kernelCode, err]) => {
    if (err !== null) {
      const extErr = addContextToErr(err, "unable to download kernel");
      kernelLoaded = extErr;
      logErr(extErr);
      sendAuthUpdate();
      return;
    }

    // Download was successful, time to eval the result.
    try {
      eval(kernelCode);
      kernelLoaded = "success";
      sendAuthUpdate();
      log("kernel successfully loaded");
      return;
    } catch (err: any) {
      const extErr = addContextToErr(err, "unable to eval kernel");
      kernelLoaded = extErr;
      logErr(extErr);
      logErr(err.toString());
      console.error(extErr);
      console.error(err);
      sendAuthUpdate();
      return;
    }
  });
}

// bootloaderSendAuthUpdate will send a message containing an auth update,
// letting any listeners know the updated auth state. The auth state has five
// stages that are covered by three variables.
//
// Stage 0; no auth updates
// Stage 1: bootloader is loaded, user is not yet logged in
// Stage 2: bootloader is loaded, user is logged in
// Stage 3: kernel is loaded, user is logged in
// Stage 4: kernel is loaded, user is logging out (refresh iminent)
let loginComplete = false;
let logoutComplete = false;
let kernelLoaded = "not yet";
function sendAuthUpdate() {
  window.parent.postMessage(
    {
      method: "kernelAuthStatus",
      data: {
        loginComplete: loginComplete,
        kernelLoaded: kernelLoaded,
        logoutComplete: logoutComplete,
      },
    },
    "*"
  );
}

// checkForLoadKernel will check that the user seed is available, and if so it
// will load the kernel. If not it will report that the user is not logged in
// and go idle.
let userSeed: Uint8Array;
function checkForLoadKernel() {
  // Try fetching the user seed.
  const userSeedString = window.localStorage.getItem("v1-seed");
  if (userSeedString === null) {
    sendAuthUpdate();
    return;
  }
  // Get the seed and convert it from hex to a Uint8Array.
  const [decodedSeed, errHTB] = hexToBuf(userSeedString);
  if (errHTB !== null) {
    // Log the error and report the user as not logged in.
    logErr(addContextToErr(errHTB, "seed could not be decoded from hex"));
    sendAuthUpdate();
    return;
  }
  // Set the global 'userSeed' object.
  userSeed = decodedSeed;

  // User is logged in, attempt to load the kernel. Before loading the
  // kernel, inform any listeners that auth was successful.
  log("user is already logged in, attempting to load kernel");
  loginComplete = true;
  sendAuthUpdate();
  loadKernel();
}

// If the browser supports requesting storage access, try to get storage
// access. Otherwise, the user will need to disable strict privacy in their
// browser for skt.us to work. If the user has the extension, disabling strict
// privacy is not needed.
const accessFailedStr = "unable to get access to localStorage, user may need to reduce their privacy settings";
if (Object.prototype.hasOwnProperty.call(document, "requestStorageAccess") && window.origin === "https://skt.us") {
  document
    .requestStorageAccess()
    .then(() => {
      checkForLoadKernel();
    })
    .catch((err) => {
      log(addContextToErr(err, accessFailedStr));
      sendAuthUpdate();
    });
} else {
  checkForLoadKernel();
}
