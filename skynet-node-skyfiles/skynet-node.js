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

// handleSkynetNodeModuleCallV1 handles a call to a version 1 skynet node
// module.
// 
// TODO: Write documentation for using V1 skynet node module calls. Need to
// specify the intention, limitations, and every parameter.
//
// TODO: What we really want is for the handlers to be versioned, and then we
// can check for an explicit override at the user level to prefer a specific
// version of a handler. I'm not completely sure how manage handler versioning
// yet, if there is a newer version available we always want to use the newer
// version, but at the same time we do not want handlers upgrading without user
// consent. Probably the override map will specify whether upgrading is
// allowed, and how to check for upgrades. Then we will need the handler string
// to identify within the string the version of the handler so we can detect
// whether a newer handler is being suggested. I guess the override entry also
// needs to specify which pubkey is allowed to announce a new version.
handleSkynetNodeModuleCallV1 = function(event) {
	// TODO: Check that the domain decodes to a fully valid pubkey. The
	// pubkey is important to ensuring that only handlers written by the
	// original authors of the module are allowed to insert themselves as
	// upgrades. This prevents malicious apps from supplying malicious
	// handlers that can steal user data.

	// Define the function that will create a blob from the handler code
	// for the worker.
	var runWorker = function(event, workerCode) {
		var url = URL.createObjectURL(new Blob([workerCode]));
		var worker = new Worker(url);
		worker.onmessage = function(wEvent) {
			// Check if the worker is trying to make a call to
			// another module.
			if (wEvent.data.kernelMethod === "moduleCallV1") {
				handleSkynetNodeModuleCallV1(event);
				return;
			}

			// TODO: Check if the worker is trying to make a core
			// kernel call.

			// Check if the worker is responding to the original
			// caller.
			if (wEvent.data.kernelMethod === "moduleResponseV1") {
				event.source.postMessage({
					kernelMethod: "skynetKernelModuleResponseV1",
					requestNonce: event.data.requestNonce,
					domain: event.data.domain,
					moduleMethod: event.data.moduleMethod,
					workerResponse: wEvent.data.response
				}, "*");
				worker.terminate();
				return;
			}

			// TODO: Some sort of error framework here, we
			// shouldn't be arriving to this code block unless the
			// request was malformed.
			worker.terminate();
			return;
		};

		// When sending a method to the worker, we need to clearly
		// distinguish between a new request being sent to the worker
		// and a response that the worker is receiving from a request
		// by the worker. This distinction is made using the 'method'
		// field, and must be set only by the kernel, such that the
		// worker does not have to worry about some module pretending
		// to be responding to a request the worker made when in fact
		// it has made a new request.
		// 
		// NOTE: There are legacy modules that aren't going to be able
		// to update or add code if the kernel method changes. If a
		// spec for a V2 ever gets defined, the kernel needs to know in
		// advance of sending the postmessage which versions the module
		// knows how to handle. We version these regardless because
		// it's entirely possible that a V2 gets defined, and user does
		// not upgrade their kernel to V2, which means that the module
		// needs to be able to communicate using the V1 protocol since
		// that's the only thing the user's kernel understands.
		worker.postMessage({
			kernelMethod: "moduleAPIRequestV1",
			moduleMethod: event.data.moduleMethod,
			workerInput: event.data.workerInput
		});
	};

	// TODO: Check the in-memory map to see if there is an alternative
	// handler that we use for this API endpoint.
	if (false) {
		// TODO: Check whether we can grab the worker code from local
		// storage or if we have to pull the worker code from Skynet.
		// Once the workerCode has been retrieved, call runWorker with
		// the worker code.
		//
		// Note that since we're here because there's an override for
		// this API call, there's no need to verify that the worker
		// code is properly signed. It may even be the case that the
		// override intentionally replaced the original worker code
		// with an alternate implementation, and the alternate
		// implementor does not have the required private key. As long
		// as the user (or distro maintainer) consented to the override
		// (which is implied by the existence of the override), we do
		// not care if the author had permission from the original
		// module creator.
	} else {
		// Validate that the provided defaultHandler is a string.
		if (typeof event.data.defaultHandler !== "string" ) {
			console.log("Skynet Node: invalid message, defaultHandler must be a v1 skylink");
			return;
		}

		// Fetch the handler from skynet.
		//
		// TODO: If there is no default handler set, set this handler
		// as the default handler for this API. Have some sort of
		// versioning in place so that we can recognize if a newer
		// handler is a higher version that we should be updating to.
		downloadV1Skylink(event.data.defaultHandler)
			.then(response => {
				// TODO: Pull out and verify the signature for
				// the handler instead of pretending that no
				// signature exists and just parsing the whole
				// thing as js.
				runWorker(event, response);
			});
	}
}

// handleSkynetNodeRequestHomescreen will fetch the user's homescreen from
// their Skynet account and serve it to the caller.
var handleSkynetNodeRequestHomescreen = function(event) {
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
			kernelMethod: "receiveHomescreen",
			script: values[0],
			html: values[1]
		};
		event.source.postMessage(homescreenResponse, "*");
	});
	return;
}

// Overwrite the handleMessage function that gets called at the end of the
// event handler, allowing us to support custom messages.
handleMessage = function(event) {
	// Establish a handler that will manage a v1 module api call.
	if (event.data.kernelMethod === "moduleCallV1") {
		handleSkynetNodeModuleCallV1(event);
		return;
	}

	// Establish a handler that will serve user's homescreen to the caller.
	if (event.data.kernelMethod === "requestHomescreen") {
		handleSkynetNodeRequestHomescreen(event);
	}

	console.log("Received unrecognized call: ", event.data.kernelMethod);
}
