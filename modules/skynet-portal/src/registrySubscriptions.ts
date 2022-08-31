// registrySubscriptions.ts handles the registry subscription protocol,
// including creating the websocket and selecting registry entries to listen
// to.

// TODO: Need to update the kernel so that it can route responses to webapps.
// Also need to update the kernel so that it can kill connections and
// subscriptions when a webapp has been closed. All related modules should be
// destroyed.

// RegistrySubscription defines the expected input data when subscribing to a
// registry entry. The inputs are the public key and the data key of the
// registry entry that we are listening to, and a method that should be called
// when an update is received.
//
// When a registry entry is updated, the original caller will be called using
// the callbackMethod. The data provided as input to the callbackMethod will be
// a RegistryEntryUpdate.
interface RegistryEntrySubscription {
  publicKey: Uint8Array;
  dataKey: Uint8Array;
  callbackMethod: string;
}

// RegistryEntryUpdate defines the object that will be provided in the callback
// when a registry entry is updated. If 'deleted' is set to 'true', it means
// the registry entry was deleted, and the entryData will be an empty array.
interface RegistryEntryUpdate {
  id: Uint8Array;
  deleted: boolean;
  entryData: Uint8Array;
  revision: bigint;
}

// RegistrySubscriptionTracker tracks the latest update for a registry entry,
// as well as all of the active subscriptions to that registry entry.
interface RegistrySubscriptionTracker {
  LatestRevision: RegistryEntryUpdate;
  ActiveSubscriptions: ActiveSubscription[];
}

// ActiveSubscription defines the data that is used to track a module that
// subscribed to a registry entry. There can be multiple ActiveSubscriptions
// per module, so long as each one has a different callbackMethod.
interface ActiveSubscription {
  domain: string;
  callbackMethod: string;
}

// subscriptionTracker is a hashmap that maps from a registry entry id to the
// list of ActiveSubscriptions for that registry entry. When a registry entry
// update is received, the callback is called on every active subscription
const subscriptionTracker = {};

// createSubscriptionConnection will create a registry subscription connection
// to a portal.
//
// NOTE: You can't create a websocket connection using new WebSocket, because
// the connection can't authorize using an auth token that way. Instead you
// have to create an https connection and pass in upgrade headers.
async function createSubscriptionConnection(
  callerDomain: string,
  subRequest: RegistryEntrySubscription
): Promise<void> {
  // TODO: Get the registry entry id of the subRequest.
  //
  // TODO: Check if we are already subscribed
  //
  // TODO: If so, add a new activeSubscription and return the latest data
  //
  // TODO: If not, subscribe to the registry entry and add an active subscription
}
