// The main function of the Skynet kernel is to create a secure platform for
// skynet modules to interact. A skynet module is a piece of code that gets its
// own private domain, its own private seed, and the ability to keep persistent
// data and execution code secret from other modules.
//
// The kernel provides ultimate control to the user. Though each module is
// guaranteed safety from other modules, the user has root level access that
// allows the user to access and modify any private data stored within any
// particular module.
//
// As much as possible, the kernel has been built to be minimal, with the vast
// majority of its functionality being derived from other modules. For the
// purposes of bootstrapping, there are a few exceptions. Modules themselves
// are fetched via downloading, which means there needs to be some native
// download code that exists outside of modules to avoid a chicken-and-egg
// problem for performing a download. A similar issue exists when identifying
// which portals should be used for the initial downloads. Finally, the kernel
// has an idea of 'overrides', which allows the user to forcibly replace one
// module with another, giving the new module full access to the domain of the
// original module. The override code also exists in the core of the kernel.

// One of the key properties of the module system is that the caller determines
// what domain they want to access, and then the kernel determines what code is
// going to be run for accessing that domain. The caller will never have their
// call routed or overwritten in a way that they end up in the wrong domain,
// potentially siphoning up additional data. They may however have the API
// managed differently, such that either access permissions are different,
// optimizations are different, or other elements related to control over the
// data are different.

// The versioning is expected to happen inside of the module itself. If there's
// an unrecognized call, the caller is going to have to realize that and return
// an error. If a new feature in a module or skapp is dependent on a new
// feature in another module that the user hasn't added yet (due to overrides
// or other reasons) then that new feature will have to wait to activate for
// the user until they've upgraded their module.

// TODO: Need to figure out how to pass a worker's particular seed in. Is that
// something the kernel will always provide as an input?

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
// module in the middle of a module upgrade. There might also be codependent
// calls happening. Module A calls B, which calls A again. We don't want the
// first call to have a different version than the second call. At least, I
// don't think.

// TODO: We are going to need to implement an upgrade procedure for modules so
// that they have some way to lock others out of accessing the data while a
// transformation operation is being performed. This is a bit of a distributed
// systems issue because we **will** have multiple modules from multiple
// machines all getting the upgrade at once, and you probably only want one of
// them performing any operations on the data. You need a way to tell that one
// of the transformations has failed or only made partial progress, you need a
// way to pause everyone else while the transformer is going, you need a way to
// isolate the transformation so you can start over if it fails or corrupts.

// TODO: We need some sort of call we can make that will block until the kernel
// has finished upgrading all modules. This call is particularly useful for
// development, devs can push a new update to their dev-module and then make
// sure the testing software gets to block until the upgrade is loaded.

// TODO: One of the consistency errors that we could run into when upgrading
// the kernel is having two windows open on different devices that are each
// running different versions of the kernel. That could cause data corruption
// and inconsistency if they aren't coordinating around the upgrade together
// effectively.

// TODO: All of the wildcard postmessage calls need to be updated to follow
// better security practice.

// TODO: Don't declare these, actually overwrite them. We don't want to be
// dependent on a particular extension having the same implementation as all of
// the others.
declare var downloadV1Skylink
declare var downloadSkylink
declare var getUserSeed
declare var defaultPortalList
declare var preferredPortals
declare var addContextToErr

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

// Load all of the modules that we have saved locally into memory.
var moduleMap = {};
var loadModuleMap = function() {
	var modules = "";
	try {
		modules = localStorage.getItem("moduleMap");
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
	localStorage.setItem("moduleMap", JSON.stringify(moduleMap));

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
			handleModuleCall(wEvent, worker, true);
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
	//
	// TODO: Need to add a source.
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

// handleModuleCall handles a call to a version 1 skynet kernel module.
//
// The module name should be a skylink, either V1 or V2, which holds the code
// that will run for the module. The domain of the module will be equal to the
// skylink. For V1 skylinks, there is a fundamental marriage between the code
// and the domain, any updates to the code will result in a new domain. For V2
// skylinks, which is expected to be more commonly used, the code can be
// updated by pushing new code with a higher revision number. This new code
// will have access to the same domain, effecitviely giving it root privledges
// to all data that was trusted to prior versions of the code.
var handleModuleCall = function(event, source, sourceIsWorker) {
	// Check that the module exists, and that it has been formatted as a
	// skylink.
	if (!("module" in event.data)) {
		let err = "bad moduleCallV1 request: defaultHandler is not specified"
		reportModuleCallV1KernelError(source, false, event.data.requestNonce, err)
		return
	}
	if (typeof event.data.module !== "string") {
		let err = "bad moduleCallV1 request: defaultHandler is not a string"
		reportModuleCallV1KernelError(source, false, event.data.requestNonce, err)
		return
	}
	if (event.data.module.length !== 46) {
		let err = "bad moduleCallV1 request: defaultHandler is not a string"
		reportModuleCallV1KernelError(source, false, event.data.requestNonce, err)
		return
	}

	// TODO: Load any overrides.

	// TODO: Check if the module is stored locally at all. Registry
	// subscriptions are going to be a really important part of this,
	// because that's how we're going to know that we're using the latest
	// version of anything rather than being out of date.

	// Download the code for the worker.
	downloadSkylink(event.data.module)
	.then(result => {
		// TODO: Save the module into localStorage so we don't have to
		// download it again. Also add it to the set of subscriptions
		// so we get notified immediately if the code is updated.

		runModuleCallV1Worker(event, source, sourceIsWorker, result.response)
	})
	.catch(err => {
		err = addContextToErr(err, "unable to download module")
		reportModuleCallV1KernelError(source, false, event.data.requestNonce, err)
	})
}

// handleSkynetKernelRequestURL handles messages calling the kernelMethod
// "requestURL". The primary purpose of this method is to simulate a GET call
// to a portal endpoint, but fill the response with trusted data rather than
// accepting whatever the portal serves.
//
// TODO: Need to reject unrecognized URLs.
//
// TODO: Need to return something real not just 'yo'.
var handleSkynetKernelRequestURL = function(event) {
	let enc = new TextEncoder()
	let buf = enc.encode("yo")
	let requestURLResponse = {
		kernelMethod: "requestURLResponse",
		response: buf,
		nonce: event.data.nonce,
	}
	event.source.postMessage(requestURLResponse, "*")
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

// handleRequestTest will respond to a requestTest call by sending a
// receiveTest message. If a nonce was provided, the receiveTest message will
// have a matching nonce. If there was no nonce provided, the receiveTest
// message will also have no nonce.
function handleRequestTest(event) {
	if ("nonce" in event.data) {
		event.source.postMessage({
			kernelMethod: "receiveTest",
			nonce: event.data.nonce,
			response: "receiveTest",
		}, "*")
	} else {
		event.source.postMessage({kernelMethod: "receiveTest"}, "*")
	}
}

// Overwrite the handleMessage function that gets called at the end of the
// event handler, allowing us to support custom messages.
handleMessage = function(event) {
	// Check that the authentication suceeded. If authentication did not
	// suceed, send a postMessage indicating that authentication failed.
	let [userSeed, errGSU] = getUserSeed()
	if (errGSU !== null) {
		log("message", "auth has failed, sending an authFailed message", errGSU)
		window.parent.postMessage({kernelMethod: "authFailed"}, "*")
		return
	}
	log("message", "user is authenticated")

	// If we are receiving an authCompleted message, it means the calling
	// app thinks the kernel hasn't loaded yet. Send a message indicating
	// that the load was successful. We use a slight variation on the
	// message that gets sent the first time that the kernel completes
	// loading to avoid sending the parent multiple messages and triggering
	// potential unwanted behavior (the parent may not be coded to
	// correctly handle repeat 'skynetKernelLoaded' messages).
	if (event.data.kernelMethod === "authCompleted") {
		log("lifecycle", "received authCompleted message, though kernel is already loaded\n", event)
		event.source.postMessage({kernelMethod: "skynetKernelAlreadyLoaded"}, "*")
		return
	}

	// Establish a debugging handler that a developer can call to verify
	// that round-trip communication has been correctly programmed between
	// the kernel and the calling application.
	if (event.data.kernelMethod === "requestTest") {
		handleRequestTest(event)
		return
	}

	// Establish a means for the user to logout. Only logout requests
	// provided by home are allowed.
	if (event.data.kernelMethod === "logOut" && event.origin === "https://home.siasky.net") {
		logOut()
		log("lifecycle", "sending logOutSuccess message to home")
		try {
			event.source.postMessage({kernelMethod: "logOutSuccess"}, "*")
		} catch (err) {
			log("lifecycle", "unable to inform source that logOut was competed", err)
		}
		return
	}

	// Establish a handler that manages api calls to modules.
	if (event.data.kernelMethod === "moduleCall") {
		handleModuleCall(event, event.source, false)
		return
	}

	// Establish a handler that will serve the user's homescreen to the
	// caller.
	if (event.data.kernelMethod === "requestHomescreen") {
		handleSkynetKernelRequestHomescreen(event)
		return
	}

	// Establish a handler that will serve the user's custom response for a
	// particular URL.
	if (event.data.kernelMethod === "requestURL") {
		handleSkynetKernelRequestURL(event)
	}

	kernelLog("Received unrecognized call: ", event.data.kernelMethod)
}
