import { blockForInit, init, viewPortalConnections } from "./init.js";
import { PortalConnectionTest, testPortalConnection } from "./testPortalConnections.js";
import { ActiveQuery, addContextToErr, addHandler, handleMessage, logErr, objAsString } from "libkmodule";

// Required for libkmodule to work.
onmessage = handleMessage;

// Establish all of the handlers for the various methods that are supported by
// the module.
addHandler("viewPortalConnections", handleViewPortalConnections);
addHandler("testPortalConnections", handleTestPortalConnections);

// Initialize the module. Portals cannot be used until the promise returned by
// 'blockForInit' is resolving.
init();

// handleViewPortalConnections returns the list of active portal connections.
async function handleViewPortalConnections(aq: ActiveQuery): Promise<void> {
  // Let the module finish initializing and then return the list of
  // portalConnection objects.
  const connectErr = await blockForInit();
  aq.respond({
    connectErr,
    portalConnections: viewPortalConnections(),
  });
}

// handleTestPortalConnections will hit several endpoints on each portal, and
// return a diagnostic list of every portal that was hit and what endpoints
// appear to be available.
async function handleTestPortalConnections(aq: ActiveQuery): Promise<void> {
  // Wait for startup to complete.
  const connectErr = await blockForInit();
  if (connectErr !== null) {
    aq.reject(addContextToErr(connectErr, "unable to connect to a portal"));
    return;
  }

  // Run the test on each portal.
  //
  // TODO: Need to switch to using Promise.all() but I couldn't get it working
  // in time for this commit.
  // const testPromises: Promise<PortalConnectionTest>[] = [];
  const portalConnections = viewPortalConnections();
  const testResults: PortalConnectionTest[] = [];
  for (let i = 0; i < portalConnections.length; i++) {
    const portal = portalConnections[i].portal;
    const result = await testPortalConnection(portal);
    testResults.push(result);
    // testPromises.push(testPortalConnection(portal));
  }
  // const testResults = Promise.all(testPromises);
  aq.respond(testResults);

  /*
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
   */
}
