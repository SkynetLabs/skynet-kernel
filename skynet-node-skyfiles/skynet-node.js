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

// TODO: Implement logging out. This is just going to clear the seed. All of
// the items that get put into local storage will stay there. To protect
// privacy if another user logs in, we should make sure that any other items
// which get put into local storage are stored at a key namespaced to the
// user's seed (really, the hash of their seed) and are encrypted using the
// seed, meaning another user on the same machine who logs in afterwards has no
// ability to see what the previous person's seed was.

// Overwrite the handleMessage function that gets called at the end of the
// event handler, allowing us to support custom messages.
handleMessage = function(event) {
	console.log("the call was passed to the loaded handleMessage: ", event.data.method);
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
		var jsResp = downloadV1Skylink("https://siasky.net/AABVJQo3cSD7IWyRHHOq3PW1ryrvvjcKhdgUS3wrFSdivA/");
		var htmlResp = downloadV1Skylink("https://siasky.net/AACIsYKvkvqKJnxdC-6MMLBvEFr2zoWpooXSkM4me5S2Iw/");
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

	// The only other supported call is a skynetNodeModuleCallV1.
	if (event.data.method !== "skynetNodeModuleCallV1") {
		console.log("Received unrecognized call: ", event.data.method);
		return;
	}
	// TODO: Check that the domain decodes to a fully valid pubkey.

	if (typeof event.data.defaultHandler !== "string" ) {
		console.log("Skynet Node: invalid message, defaultHandler must be a v1 skylink");
		return;
	}

	// TODO: Check the in-memory map to see if there is an alternative
	// handler that we use for this API endpoint.
	var handler = event.data.defaultHandler;

	// TODO: Ensure all validation is complete at this point.

	// Fetch the handler from skynet, verify the signature on the handler
	// matches the domain, create a web worker with the handler, and then
	// run the code inside of the web worker.
	downloadV1Skylink(handler)
		.then(response => {
			// TODO: Pull out and verify the signature for the
			// handler instead of pretending that no signature
			// exists and just parsing the whole thing as js.
			var url = URL.createObjectURL(new Blob([response]));
			var worker = new Worker(url);
			worker.onmessage = function(oEvent) {
				console.log(oEvent.data);
			};
			worker.postMessage("abc");

			// TODO: RESUME HERE - figure out how to communicate
			// the result of the worker back to the origin. And
			// then after that figure out how to enable the worker
			// to call other APIs on the skynet-node.
		});
}
