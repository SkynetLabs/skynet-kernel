import { log, logErr } from "./log.js";
import { DataFn } from "./messages.js";
import { ErrTuple, objAsString } from "libskynet";

// queryResolve defines the function that gets called to resolve a query. It's
// the 'resolve' field of a promise that returns a tuple containing some data
// and an err.
type queryResolve = (et: ErrTuple) => void;

// queryMap defines the type for the queries map, which maps a nonce to the
// outgoing query that the module made.
interface queryMap {
  [nonce: number]: {
    resolve: queryResolve;
    receiveUpdate?: DataFn;
    kernelNonce?: number;
    kernelNonceReceived?: DataFn;
  };
}

// incomingQueryMap defines the type for mapping incoming queries to the method
// that can receive queryUpdates. To allow queryUpdate messages to be processed
// in the same scope as the original query, we put a 'setReceiveUpdate'
// function in the activeQuery object.
//
// blockForReceiveUpdate is a promise that will be resolved once the
// receiveUpdate function has been set.
interface incomingQueryMap {
  [nonce: string]: Promise<DataFn>;
}

// queries is an object that tracks outgoing queries to the kernel. When making
// a query, we assign a nonce to that query. All response and responseUpdate
// messages for that query will make use of the nonce assigned here. When we
// receive a response or responseUpdate message, we will use this map to locate
// the original query that is associated with the response.
//
// The kernel provides security guarantees that all incoming response and
// responseUpdate messages have nonces that are associated with the correct
// query.
//
// queries is a hashmap where the nonce is the key and various query state
// items are the values.
//
// NOTE: When sending out queryUpdate messages, the queries need to use the
// nonce assigned by the kernel. The nonces in the 'queries' map will not work.
let queriesNonce = 0;
const queries: queryMap = {};

// incomingQueries is an object
// set of information needed to process queryUpdate messages.
const incomingQueries: incomingQueryMap = {};

// clearIncomingQuery will clear a query with the provided nonce from the set
// of incomingQueries. This method gets called when the response is either
// accepted or rejected.
function clearIncomingQuery(nonce: number) {
  delete incomingQueries[nonce];
}

// getSetReceiveUpdate returns a function called 'setReceiveUpdate' which can
// be called to set the receiveUpdate function for the current query. All
// queryUpdate messages that get received will block until setReceiveUpdate has
// been called.
function getSetReceiveUpdate(event: MessageEvent): (receiveUpdate: DataFn) => void {
  // Create the promise that allows us to block until the handler has
  // provided us its receiveUpdate function.
  let updateReceived: DataFn;
  const blockForReceiveUpdate: Promise<DataFn> = new Promise((resolve) => {
    updateReceived = resolve;
  });

  // Add the blockForReceiveUpdate object to the queryUpdateRouter.
  incomingQueries[event.data.nonce] = blockForReceiveUpdate;
  return function (receiveUpdate: DataFn) {
    updateReceived(receiveUpdate);
  };
}

// handleQueryUpdate currently discards all queryUpdates.
async function handleQueryUpdate(event: MessageEvent) {
  // Check whether the handler for this query wants to process
  // receiveUpdate messages. This lookup may also fail if no handler
  // exists for this nonce, which can happen if the queryUpdate message
  // created concurrently with a response (which is not considered a bug
  // or error).
  if (!(event.data.nonce in incomingQueries)) {
    return;
  }

  // Block until the handler has provided a receiveUpdate function, than
  // call receiveUpdate.
  const receiveUpdate = await incomingQueries[event.data.nonce];
  receiveUpdate(event.data.data);
}

// handleResponse will take a response and match it to the correct query.
//
// NOTE: The kernel guarantees that an err field and a data field and a nonce
// field will be present in any message that gets sent using the "response"
// method.
function handleResponse(event: MessageEvent) {
  // Look for the query with the corresponding nonce.
  if (!(event.data.nonce in queries)) {
    logErr("no open query found for provided nonce: " + objAsString(event.data.data));
    return;
  }

  // Check if the response is an error.
  if (event.data.err !== null) {
    logErr("there's an error in the data");
    queries[event.data.nonce].resolve([{}, event.data.err]);
    delete queries[event.data.nonce];
    return;
  }

  // Call the handler function using the provided data, then delete the query
  // from the query map.
  queries[event.data.nonce].resolve([event.data.data, null]);
  delete queries[event.data.nonce];
}

// handleResponseNonce will handle a message with the method 'responseNonce'.
// This is a message from the kernel which is telling us what nonce we should
// use when we send queryUpdate messages to the kernel for a particular query.
function handleResponseNonce(event: MessageEvent) {
  // Check if the query exists. If it does not exist, it's possible that the
  // messages just arrived out of order and nothing is going wrong.
  if (!(event.data.nonce in queries)) {
    logErr("temp err: nonce could not be found");
    return;
  }
  const query = queries[event.data.nonce];
  if ("kernelNonce" in query) {
    logErr("received two responseNonce messages for the same query nonce");
    return;
  }
  if (typeof query["kernelNonceReceived"] !== "function") {
    // We got a nonce even though one wasn't requested.
    log("received nonce even though none was requested");
    return;
  }
  query["kernelNonce"] = event.data.data.nonce;
  query.kernelNonceReceived();
  return;
}

// handleResponseUpdate attempts to find the corresponding query using the
// nonce and then calls the corresponding receiveUpdate function.
//
// Because response and responseUpdate messages are sent asynchronously, it's
// completely possible that a responseUpdate is received after the query has
// been closed out by a response. We therefore just ignore any messages that
// can't be matched to a nonce.
function handleResponseUpdate(event: MessageEvent) {
  // Ignore this message if there is no corresponding query, the query may
  // have been closed out and this message was just processed late.
  if (!(event.data.nonce in queries)) {
    return;
  }

  // Check whether a receiveUpdate function was set, and if so pass the
  // update along. To prevent typescript
  const query = queries[event.data.nonce];
  if (typeof query["receiveUpdate"] === "function") {
    query.receiveUpdate(event.data.data);
  }
}

// callModule is a generic function to call a module. It will return whatever
// response is provided by the module.
//
// callModule can only be used for query-response communications, there is no
// support for handling queryUpdate or responseUpdate messages - they will be
// ignored if received. If you need those messages, use 'connectModule'
// instead.
function callModule(module: string, method: string, data?: any): Promise<ErrTuple> {
  const moduleCallData = {
    module,
    method,
    data,
  };
  const [, query] = newKernelQuery("moduleCall", moduleCallData, false);
  return query;
}

// connectModule is a generic function to connect to a module. It is similar to
// callModule, except that it also supports sending and receiving updates in
// the middule of the call. If the module being called sends and update, the
// updated will be passed to the caller through the 'receiveUpdate' function.
// If the caller wishes to send an update to the module, it can use the
// provided 'sendUpdate' function.
//
// The call signature is a bit messy, so let's disect it a bit. The input
// values are the same as callModule, except there's a fourth input for
// providing a 'receiveUpdate' function. It is okay to provide 'null' or
// 'undefined' as the function to receive updates if you do not care to receive
// or process any updates sent by the module. If you do want to receive
// updates, the receiveUpdate function should have the following function
// signature:
//
// 		`function receiveUpdate(data: any)`
//
// The data that gets sent is at the full discretion of the module, and will
// depend on which method was called in the original query.
//
// The return value is a tuple of a 'sendUpdate' function and a promise. The
// promise itself resolves to a tuple which matches the tuple in the
// 'callModule' function - the first value is the response data, and the second
// value is an error. When the promise resolves, it means the query has
// completed and no more updates will be processed. Therefore, 'sendUpdate' is
// only valid until the promise resolves.
//
// sendUpdate has the following function signature:
//
// 		`function sendUpdate(data: any)`
//
// Like 'receiveUpdate', the data that should be sent when sending an update to
// the module is entirely determined by the module and will vary based on what
// method was called in the original query.
function connectModule(
  module: string,
  method: string,
  data: any,
  receiveUpdate: DataFn
): [sendUpdate: DataFn, response: Promise<ErrTuple>] {
  const moduleCallData = {
    module,
    method,
    data,
  };
  // We omit the 'receiveUpdate' function because this is a no-op. If the
  // value is not defined, newKernelQuery will place in a no-op for us.
  return newKernelQuery("moduleCall", moduleCallData, true, receiveUpdate);
}

// newKernelQuery creates a query to send to the kernel. It automatically
// handles details like the nonces and the postMessage communicaations.
//
// The first input is the method being called on the kernel, and the second
// input is the data being provided as input to the method.
//
// The third input is a boolean indicating whether or not you want to send
// queryUpdates. There is a small amount of performance overhead associated
// with sending updates (slightly under one millisecond) so we only set up the
// ability to send updates if it is requested.
//
// The final input is an optional function that gets called when a
// responseUpdate is received. If no fourth input is provided, responseUpdates
// will be ignored.
//
// NOTE: Typically developers should not use this function. Instead use
// 'callModule' or 'connectModule'.
function newKernelQuery(
  method: string,
  data: any,
  sendUpdates: boolean,
  receiveUpdate?: DataFn
): [sendUpdate: DataFn, response: Promise<ErrTuple>] {
  // Get the nonce for the query.
  const nonce = queriesNonce;
  queriesNonce += 1;

  // Create the sendUpdate function, which allows the caller to send a
  // queryUpdate. The update cannot actually be sent until the kernel has told us the responseNonce
  let sendUpdate: DataFn = () => {};

  // Establish the query in the queries map and then send the query to the
  // kernel.
  const p: Promise<ErrTuple> = new Promise((resolve) => {
    queries[nonce] = { resolve };
  });
  if (receiveUpdate !== null && receiveUpdate !== undefined) {
    queries[nonce]["receiveUpdate"] = receiveUpdate;
  }
  if (sendUpdates) {
    // Set up the promise that resovles when we have received the responseNonce
    // from the kernel.
    const blockForKernelNonce = new Promise((resolve) => {
      queries[nonce]["kernelNonceReceived"] = resolve;
    });
    sendUpdate = function (updateData: any) {
      blockForKernelNonce.then(() => {
        // It's possible that the query was already closed and deleted from
        // the queries map, so we need an existence check before completing
        // the postMessage call.
        if (!(nonce in queries)) {
          return;
        }
        postMessage({
          method: "queryUpdate",
          nonce: queries[nonce].kernelNonce,
          data: updateData,
        });
      });
    };
  }
  postMessage({
    method,
    nonce,
    data,
    sendKernelNonce: sendUpdates,
  });
  return [sendUpdate, p];
}

export {
  callModule,
  clearIncomingQuery,
  connectModule,
  getSetReceiveUpdate,
  handleQueryUpdate,
  handleResponse,
  handleResponseNonce,
  handleResponseUpdate,
  newKernelQuery,
};
