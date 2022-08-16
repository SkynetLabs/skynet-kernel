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
  SkynetPortal,
  bufToHex,
  deriveChildSeed,
  ed25519KeypairFromEntropy,
  ed25519Sign,
  hexToBuf,
  jsonStringify,
  sha512,
} from "libskynet";

// TODO: Need to have some sort of refresh mechanism so that we refresh the
// auth token every couple of hours.

// TODO: Need to add web3portal.com back to the stack.

// TODO: This file does the bootstrapping but doesn't end up looking for actual
// user portal information.

// PortalConnection defines a portal that the portal module has attempted to
// connect to. If the connection is successful, it will contain usage and
// debugging information about the connection. If the connection is not
// successful, it will contain errors.
//
// If 'connectAttempted' is set to false it means that the portal has not
// connected yet and the rest of the object will be empty. If 'connectErr' is
// not null (meaning there was an error connecting), the rest of the object
// will be empty.
interface PortalConnection {
  portal: SkynetPortal;

  registrationAttempted: boolean;
  connectAttempted: boolean;
  connectErr: Err;

  authToken: any;
}

// portalMap maps from a portal name to the PortalConnection object.
const portalMap: any = {};

// connect returns a promise that will resolve when the module has connected to
// the user's portal. The function is structured to be similar to 'getSeed'.
//
// In order to connect, we need to discover the user's preferred portals, which
// can happen either via storage APIs or via the bootstrap portals.
//
// The actually steps to connect to the user's portals require some
// bootstrapping, similar to how the bootloader requires bootstrapping. We
// start by determinstically generating authentication credentials for
// skynetfree.net, which is the main portal that we prefer to use. Because the
// credentials are generated deterministically, we will find out if the user
// already has an account on skynetfree.net.
//
// We then use skynetfree.net to look for the user's list of preferred portals,
// and we connect to the user's preferred set of portals.
let connectResolved = false;
let failuresRemaining = 1;
let resolveConnectPromise: DataFn;
const connectPromise: Promise<Err> = new Promise((resolve) => {
  resolveConnectPromise = resolve;
});
function connect(): Promise<Err> {
  return connectPromise;
}

// viewPortalConnections will provide an array of all the currently active
// portal connections.
function viewPortalConnections(): PortalConnection[] {
  const portalConnections: PortalConnection[] = [];
  const keys = Object.keys(portalMap);
  for (let i = 0; i < keys.length; i++) {
    portalConnections.push(portalMap[keys[i]]);
  }
  return portalConnections;
}

// connectToPortals is a function for the portal-dac that ensures the module is
// always connected to at least one portal.
//
// NOTE: This function will be overhauled once we support localStorage for
// bootstrap portals.
function connectToPortals(): void {
  (async () => {
    // Get the list of portals so we can try connecting to them.
    const [portals, errGUPL] = await getUserPortalList();
    if (errGUPL !== null) {
      connectResolved = true;
      resolveConnectPromise(addContextToErr(errGUPL, "unable to get portal list from kernel"));
      return;
    }

    // If no portals were found, there's nothing we can do.
    if (portals.length === 0) {
      connectResolved = true;
      resolveConnectPromise("no portals were provided by the kernel");
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
    failuresRemaining = portals.length;
    for (let i = 0; i < portals.length; i++) {
      // Add this portal to the portalMap.
      const pc: PortalConnection = {
        portal: portals[i],

        registrationAttempted: false,
        connectAttempted: false,
      } as PortalConnection;
      portalMap[portals[i].name] = pc;

      // Try to connect to the portal.
      connectToPortal(portals[i]);
    }
    return;
  })();
}

// getUserPortalList is a bootstrapping function which uses the default portals
// to fetch the list of portals that are preferred by the user. Until we have
// that list, we can't know what they are, so we have to start by sending
// messages to the default portals.
async function getUserPortalList(): Promise<[SkynetPortal[], Err]> {
  return new Promise(async (resolve) => {
    // The portal module expects to receive a seed and also a list of potential
    // portals from the kernel.
    const dataFromKernel = await getDataFromKernel();

    // Check that the kernel supplied a list of portals.
    if (Array.isArray(dataFromKernel.bootstrapPortals) !== true) {
      resolve([[], "did not receive valid portal list from kernel"]);
    }
    resolve([dataFromKernel.bootstrapPortals.slice(0, 1), null]);
  });
}

// connectToPortal is an async function which will attempt to connect to a
// portal.
function connectToPortal(portal: SkynetPortal): void {
  (async () => {
    logErr("attempting to connect to portal:", portal);

    // Contact the portal with the pubkey in an attempt to sign in.
    const keypair = await portalKeypair(portal);
    const pubkeyHex = bufToHex(keypair.publicKey);
    const query = accountURL(portal) + "/api/login?pubKey=" + pubkeyHex;
    logErr("using query", query);
    fetch(query)
      .then((response: Response) => {
        // If we get a 400, we're going to try registering under the assumption
        // that the 400 indicates an unknown user.
        if (response.status === 400) {
          // Check that we haven't already tried registering, we don't want to
          // get caught in an infinite loop between attempting login and
          // registration.
          if (portalMap[portal.name].registrationAttempted === true) {
            logErr("aborting re-registration because login was already tried");
            portalConnectionFailed(portal, "login failed after attempting registration");
            return;
          }

          // Try registering, when registration is complete, login will be
          // tried again.
          logErr("received 400, jumping to account creation");
          createPortalAccount(portal);
          return;
        }

        // Parse the response and respond to the login challenge.
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
  })();
}

// portalConnectionFailed will handle a portal that failed to connect. It will
// update the PortalConnection object and if necessary resolve the
// connectPromise.
function portalConnectionFailed(portal: SkynetPortal, err: Err) {
  // Add the error information to the portalMap.
  portalMap[portal.name].connectAttempted = true;
  portalMap[portal.name].connectErr = err;

  // If another portal has already connected successfully, we don't need to
  // check the connectPromise.
  if (connectResolved === true) {
    return;
  }

  // Check whether all portals have failed. If all portals have failed, we need
  // to resolve the conenctPromise with an error.
  failuresRemaining -= 1;
  if (failuresRemaining === 0) {
    connectResolved = true;
    resolveConnectPromise("no portal was able to successfully connect");
  }
}

// portalConnectionSuccessful will mark that a successful connection has been
// made to a portal.
function portalConnectionSuccessful(portal: SkynetPortal, authToken: any) {
  // Update the portal in the portalMap.
  portalMap[portal.name].connectAttempted = true;
  portalMap[portal.name].connectErr = null;
  portalMap[portal.name].authToken = authToken;

  // If the connectPromise has not already resolved successfully, resolve it so
  // that the other parts of the portal module know there's at least one
  // working portal and that Skynet is ready for use.
  if (connectResolved === false) {
    connectResolved = true;
    resolveConnectPromise(null);
  }
}

// portalKeypair will derive a keypair for the provided portal, using the
// provided seed.
async function portalKeypair(portal: SkynetPortal): Promise<Ed25519Keypair> {
  // The error is ignored for the ed25519KeypairFromEntropy call because the
  // implementation leaves no room for error if it is called correctly.
  const seed = await getSeed();
  logErr("user seed", seed);
  const portalSeed = deriveChildSeed(seed, "userPortalKey" + portal.name);
  const keypairEntropy = sha512(portalSeed).slice(0, 32);
  logErr(keypairEntropy);
  const [keypair] = ed25519KeypairFromEntropy(keypairEntropy);
  logErr("user keypair", keypair);
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
function createPortalAccount(portal: SkynetPortal): void {
  (async () => {
    // Call 'register' with the user's pubkey to receive a registration
    // challenge.
    const keypair = await portalKeypair(portal);
    const pubkeyHex = bufToHex(keypair.publicKey);
    const query = accountURL(portal) + "/api/register?pubKey=" + pubkeyHex;
    logErr(query);
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
        logErr("got a response from registering", response.status);
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
  })();
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
  logErr("sending message", postJSON);

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
        logErr(response.status);
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
  logErr("sending response to login challenge", postJSON);

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

      /* - login headers are supposed to include a Skynet-Token, but don't.
        logErr("login headers", ...response.headers);
        const authToken = response.headers.get("Skynet-Token");
        portalConnectionSuccessful(portal, authToken);
       */
    })
    .catch((err: any) => {
      const errStr = addContextToErr(err, "unable to post response to login challenge");
      portalConnectionFailed(portal, errStr);
      return;
    });
}

export { connect, connectToPortals, viewPortalConnections };
