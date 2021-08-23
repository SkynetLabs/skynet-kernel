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

	// This is a foreign message, validate that the foreign method conforms
	// to all security standards.
	if (typeof event.data.method !== "string" || event.data.method.length > 16) {
		console.log("Skynet Node: invalid message, method must be a string and must be no more than 16 characters in length");
		return;
	}
	// Normalize the length of the method. This prevents collisions.
	data.method.padEnd(16);
	// Check that the domain is valid.
	if (typeof event.data.domain !== "string" || event.data.domain.length != 64) {
		console.log("Skynet Node: invalid message, domain must be a string representing a pubkey");
		return;
	}
	// TODO: Check that the domain is hex and that it decodes to a fuly
	// valid pubkey.
	if (typeof event.data.defaultHandler !== "string" || event.data.defaultHandler.length != 64) {
		console.log("Skynet Node: invalid message, defaultHandler must be a v1 skylink");
		return;
	}
	// TODO: Check that the defaultHandler is hex that decodes to a fully
	// valid v1 skylink.

	// TODO: Check the in-memory map to see if there is an alternative
	// handler that we use for this API endpoint.

	// TODO: Fetch the handler from skynet, verify the signature on the
	// handler matches the pubkey for the domain, create a web worker using
	// the handler, and run the code inside of the web worker.
}
