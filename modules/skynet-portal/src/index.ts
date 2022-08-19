import { blockForInit, init, viewPortalConnections } from "./init.js";
import { ActiveQuery, addContextToErr, addHandler, handleMessage, logErr, objAsString } from "libkmodule";

// Required for libkmodule to work.
onmessage = handleMessage;

// Will route calls to "repeatMessage" to handleRepeatMessage.
// addHandler("bootstrapPortals", handleBootstrapPortals);
addHandler("checkSkynetConnection", handleCheckSkynetConnection);
addHandler("testLoggedIn", handleTestLoggedIn);

// Initialize the module. Portals cannot be used until the promise returned by
// 'blockForInit' is resolving.
init();

// handleCheckSkynetConnection will handle a call to 'checkSkynetConnection',
// which provides information on how the connectToPortals call went at init. It
// will not return until 'connect' is resolving, and it will provide any errors
// that occurred up until this point in the connection process.
async function handleCheckSkynetConnection(aq: ActiveQuery): Promise<void> {
  // Let the module finish initializing and then return the list of
  // portalConnection objects.
  const connectErr = await blockForInit();
  aq.respond({
    connectErr,
    portalConnections: viewPortalConnections(),
  });
}

// handleTestLoggedIn will test that the user is logged into a portal. It does
// this by using the download endpoint of skynetfree.net, which is known to be
// a login-required portal.
//
// We just use a generic endpoint here, we don't need a trustless one. The only
// thing we are checking is that the portal doesn't give us a 'login required'
// message.
//
// NOTE: Currently this function just grabs the first PortalConnection that the
// module has. That's not strictly correct, the module should actually scroll
// through them and find one that's in good health.
async function handleTestLoggedIn(aq: ActiveQuery): Promise<void> {
  // Wait for startup to complete.
  const connectErr = await blockForInit();
  if (connectErr !== null) {
    aq.reject(addContextToErr(connectErr, "unable to connect to a portal, test cannot succeed"));
    return;
  }

  // Try performing a simple download of a known skylink from one of the
  // portals.
  const portalConnections = viewPortalConnections();
  const portalConnection = portalConnections[0];
  const testFile = "bAAN61ryDqNgskNqhHn2YVXWtQ6CG3Xf_gjoB6JB83u8Dg";
  const query = portalConnection.portal.url + "/" + testFile;
  const fetchOpts = {
    headers: {
      Authorization: "Bearer " + portalConnection.authToken,
    },
  };
  fetch(query, fetchOpts)
    .then((response: Response) => {
      logErr("test logged in status:", response.status);
      if (response.status !== 200) {
        aq.reject("got a bad status");
        return;
      }
      aq.respond("download seems to have succeeded");
    })
    .catch((err: any) => {
      aq.reject(addContextToErr(objAsString(err), "fetch request failed"));
    });
}
