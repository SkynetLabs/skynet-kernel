import { addContextToErr, addHandler, handleMessage, validateObjPropTypes } from "libkmodule";
import { bufToHex, deriveRegistryEntryID } from "libskynet";
import type { ActiveQuery, Err } from "libkmodule";

// ConnectionUpdate defines the structure that is used to send messages over a
// connection to the get-set-object module. The message has a nonce so that
// responseUpdates can be sent which are connected to a specific
// ConnectionUpdate.
interface ConnectionUpdate {
  method: string;
  nonce: string;
  data: any;
}

// UpdateRejection defines the structure that is used to send an error back to
// the caller as a responseUpdate in the event that a ConnectionUpdate
// experiences an error.
//
// The nonce may not be included if the error is that a ConnectionUpdate with
// no coherent nonce was received.
interface UpdateRejection {
  nonce?: string;
  err: Err;
}

// WatchRequest defines the structure that is used to send a request to watch
// an object to get-set-object.
interface WatchRequest {
  publicKey: Uint8Array;
  dataKey: Uint8Array;
}

// OpenConnection defines the state for an open connection.
interface OpenConnection {
  activeQuery: ActiveQuery;
  id: string;
}

// WatchedObject is an object that is being watched by at least one connection
// in the module. The WatchObject element is used when a new update is received
// for an object to find all of the connections that should be informed about
// the new state of the object.
interface WatchedObject {
  watchingConnections: OpenConnection[];
  objectIs404: boolean;
  latestState?: any;
}

// ObjectUpdate is the responseUpdate that gets sent to the caller when there
// is an update to an object that they have subscribed to.
interface ObjectUpdate {
  nonce: string;
  objectIs404: boolean;
  latestState?: any;
}

// WatchedObjects is a map which tracks all of the objects that are being
// watched across all connections.
const WatchedObjects = new Map<string, WatchedObject>();

// Required for libkmodule to work.
onmessage = handleMessage;

// Create a handler for connecting to the module, which is intended to be a
// long running connection that will be used to send object updates to the
// caller.
addHandler("connect", handleConnect, {
  receiveUpdates: true,
});
addHandler("receiveRegistryUpdate", handleReceiveRegistryUpdate); // TODO: Implement this.

// handleConnect will handle a call that connects to the get-set-object module.
// This will create a long-lived query to the get-set-object module which can
// be used to subscribe to objects and receive updates from objects.
async function handleConnect(aq: ActiveQuery): Promise<void> {
  // Create a unique tag for this connection so that it can easily be found
  // when objects get updated.
  const openConnection = {
    activeQuery: aq,
    id: Math.random().toString(),
  };

  // Check that setReceiveUpdate is defined. If the handler was created
  // correctly (the 'receiveUpdates' option was set to 'true') then this will
  // definitely not be undefined. We check anyway to make typescript happy and
  // to maybe catch a developer mistake.
  if (aq.setReceiveUpdate === undefined) {
    aq.reject("implementation error: aq.setReceiveUpdate is undefined; handler was instantiated incorrectly");
    return;
  }

  // Establish the setReceiveUpdate function for this module.
  aq.setReceiveUpdate(() => {
    receiveConnectionUpdate(openConnection);
  });

  // Send a keepalive update immediately. The receiver will generally ignore
  // this message, but it's okay. This gives the kernel a chance to respond
  // that the caller has been closed, and potentially gives the caller a chance
  // handle things better.
  //
  // The nonce is required by the ConnectionUpdate struct but in this case the
  // update is not a response to any preceding update, so no nonce is
  // available. Instead of updating the type to sometimes not need a nonce and
  // worry that we forgot it in other places, we just return a fixed value
  // here. The caller is free to ignore this nonce.
  const keepaliveUpdate: ConnectionUpdate = {
    method: "keepalive",
    data: {},
    nonce: "connection-success",
  };
  aq.sendUpdate(keepaliveUpdate);
}

// receiveConnectionUpdate is called when an update is provided to an existing
// connection.
async function receiveConnectionUpdate(oc: OpenConnection): Promise<void> {
  // Convenience variables.
  const aq = oc.activeQuery;

  // Verify that the connection update is well formed.
  const errVOPT = validateObjPropTypes(aq.callerInput, [
    ["method", "string"],
    ["data", "object"],
    ["nonce", "string"],
  ]);
  if (errVOPT !== null) {
    rejectUpdate(aq, addContextToErr(errVOPT, "connection update is malformed"));
    return;
  }

  // Discover which method is being requested by the caller and handle it
  // accordingly.
  if (aq.callerInput.method === "keepalive") {
    // We ignore keepalives, they get sent so the kernel knows the skapp is
    // still alive.
    return;
  }
  if (aq.callerInput.method === "watchObject") {
    return handleWatchObject(oc);
  }
  if (aq.callerInput.method === "updateObject") {
    return handleUpdateObject(oc);
  }
  if (aq.callerInput.method === "releaseObject") {
    return handleReleaseObject(oc);
  }
  if (aq.callerInput.method === "close") {
    return handleClose(oc);
  }

  // Send a responseUpdate indicating that a malformed message was received.
  rejectUpdate(aq, "connection update has unrecognized method");
}

// rejectUpdate will send a responseUpdate to the caller, responding to a
// specific queryUpdate with an error message.
async function rejectUpdate(aq: ActiveQuery, err: Err): Promise<void> {
  const updateRejection: UpdateRejection = {
    nonce: aq.callerInput.nonce, // may be undefined
    err,
  };
  aq.sendUpdate(updateRejection);
}

// handleWatchObject handles a connection call to get an object.
async function handleWatchObject(oc: OpenConnection): Promise<void> {
  // Convenience variables. These have already been verified by the caller.
  const aq = oc.activeQuery;
  const input = aq.callerInput.data;

  // Validate that the input is well-formed and convert it to a registry entry
  // id.
  const errVOPT = validateObjPropTypes(input, [
    ["publicKey", "Uint8Array"],
    ["dataKey", "Uint8Array"],
  ]);
  if (errVOPT !== null) {
    rejectUpdate(aq, addContextToErr(errVOPT, "input to getObject update is malformed"));
    return;
  }
  // The following line is only to ensure that any changes to the WatchRequest
  // type get implemented everywhere.
  const wr: WatchRequest = input as WatchRequest;
  const [entryIDBytes, errDREID] = deriveRegistryEntryID(wr.publicKey, wr.dataKey);
  if (errDREID !== null) {
    rejectUpdate(aq, addContextToErr(errDREID, "input to getObject update is malformed"));
    return;
  }
  const entryID = bufToHex(entryIDBytes);

  // Check whether the object in question is already available in memory.
  if (WatchedObjects.get(entryID) === undefined) {
    const errCWO = await createWatchedObj(entryID, input.publicKey, input.dataKey); // TODO: Implement this.
    if (errCWO !== null) {
      rejectUpdate(aq, addContextToErr(errCWO, "unable to fetch watched object"));
      return;
    }
  }

  // Add this connection to the watched object. The above codeblock ensures
  // that the watchedObj exists, however it uses 'await', which means there's a
  // chance that the caller has already sent a message to delete the object. If
  // that's the case, it's possible that the object doesn't exist, therefore we
  // need to still do an existence check.
  const watchedObj = WatchedObjects.get(entryID);
  if (watchedObj === undefined) {
    rejectUpdate(aq, "object appears to have been released before it could be read");
    return;
  }
  watchedObj.watchingConnections.push(oc);

  // Send a response update with the latest state for this object.
  const update: ObjectUpdate = {
    nonce: aq.callerInput.nonce,
    objectIs404: watchedObj.objectIs404,
    latestState: watchedObj.latestState,
  };
  aq.sendUpdate(update);
}
