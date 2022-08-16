import { connect, connectToPortals, viewPortalConnections } from "./connect.js";
import { ActiveQuery, addHandler, handleMessage } from "libkmodule";

// Required for libkmodule to work.
onmessage = handleMessage;

// Will route calls to "repeatMessage" to handleRepeatMessage.
// addHandler("bootstrapPortals", handleBootstrapPortals);
addHandler("checkSkynetConnection", handleCheckSkynetConnection);

// connectToPortals is the init function for the portal module. It will figure
// out the user's preferred set of portals and then connect to all of them,
// load balancing between them to provide the user with a smooth Skynet
// experience.
//
// The 'connect' function can be used to get a promise which will resolve when
// connectToPortals has either succeeded or failed.
connectToPortals();

// handleCheckSkynetConnection will handle a call to 'checkSkynetConnection',
// which provides information on how the connectToPortals call went at init. It
// will not return until 'connect' is resolving, and it will provide any errors
// that occurred up until this point in the connection process.
async function handleCheckSkynetConnection(aq: ActiveQuery) {
  // First connect. connectErr may not be 'null', but we want to get the set of
  // portal connections before we return connectErr.
  const connectErr = await connect();

  // Repsond with the connection error and a view of all of the portal
  // connections.
  aq.respond({
    connectErr,
    portalConnections: viewPortalConnections(),
  });
}
