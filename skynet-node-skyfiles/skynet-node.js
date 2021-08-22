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

// Overwrite the handleMessage function that gets called at the end of the
// event handler, allowing us to support custom messages.
handleMessage = function(event) {
	// Establish a handler that will serve user's homescreen to the caller.
	if (event.data.method === "skynetNodeRequestHomescreen") {
		// TODO: Instead of using hardcoded skylinks, derive some
		// registry locations from the user's seed, verify the
		// downloads, and then use those.
		//
		// TODO: We can/should probably start fetching these as soon as
		// the node starts up, instead of waiting until the first
		// request.
		//
		// TODO: We should save the user's homescreen files to local
		// storage and load them from local storage for a performance
		// boost. After loading them locally and serving them to the
		// caller, we can check if there was an update.
		const homescreenJSurl = "https://siasky.net/AABVJQo3cSD7IWyRHHOq3PW1ryrvvjcKhdgUS3wrFSdivA/";
		const homescreenHTMLurl = "https://siasky.net/AACIsYKvkvqKJnxdC-6MMLBvEFr2zoWpooXSkM4me5S2Iw/";
		var jsResp = fetch(homescreenJSurl).then(response => response.text());
		var htmlResp = fetch(homescreenHTMLurl).then(response => response.text());
		Promise.all([jsResp, htmlResp]).then((values) => {
			var homescreenResponse = {
				method: "skynetNodeReceiveHomescreen",
				script: values[0],
				html: values[1]
			};
			event.source.postMessage(homescreenResponse, "*");
		});
		return;
	}
}
