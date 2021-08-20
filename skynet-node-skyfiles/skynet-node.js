// TODO: Load the remaining APIs from Skynet. There is going to be an
// in-memory map that maps from an API function to a skylink of a
// worker script that can handle that API function. Whenever one of the
// apis is called, we'll create a new short lived web worker to handle
// that request.

// TODO: Load any long-running background processes in web workers. At
// least initially, we're mainly going to save that for our internal
// stealth blockchain. The main thing I'm worried about with long
// running background threads is that developers might be over-eager in
// launching processes that they don't need, and the user may end up
// with like dozens or hundreds of long running background threads
// mostly doing things that the user doesn't care for. We probably want
// to establish some controls around that but I have no idea what sort
// of controls would make sense.

// TODO: Need to build some sort of framework for error handling.

// TODO: Need to build some sort of framework for logging out.

// Send a message to the parent window indicating that the node has loaded.
console.log("Skynet Node: skynet node has loaded");
const loadedMessage = {method: "skynetNodeLoaded"};
window.parent.postMessage({method: "skynetNodeLoaded"}, "*");
