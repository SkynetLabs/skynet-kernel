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

// TODO: When implementing versioning, need to distinguish between a developer
// domain and a production domain, and add some extra steps to publishing
// updates to the publisher domain to ensure beta code doesn't make it to the
// public.

// TODO: Need to figure out some way to avoid race conditions when a module is
// upgrading itself. The potential race is that an RPC gets called on the
// module in the middle of a module upgrade.

// TODO: We need some sort of call we can make that will block until the kernel
// has finished upgrading all modules. This call is particularly useful for
// development, devs can push a new update to their dev-module and then make
// sure the testing software gets to block until the upgrade is loaded.

// TODO: One of the consistency errors that we could run into when upgrading
// the kernel is having two windows open on different devices that are each
// running different versions of the kernel. That could cause data corruption
// and inconsistency if they aren't coordinating around the upgrade together
// effectively.

declare var downloadV1Skylink

// Set up a logging method that can be enabled and disabled.
//
// TODO: Add an RPC to enable and disable this at runtime.
//
// TODO: Make this more like the one for home.
var debugging = true;
var kernelLog = function(...msg) {
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
		kernelLog("Skynet Kernel ERROR: unable securely load the moduleMap");
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
//
// TODO: provide the domain of the caller to the modules so they can implement
// permissions.
var runModuleCallV1Worker = function(rwEvent, rwSource, rwSourceIsWorker, workerCode) {
	kernelLog("Skynet Kernel: creating worker to handle a moduleCallV1");
	kernelLog(rwEvent.data);
	kernelLog(rwSource);
	kernelLog(rwSourceIsWorker);
	let url = URL.createObjectURL(new Blob([workerCode]));
	let worker = new Worker(url);
	worker.onmessage = function(wEvent) {
		kernelLog("Skynet Kernel: moduleCallV1 worker got a message");
		kernelLog(rwEvent.data);
		kernelLog(rwSource);
		kernelLog(rwSourceIsWorker);
		kernelLog(wEvent.data);
		// Check if the worker is trying to make a call to
		// another module.
		if (wEvent.data.kernelMethod === "moduleCallV1") {
			kernelLog("Skynet Kernel: moduleCallV1 worker is calling moduleCallV1");
			handleModuleCallV1(wEvent, worker, true);
			return;
		}

		// Check if the worker is responding to the original
		// caller.
		if (wEvent.data.kernelMethod === "moduleResponseV1") {
			kernelLog("Skynet Kernel: moduleCallV1 worker is sending a moduleResponseV1");
			let message = {
				domain: wEvent.data.domain,
				kernelMethod: "moduleResponseV1",
				requestNonce: rwEvent.data.requestNonce,
				moduleResponse: wEvent.data.moduleResponse
			}

			// If the source is a worker, the postMessage call
			// needs to be constructed differently than if the
			// source is a window.
			if (rwSourceIsWorker) {
				rwSource.postMessage(message);
			} else {
				rwSource.postMessage(message, "*");
			}
			worker.terminate();
			return;
		}

		// TODO: Some sort of error framework here, we
		// shouldn't be arriving to this code block unless the
		// request was malformed.
		var err = "worker responded with an unrecognized kernelMethod while handling a moduleCallV1";
		kernelLog("Skynet Kernel: " + err);
		reportModuleCallV1KernelError(rwSource, true, rwEvent.data.requestNonce, err);
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

// handleModuleCallV1 handles a call to a version 1 skynet kernel module.
// 
// TODO: Write documentation for using V1 skynet kernel module calls. Need to
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
var handleModuleCallV1 = function(event, source, sourceIsWorker) {
	// Perform input validation - anyone can send any message to the
	// kernel, need to make sure any malicious messages result in an error.
	if (event.data.domain === undefined) {
		let err = "bad moduleCallV1 request: domain is not specified";
		kernelLog("Skynet Kernel: "+err);
		reportModuleCallV1KernelError(source, false, event.data.requestNonce, err);
		return;
	}
	if (typeof event.data.domain !== "string") {
		let err = "bad moduleCallV1 request: domain is not a string";
		kernelLog("Skynet Kernel: "+err);
		reportModuleCallV1KernelError(source, false, event.data.requestNonce, err);
		return;
	}
	if (event.data.defaultHandler === undefined) {
		let err = "bad moduleCallV1 request: defaultHandler is not specified";
		kernelLog("Skynet Kernel: "+err);
		reportModuleCallV1KernelError(source, false, event.data.requestNonce, err);
		return;
	}
	if (typeof event.data.defaultHandler !== "string") {
		let err = "bad moduleCallV1 request: defaultHandler is not a string";
		kernelLog("Skynet Kernel: "+err);
		reportModuleCallV1KernelError(source, false, event.data.requestNonce, err);
		return;
	}
	/*
	// Check the encoding of the defaultHandler. The encoding is:
	// + 2 bytes for the kernel version of the handler.
	// + 17 bytes for the revision number
	// + 34 bytes for the skylinkV1
	// + 64 bytes for the signature from the domain
	//
	// That's 117 bytes total which encodes to 156 bytes of base64.
	//
	// TODO: I wasn't sure how else to support the revision number, in
	// theory it only needs to be 8 bytes but I couldn't figure out how to
	// do this with uint8arrays or other convenient binary objects.
	if (event.data.defaultHandler.length !== 156) {
		let err = "bad moduleCallV1 request: defaultHandler should be 156 characters long";
		kernelLog("Skynet Kernel: "+err);
		reportModuleCallV1KernelError(source, false, event.data.requestNonce, err);
		return;
	}
	// Convert to binary. Be sure to catch any parsing errors.
	let defaultHandlerBinary = ""
	try {
		let defaultHandlerBinary = atob(event.data.defaultHandler);
	} catch {
		let err = "bad moduleCallV1 request: defaultHandler is not valid base64";
		kernelLog("Skynet Kernel: "+err);
		reportModuleCallV1KernelError(source, false, event.data.requestNonce, err);
		return;
	}
	// Parse out the encoding version. The main reason this is two bytes
	// instead of one is to allow the full base64 string to encode to an
	// even number of bytes.
	//
	// NOTE: Version "01" tells us how the rest of the default handler is
	// parsed, and also tells us that the hander speaks kernel version 01.
	let version = defaultHandlerBinary.substring(0, 2);
	if (version !== "01") {
		let err = "bad moduleCallV1 request: unrecognized defaultHandler version";
		kernelLog("Skynet Kernel: "+err);
		reportModuleCallV1KernelError(source, false, event.data.requestNonce, err);
		return;
	}
	// Parse out the revision number.
	let defaultHandlerRevisionNumber = 0h
	try {
		defaultHandlerRevisionNumber = BigInt(defaultHandlerBinary.substring(2,19);
	} catch {
		let err = "bad moduleCallV1 request: defaultHandler revision number could not be parsed";
		kernelLog("Skynet Kernel: "+err);
		reportModuleCallV1KernelError(source, false, event.data.requestNonce, err);
		return;
	}
	// Parse out the skylink.
	let skylink = defaultHandlerBinary.substring(19, 53);
	// TODO: Make sure it's a valid V1 skylink.
	let skylinkB64 = btoa(skylink);
	// TODO: Parse out the domain and make sure it's a fully valid pubkey.
	//
	// TODO: Parse out the signature and make sure the signature matches
	// the domain.
	*/

	// Define a helper function to fetch the workerCode from a skylink.
	// This will be called if for some reason the worker code is not
	// available locally.
	var runModuleFromSkylink = function(skylink) {
		downloadV1Skylink(skylink)
			.then(response => {
				// Kick off a worker to handle the request.
				runModuleCallV1Worker(event, source, sourceIsWorker, response);

				// TODO: This was only called if the worker
				// code was not available in the local storage.
				// Kick off a background thread to save the
				// worker code to local storage, and then
				// subsequently run an upgrade process. When
				// implementing this, we'll want the handler as
				// well.
			});
			// TODO: Error handling.
	}
	// TODO: This line is just here to help debugging.
	runModuleFromSkylink(event.data.defaultHandler);

	/*
	// Check the moduleMap for the domain specified in this RPC.
	var handler = moduleMap[event.data.domain];
	if (handler === undefined) {
		runModuleFromSkylink(event.data.defaultHandler);
		return;
	}
	// Parse the version of the saved handler and make sure the version is
	// greater than or equal to the version in the default handler.
	let savedHandlerKernelVersion = handler.substring(0, 2);
	if (savedHandlerKernelVersion !== "01") {
		runModuleFromSkylink(event.data.defaultHandler);
		return;
	}
	try {
		let savedHandlerRevisionNumber = BigInt(handler.substring(2, 19));
		if (savedHandlerRevisionNumber < defaultHandlerRevisionNumber) {
			runModuleFromSkylink(event.data.defaultHandler);
			return;
		}
	} catch {
		runModuleFromSkylink(event.data.defaultHandler);
		return;
	}

	// Try to load the worker code from local storage.
	try {
		let handlerStorageKey = "handlerWorkerCode" + handler;
		let workerCode = secureLoad(handlerStorageKey);
		runModuleCallV1Worker(event, source, sourceIsWorker, workerCode);
	} catch {
		// Try to fetch the worker code from Skynet.
		runModuleFromSkylink(skylinkB64);
	}
	*/
}

// handleSkynetKernelRequestHomescreen will fetch the user's homescreen from
// their Skynet account and serve it to the caller.
//
// TODO: Turn this into a moduleCallV1. Maybe.
var handleSkynetKernelRequestHomescreen = function(event) {
	// TODO: Instead of using hardcoded skylinks, derive some
	// registry locations from the user's seed, verify the
	// downloads, and then use those.
	//
	// TODO: We can/should probably start fetching these as soon as
	// the kernel starts up, instead of waiting until the first
	// request.
	//
	// TODO: We should save the user's homescreen files to local
	// storage and load them from local storage for a performance
	// boost. After loading them locally and serving them to the
	// caller, we can check if there was an update.
	var jsResp = downloadV1Skylink("https://siasky.net/branch-file:::skynet-kernel-skyfiles/homescreen.js/");
	var htmlResp = downloadV1Skylink("https://siasky.net/branch-file:::skynet-kernel-skyfiles/homescreen.html/");
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
		handleModuleCallV1(event, event.source, false);
		return;
	}

	// Establish a handler that will serve user's homescreen to the caller.
	if (event.data.kernelMethod === "requestHomescreen") {
		handleSkynetKernelRequestHomescreen(event);
	}

	kernelLog("Received unrecognized call: ", event.data.kernelMethod);
}
