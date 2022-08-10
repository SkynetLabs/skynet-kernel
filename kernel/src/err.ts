// notableErrors is a persistent list of errors that should be checked after
// testing. You should only add to this array in the event of an error that
// indicates a bug with the kernel.
const notableErrors: string[] = [];

// respondErr will send an error response to the caller that closes out the
// query for the provided nonce. The extra inputs of 'messagePortal' and
// 'isWorker' are necessary to handle the fact that the MessageEvent you get
// from a worker message is different from the MessageEvent you get from a
// window message, and also from the fact that postMessage has different
// arguments depending on whether the messagePortal is a worker or a window.
function respondErr(event: MessageEvent, messagePortal: any, isWorker: boolean, err: string) {
  const message = {
    nonce: event.data.nonce,
    method: "response",
    data: {},
    err,
  };
  if (isWorker === true) {
    messagePortal.postMessage(message);
  } else {
    messagePortal.postMessage(message, event.origin);
  }
}

export { notableErrors, respondErr };
