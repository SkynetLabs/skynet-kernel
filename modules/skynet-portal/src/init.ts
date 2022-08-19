// init.ts is responsible for forming connections with all of the user's
// portals. It also handles bootstrapping, which is the process that occurs if
// the user does not yet have any preferred portals.
//
// There is a global 'initComplete' promise which will resolve either when the
// first portal successfully connects, or when all portals have experienced a
// connection error. The 'initComplete' promise does not indicate that all is
// well, as new errors could have occurred which resulted previously available
// portals to become unavailable, or result in previously unavailable portals
// to become avaialble. External callers can access this function through
// 'blockForInit'.

import {
  DataFn,
  Err,
  addContextToErr,
  checkObjProps,
  getDataFromKernel,
  getSeed,
  logErr,
  objAsString,
} from "libkmodule";
import {
  Ed25519Keypair,
  ErrTracker,
  HistoricErr,
  SkynetPortal,
  bufToHex,
  deriveChildSeed,
  ed25519KeypairFromEntropy,
  ed25519Sign,
  hexToBuf,
  jsonStringify,
  newErrTracker,
  sha512,
} from "libskynet";

// TODO: Need to start using kernel defaults again instead of overriding them
// with siasky.xyz

// PortalConnection defines a portal that the module is trying to connect to.
// If there is an active connection, 'authToken' will be set to a string value,
// otherwise it will be set to 'null'.
interface PortalConnection {
  // General information about the portal.
  portal: SkynetPortal;

  // Information about the latest auth attempt. The initial value of loginErr
  // indicates that no login has been attempted yet, and the authToken and date
  // will both be null.
  //
  // After the first login attempt, loginDate will always be set to the time
  // that the most recent login attempt began.
  authToken: string | null;
  loginDate: Date | null;
  loginErr: Err;

  // Any errors that have occurred in the past will be stored here.
  oldErrs: ErrTracker;
}

// PortalConnectionSummary is a transformed version of the PortalConnection
// that can be cloned and sent over postMessage. The basic PortalConnection
// type cannot be cloned.
interface PortalConnectionSummary {
  portal: SkynetPortal;
  authToken: string | null;
  loginDate: Date | null;
  loginErr: Err;
  oldErrs: HistoricErr[];
}

// portalMap maps from a portal name to the PortalConnection object. It
// contains all PortalConnections that are being actively maintained.
const portalMap: any = {};

// initComplete is a promise that will resolve when either one portal has been
// connected to successfully, or when
let initResolved = false;
let resolveInit: DataFn;
const initComplete: Promise<void> = new Promise((resolve) => {
  resolveInit = resolve;
});

// init is a promise that will block until init is complete. Once init is
// complete, it checks whether there is at least one portal available. If there
// is at least one portal available, 'null' is returned. If no portals are
// available, an error will be returned.
async function blockForInit(): Promise<Err> {
  // Block until init is complete. initComplete resolves when the first portal
  // is available, or when all portals have experienced an error. We don't want
  // to return an init value before the module has had a chance to load.
  await initComplete;

  // We know that the module has loaded, but that may have been a long time
  // ago. We need to iterate through the portalMap and see if any portals are
  // currently working. We return an error if none are working.
  const keys = Object.keys(portalMap);
  for (let i = 0; i < keys.length; i++) {
    if (portalMap[keys[i]].loginErr === null) {
      return null;
    }
  }
  return "could not connect to Skynet; all portals are unreachable";
}

// viewPortalConnections will provide an array of all the currently active
// portal connections.
function viewPortalConnections(): PortalConnectionSummary[] {
  const portalConnections: PortalConnectionSummary[] = [];
  const keys = Object.keys(portalMap);
  for (let i = 0; i < keys.length; i++) {
    const pc = portalMap[keys[i]];
    portalConnections.push({
      portal: pc.portal,
      authToken: pc.authToken,
      loginDate: pc.loginDate,
      loginErr: pc.loginErr,
      oldErrs: pc.oldErrs.viewErrs(),
    });
  }
  return portalConnections;
}

// init is the init function for the portal module. For now, it connects to all
// of the bootstrap portals. Eventually, it'll use localStorage and the user's
// storage to identify the user's portals and connect to those.
async function init(): Promise<void> {
  // Get the list of portals so we can try connecting to them.
  const [portals, errGUPL] = await getUserPortalList();
  if (errGUPL !== null) {
    initResolved = true;
    resolveInit();
    return;
  }

  // If no portals were found, there's nothing we can do.
  if (portals.length === 0) {
    initResolved = true;
    resolveInit();
    return;
  }

  // TODO: We may want to have some filtering mechanism here which chooses a
  // set of portals to connect to rather than connecting to all of them.

  // For each portal that we wish to connect to, deterministically generate a
  // keypair that we can use to authenticate with the portal. We assume that we
  // have already created an account with this portal, and if we have not we
  // will fall back to the account creation process.
  //
  // We open connections with all of the portals at the same time, and the
  // connectToPortals promise will resolve when one of them finishes connecting
  // successfully.
  for (let i = 0; i < portals.length; i++) {
    // Add this portal to the portalMap.
    const pc: PortalConnection = {
      portal: portals[i],

      authToken: null,
      loginDate: null,
      loginErr: "login not yet attempted",

      oldErrs: newErrTracker(),
    };
    portalMap[portals[i].name] = pc;

    // Try to connect to the portal.
    connectToPortal(portals[i], true);
  }
  return;
}

// getUserPortalList is a bootstrapping function which uses the default portals
// to fetch the list of portals that are preferred by the user. Until we have
// that list, we can't know what they are, so we have to start by sending
// messages to the default portals.
//
// TODO: Uncomment this to use the full set of portals. We are waiting on some
// code updates to be shipped before enabling this.
async function getUserPortalList(): Promise<[SkynetPortal[], Err]> {
  return new Promise(async (resolve) => {
    // The portal module expects to receive a seed and also a list of potential
    // portals from the kernel.
    /*
    const dataFromKernel = await getDataFromKernel();

    // Check that the kernel supplied a list of portals.
    if (Array.isArray(dataFromKernel.bootstrapPortals) !== true) {
      resolve([[], "did not receive valid portal list from kernel"]);
    }
    resolve([dataFromKernel.bootstrapPortals, null]);
   */
    resolve([[{ name: "siasky.xyz", url: "https://siasky.xyz" }], null]);
  });
}

// connectToPortal is an async function which will attempt to connect to a
// portal. The optional input 'isMain' is used to indicate that this is a
// "main" connect attempt, meaning it should trigger another connect attempt in
// 15 minutes.
async function connectToPortal(portal: SkynetPortal, isMain?: boolean): Promise<void> {
  // We will retry connecting to this portal every 15 minutes. If we aren't
  // connected yet, we get to try again. If we are connected, we get to refresh
  // our auth token.
  //
  // We should only queue an event to try again if this isn't a retry.
  if (isMain === true) {
    // Set up a function to run the connect function again in 15 minutes.
    setTimeout(() => {
      connectToPortal(portal, true);
    }, 15 * 60 * 1000);
  }
  logErr("connecting to portal");

  // Contact the portal with the pubkey in an attempt to sign in.
  const keypair = await portalKeypair(portal);
  const pubkeyHex = bufToHex(keypair.publicKey);
  const query = accountURL(portal) + "/api/login?pubKey=" + pubkeyHex;
  fetch(query)
    .then((response: Response) => {
      // If we get a 400, we're going to try registering under the assumption
      // that the 400 indicates an unknown user.
      if (response.status === 400) {
        // If this is the main thread, we can attempt to register an account
        // with the portal. Otherwise this thread probably was called after
        // performing a registration, and we don't want to try again.
        if (isMain === true) {
          logErr("trying account creation");
          createPortalAccount(portal);
          return;
        }

        // If this is not the main thread, we should have already attempted
        // registration by now and we should just give up and submit an error.
        portalConnectionFailed(portal, "login failed after attempting registration");
        return;
      }

      // If the response code isn't 400 and it isn't 200, we don't recognize it
      // and we want to log an error.
      if (response.status !== 200) {
        logErr("got non 200 status code");
        const errStr = "login failed with unrecognized status code: " + response.status.toString();
        portalConnectionFailed(portal, errStr);
        return;
      }

      // Parse the response and respond to the login challenge.
      logErr("responding to challenge");
      response
        .json()
        .then((j: any) => {
          respondToLoginChallenge(portal, keypair, j);
        })
        .catch((err: any) => {
          const errStr = addContextToErr(objAsString(err), "error while trying to login");
          portalConnectionFailed(portal, errStr);
        });
    })
    .catch((err: any) => {
      portalConnectionFailed(portal, addContextToErr(objAsString(err), "login query to portal failed"));
    });
}

// portalConnectionFailed will handle a portal that failed to connect. It will
// update the PortalConnection object and if necessary resolve the
// connectPromise.
function portalConnectionFailed(portal: SkynetPortal, err: Err): void {
  // Add the error information to the portalMap.
  portalMap[portal.name].authToken = null;
  portalMap[portal.name].loginDate = new Date();
  portalMap[portal.name].loginErr = err;
  portalMap[portal.name].oldErrs.addErr(err);

  // If init has completed, we are done. Otherwise we need to check whether
  // this portal is the final portal to fail, meaning that init is now
  // complete.
  if (initResolved === true) {
    return;
  }

  // Check all other portals in portalMap and see if there are any that haven't
  // resolved yet.
  const keys = Object.keys(portalMap);
  for (let i = 0; i < keys.length; i++) {
    // If the loginDate of one of the portals is set to 'null', it means that
    // the login attempt hasn't completed yet, and we aren't ready to resolve
    // the init promise.
    if (portalMap[keys[i]].loginDate === null) {
      return;
    }
  }

  // None of the portals had an unresolved loginDate, we must be the last
  // portal. We can resolve the init promise.
  initResolved = true;
  resolveInit();
}

// portalConnectionSuccessful will mark that a successful connection has been
// made to a portal.
function portalConnectionSuccessful(portal: SkynetPortal, authToken: any) {
  // Update the portal in the portalMap.
  portalMap[portal.name].authToken = authToken;
  portalMap[portal.name].loginDate = new Date();
  portalMap[portal.name].loginErr = null;

  // If init has not yet been resolved, this means we are the first successful
  // portal and we can resolve the init promise.
  if (initResolved !== true) {
    initResolved = true;
    resolveInit();
  }
}

// portalKeypair will derive a keypair for the provided portal, using the
// provided seed.
async function portalKeypair(portal: SkynetPortal): Promise<Ed25519Keypair> {
  // The error is ignored for the ed25519KeypairFromEntropy call because the
  // implementation leaves no room for error if it is called correctly.
  const seed = await getSeed();
  const portalSeed = deriveChildSeed(seed, "userPortalKey" + portal.name);
  const keypairEntropy = sha512(portalSeed).slice(0, 32);
  const [keypair] = ed25519KeypairFromEntropy(keypairEntropy);
  return keypair;
}

// accountURL will return the URL of the accounts API on a portal. Basically we
// just prepend an 'account' subdomain to the portal domain.
function accountURL(portal: SkynetPortal): string {
  const portalURL = new URL(portal.url);
  const protocol = portalURL.protocol;
  const hostname = portalURL.hostname;
  return protocol + "//" + "account." + hostname;
}

// createPortalAccount will create a new account with the portal using the
// user's deterministically derived pubkey.
async function createPortalAccount(portal: SkynetPortal): Promise<void> {
  // Call 'register' with the user's pubkey to receive a registration
  // challenge.
  const keypair = await portalKeypair(portal);
  const pubkeyHex = bufToHex(keypair.publicKey);
  const query = accountURL(portal) + "/api/register?pubKey=" + pubkeyHex;
  fetch(query)
    .then((response: Response) => {
      // Check the status code, if it's not 200 it means something unexpected
      // is happening and an error needs to be returned.
      if (response.status !== 200) {
        response
          .text()
          .then((t: string) => {
            const errStr = addContextToErr(t, "error when calling register");
            portalConnectionFailed(portal, errStr);
          })
          .catch((err: any) => {
            const errStr = addContextToErr(objAsString(err), "error parsing register GET response");
            portalConnectionFailed(portal, errStr);
          });
        return;
      }

      // Extract the json response, it should contain a challenge.
      response
        .json()
        .then((j: any) => {
          respondToRegistrationChallenge(portal, keypair, j);
        })
        .catch((err: any) => {
          const errStr = addContextToErr(objAsString(err), "error while trying to register");
          portalConnectionFailed(portal, errStr);
        });
    })
    .catch((err: any) => {
      const errStr = addContextToErr(objAsString(err), "error when calling register endpoint");
      portalConnectionFailed(portal, errStr);
    });
}

// respondToRegistrationChallenge attempts to respond to a registration
// challenge that is provided by the portal. The registrationResponse at this
// point has not been verified, and therefore could be any object.
function respondToRegistrationChallenge(portal: SkynetPortal, keypair: Ed25519Keypair, registrationResponse: any) {
  // First verify that the registration response contains a valid challenge.
  const errCOP = checkObjProps(registrationResponse, [["challenge", "string"]]);
  if (errCOP !== null) {
    const errStr = addContextToErr(errCOP, "registration response failed type checks");
    portalConnectionFailed(portal, errStr);
    return;
  }

  // Convert the challenge into the message that needs to be signed.
  const [challengeBytes, errHTB] = hexToBuf(registrationResponse.challenge);
  if (errHTB !== null) {
    const errStr = addContextToErr(errHTB, "unable to decode registration challenge");
    portalConnectionFailed(portal, errStr);
    return;
  }
  const challengeType = new TextEncoder().encode("skynet-portal-register");
  const recipient = new TextEncoder().encode(portal.url);
  const message = new Uint8Array(challengeBytes.length + challengeType.length + recipient.length);
  message.set(challengeBytes, 0);
  message.set(challengeType, challengeBytes.length);
  message.set(recipient, challengeBytes.length + challengeType.length);

  // Create the signature.
  const [sig, errES] = ed25519Sign(message, keypair.secretKey);
  if (errES !== null) {
    const errStr = addContextToErr(errES, "unable to sign challenge");
    portalConnectionFailed(portal, errStr);
    return;
  }
  // We invent a fake email since there's no way to contact us over email. The
  // portals are not coded to check that the email is real, and eventually they
  // won't even require an email at all.
  const emailHex = bufToHex(keypair.publicKey.slice(0, 12));

  // Construct the post body for our response to the portal's challenge.
  const postBody = {
    response: bufToHex(message),
    signature: bufToHex(sig),
    email: emailHex + "@gmail.com",
  };
  const [postJSON, errJS] = jsonStringify(postBody);
  if (errJS !== null) {
    const errStr = addContextToErr(errJS, "unable to stringify postBody");
    portalConnectionFailed(portal, errStr);
    return;
  }

  // Construct the fetch call to respond to the registration challenge.
  const fetchOpts = {
    method: "post",
    body: postJSON,
  };
  const query = accountURL(portal) + "/api/register";
  fetch(query, fetchOpts)
    .then((response: Response) => {
      // Check the response code for an unrecognized result.
      if (response.status !== 200) {
        response
          .text()
          .then((t: string) => {
            const errStr = addContextToErr(t, "error when calling register");
            portalConnectionFailed(portal, errStr);
          })
          .catch((err: any) => {
            const errStr = addContextToErr(objAsString(err), "error parsing register GET response");
            portalConnectionFailed(portal, errStr);
          });
        return;
      }

      // Login complete, try connecting to the portal.
      portalMap[portal.name].registrationAttempted = true;
      connectToPortal(portal);
    })
    .catch((err: any) => {
      const errStr = addContextToErr(err, "unable to post response to registration challenge");
      portalConnectionFailed(portal, errStr);
      return;
    });
}

// respondToLoginChallenge attempts to respond to a login challenge that is
// provided by the portal. The loginResponse at this point has not been
// verified, and therefore could be any object.
function respondToLoginChallenge(portal: SkynetPortal, keypair: Ed25519Keypair, loginResponse: any) {
  // First verify that the registration response contains a valid challenge.
  const errCOP = checkObjProps(loginResponse, [["challenge", "string"]]);
  if (errCOP !== null) {
    const errStr = addContextToErr(errCOP, "login response failed type checks");
    portalConnectionFailed(portal, errStr);
    return;
  }

  // Convert the challenge into the message that needs to be signed.
  const [challengeBytes, errHTB] = hexToBuf(loginResponse.challenge);
  if (errHTB !== null) {
    const errStr = addContextToErr(errHTB, "unable to decode login challenge");
    portalConnectionFailed(portal, errStr);
    return;
  }
  const challengeType = new TextEncoder().encode("skynet-portal-login");
  const recipient = new TextEncoder().encode(portal.url);
  const message = new Uint8Array(challengeBytes.length + challengeType.length + recipient.length);
  message.set(challengeBytes, 0);
  message.set(challengeType, challengeBytes.length);
  message.set(recipient, challengeBytes.length + challengeType.length);

  // Create the signature.
  const [sig, errES] = ed25519Sign(message, keypair.secretKey);
  if (errES !== null) {
    const errStr = addContextToErr(errES, "unable to sign challenge");
    portalConnectionFailed(portal, errStr);
    return;
  }

  // Construct the post body for our response to the portal's challenge.
  const postBody = {
    response: bufToHex(message),
    signature: bufToHex(sig),
  };
  const [postJSON, errJS] = jsonStringify(postBody);
  if (errJS !== null) {
    const errStr = addContextToErr(errJS, "unable to stringify postBody");
    portalConnectionFailed(portal, errStr);
    return;
  }

  // Construct the fetch call to respond to the registration challenge.
  const fetchOpts = {
    method: "post",
    body: postJSON,
  };
  const query = accountURL(portal) + "/api/login";
  fetch(query, fetchOpts)
    .then((response: Response) => {
      // Check the response code for an unrecognized result.
      if (response.status !== 204) {
        logErr("login response status:", response.status);
        response
          .text()
          .then((t: string) => {
            const errStr = addContextToErr(t, "error when calling login");
            portalConnectionFailed(portal, errStr);
          })
          .catch((err: any) => {
            const errStr = addContextToErr(objAsString(err), "error parsing login POST response");
            portalConnectionFailed(portal, errStr);
          });
        return;
      }

      const authToken = response.headers.get("Skynet-Token");
      portalConnectionSuccessful(portal, authToken);
    })
    .catch((err: any) => {
      const errStr = addContextToErr(err, "unable to post response to login challenge");
      portalConnectionFailed(portal, errStr);
      return;
    });
}

export { blockForInit, init, viewPortalConnections };
