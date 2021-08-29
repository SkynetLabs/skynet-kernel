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

// Set up a logging method that can be enabled and disabled.
//
// TODO: Add an RPC to enable and disable this at runtime.
debugging = true;
var kernelLog = function(msg) {
	if (debugging) {
		console.log(msg)
	}
}

// Define an abstraction around localStorage that puts everything into a
// namespace based on the user's seed, encrypts the contents, and authenticates
// the contents. Then back the contents up to Skynet.
//
// TODO: namespace the localstorage, encrypt it, and authenticate it. Then back
// the contents up to skynet.
var secureSave = function(key, value) {
	localStorage.setItem(key, value);
}
var secureLoad = function(key) {
	// TODO: Check that the secureLoad matches checksums and auth and
	// passes decryption. That's what can cause an error.
	if (false) {
		throw "unable to securely load the storage";
	}
	return localStorage.getItem(key);
}

// Load all of the modules that we have saved locally into memory.
var moduleMap = {};
var loadModuleMap = function() {
	var modules = "";
	try {
		modules = secureLoad("moduleMap");
		moduleMap = JSON.parse(modules);
	} catch {
		kernelLog("Skynet Node ERROR: unable securely load the moduleMap");
		moduleMap = {};
	}

	// TODO: Kick off a background worker that will talk to Skynet, compare
	// against the latest set of modules, grab any that are missing, post
	// any that skynet doesn't seem to have, and then begin updating the
	// modules to their latest versions.
}

// saveModuleMap will save the map of the user's modules.
var saveModuleMap = function() {
	secureSave("moduleMap", JSON.stringify(moduleMap));

	// TODO: Communicate with the background thread that syncs local
	// modules to skynet and make sure this new module is visible to the
	// user's other devices.
}

// Define the function that will create a blob from the handler code for the
// worker. We need to define this as a separate function because any code we
// fetch from Skynet needs to be run in a promise.
//
// One of the major security concerns with this function is that multiple
// different modules are going to be communicating with each other. We need to
// make sure that key inputs like 'kernelMethod' and 'requestNonce' can't be
// read or interfered with. I believe the current implementation has been
// completed in a secure and robust way, but any changes made to this function
// should carefully think through security implications, as we have multiple
// bits of untrusted code running inside of this worker, and those bits of code
// may intentionally be trying to mess with each other as well as mess with the
// kernel itself.
var runModuleCallV1Worker = function(rwEvent, rwSource, workerCode) {
	kernelLog("Skynet Node: creating worker to handle a moduleCallV1");
	kernelLog(rwEvent.data);
	kernelLog(rwSource);
	let url = URL.createObjectURL(new Blob([workerCode]));
	let worker = new Worker(url);
	worker.onmessage = function(wEvent) {
		kernelLog("Skynet Node: moduleCallV1 worker got a message");
		kernelLog(rwEvent.data);
		kernelLog(rwSource);
		kernelLog(wEvent.data);
		// Check if the worker is trying to make a call to
		// another module.
		if (wEvent.data.kernelMethod === "moduleCallV1") {
			kernelLog("Skynet Node: moduleCallV1 worker is calling moduleCallV1");
			handleModuleCallV1(wEvent, worker);
			return;
		}

		// Check if the worker is responding to the original
		// caller.
		if (wEvent.data.kernelMethod === "moduleResponseV1") {
			kernelLog("Skynet Node: moduleCallV1 worker is sending a moduleResponseV1");
			let message = {
				domain: wEvent.data.domain,
				kernelMethod: "moduleResponseV1",
				requestNonce: rwEvent.data.requestNonce,
				moduleResponse: wEvent.data.moduleResponse
			}

			// If the source is a window, we need to supply some
			// CORS information as arguments. If the source is a
			// web worker, we need to not supply any parameters as
			// a second arg. Detect if the source is a web worker
			// by comparing to the wEvent.source value. It is
			// completely unknown if this is a reliable way of
			// telling them apart, but it seems to work. JANKY.
			//
			// TODO: Fix this jank.
			if (rwEvent.source === rwSource) {
				// The source is a window.
				rwSource.postMessage(message, "*");
			} else {
				// The source is a worker.
				rwSource.postMessage(message);
			}
			worker.terminate();
			return;
		}

		// TODO: Some sort of error framework here, we
		// shouldn't be arriving to this code block unless the
		// request was malformed.
		var err = "worker responded with an unrecognized kernelMethod while handling a moduleCallV1";
		kernelLog("Skynet Node: " + err);
		reportModuleCallV1KernelError(rwSource, false, rwEvent.data.requestNonce, err);
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
		domain: rwEvent.data.domain,
		kernelMethod: "moduleCallV1",
		requestNonce: rwEvent.data.requestNonce,
		moduleMethod: rwEvent.data.moduleMethod,
		moduleInput: rwEvent.data.moduleInput
	});
};

// reportModuleCallV1KernelError will repsond to the source with an error message,
// indicating that the RPC failed.
//
// The kernel provides a guarantee that 'err' will always be a string.
var reportModuleCallV1KernelError = function(source, sourceIsWorker, requestNonce, err) {
	let message = {
		kernelMethod: "moduleResponseV1",
		requestNonce: requestNonce,
		kernelErr: err,
	}
	if (sourceIsWorker) {
		source.postMessage(message);
	} else {
		source.postMessage(message, "*");
	}
}

// handleModuleCallV1 handles a call to a version 1 skynet node module.
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
var handleModuleCallV1 = function(event, source) {
	// Perform input validation - anyone can send any message to the
	// kernel, need to make sure any malicious messages result in an error.
	if (event.data.domain === undefined) {
		kernelLog("Skynet Node: invalid message, domain must be set for moduleCallV1");
		let err = "bad moduleCallV1 request: domain is not specified";
		reportModuleCallV1KernelError(source, false, event.data.requestNonce, err);
		return;
	}
	if (typeof event.data.domain !== "string") {
		kernelLog("Skynet Node: invalid message, domain must be a string for moduleCallV1");
		let err = "bad moduleCallV1 request: domain is not a string";
		reportModuleCallV1KernelError(source, false, event.data.requestNonce, err);
		return;
	}
	if (event.data.defaultHandler === undefined) {
		kernelLog("Skynet Node: invalid message, defaultHandler must be a string for moduleCallV1");
		let err = "bad moduleCallV1 request: defaultHandler is not specified";
		reportModuleCallV1KernelError(source, false, event.data.requestNonce, err);
		return;
	}
	if (typeof event.data.defaultHandler !== "string") {
		kernelLog("Skynet Node: invalid message, defaultHandler must be a string for moduleCallV1");
		let err = "bad moduleCallV1 request: defaultHandler is not a string";
		reportModuleCallV1KernelError(source, false, event.data.requestNonce, err);
		return;
	}

	// TODO: Check that the domain decodes to a fully valid pubkey. The
	// pubkey is important to ensuring that only handlers written by the
	// original authors of the module are allowed to insert themselves as
	// upgrades. This prevents malicious apps from supplying malicious
	// handlers that can steal user data.
	
	// TODO: We need some way to encode into the handler what kernel
	// message protocol version the handler recognizes. We can't be sending
	// it a moduleCallV2 if it only supports moduleCallV1. This I guess
	// will be part of the packaging that wraps the module code.

	// Check the moduleMap for the domain specified in this RPC.
	var handler = moduleMap[event.data.domain];
	var workerCode = "";
	// Try to load the worker code from localstorage.
	if (handler !== undefined) {
		// TODO: Error handling.
		var handlerStorageKey = "handlerWorkerCode" + handler;
		workerCode = secureLoad(handlerStorageKey);
	}
	if (workerCode !== "" && workerCode !== undefined) {
		runModuleCallV1Worker(event, source, workerCode);
		return;
	}

	// TODO: Next steps: remember to save the handler if it works. Save the
	// code as well. Figure out a safe scheme to store the code in
	// localstorage, we probably don't want to have massive blobs in our
	// object.

	if (handler !== undefined) {
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
			// TODO: Error handling.
			kernelLog("Skynet Node: invalid message, defaultHandler must be a v1 skylink");
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
				runModuleCallV1Worker(event, source, response);
			});
	}
}

// handleSkynetNodeRequestHomescreen will fetch the user's homescreen from
// their Skynet account and serve it to the caller.
//
// TODO: Turn this into a moduleCallV1. Maybe.
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
		handleModuleCallV1(event, event.source);
		return;
	}

	// Establish a handler that will serve user's homescreen to the caller.
	if (event.data.kernelMethod === "requestHomescreen") {
		handleSkynetNodeRequestHomescreen(event);
	}

	kernelLog("Received unrecognized call: ", event.data.kernelMethod);
}
