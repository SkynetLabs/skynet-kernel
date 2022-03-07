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

// TODO: The bootloader already has a bootstrap process for grabbing the user's
// preferred portals. This process is independent of the full process, which we
// need to marry to the bootstrap process.

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

// TODO: Need to set up a system that watches for updates to our worker code
// and then injects the new code into the workers object.

// TODO: Don't declare these, actually overwrite them. We don't want to be
// dependent on a particular extension having the same implementation as all of
// the others.
declare var downloadV1Skylink
declare var downloadSkylink
declare var getUserSeed
declare var defaultPortalList
declare var preferredPortals
declare var addContextToErr
declare var handleMessage
declare var log
declare var logErr
declare var handleTest
declare var handleSkynetKernelFetchGET
declare var handleSkynetKernelProxyInfo

// workers is an object which holds all of the workers in the kernel. There is
// one worker per module.
var workers = new Object()

// createWorker will create a worker for the provided code.
function createWorker(workerCode) {
	let url = URL.createObjectURL(new Blob([workerCode]))
	let worker = new Worker(url)
	return worker
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
		let err = "bad moduleCall request: module is not specified"
		reportModuleCallKernelError(source, false, event.data.requestNonce, err)
		logErr("moduleCall", "module not specified")
		return
	}
	if (typeof event.data.module !== "string") {
		let err = "bad moduleCall request: module is not a string"
		reportModuleCallKernelError(source, false, event.data.requestNonce, err)
		logErr("moduleCall", "module not string")
		return
	}
	if (event.data.module.length !== 46) {
		let err = "bad moduleCall request: module is not 46 characters"
		reportModuleCallKernelError(source, false, event.data.requestNonce, err)
		logErr("moduleCall", "module not 46 chars")
		return
	}

	// TODO: Load any overrides.

	// Check the local cache to see if the worker already exists.
	if (event.data.module in workers) {
		let worker = workers[event.data.module]
		runModuleCall(event, source, sourceIsWorker, worker)
		return
	}

	// TODO: Check localStorage for the module.

	// Download the code for the worker.
	downloadSkylink(event.data.module)
	.then(result => {
		// TODO: Save the result to localStorage. Can't do that until
		// subscriptions are in place.

		let worker = createWorker(result.fileData)
		workers[event.data.module] = worker
		runModuleCall(event, source, sourceIsWorker, worker)
	})
	.catch(err => {
		err = addContextToErr(err, "unable to download module")
		reportModuleCallKernelError(source, false, event.data.requestNonce, err)
	})
}

// Define the function that will create a blob from the handler code for the
// worker. We need to define this as a separate function because any code we
// fetch from Skynet needs to be run in a promise.
//
// One of the major security concerns with this function is that multiple
// different modules are going to be communicating with each other. We need to
// make sure that key inputs like 'method' and 'nonce' can't be read or
// interfered with. I believe the current implementation has been completed in
// a secure and robust way, but any changes made to this function should
// carefully think through security implications, as we have multiple bits of
// untrusted code running inside of this worker, and those bits of code may
// intentionally be trying to mess with each other as well as mess with the
// kernel itself.
var runModuleCall = function(rwEvent, rwSource, rwSourceIsWorker, worker) {
	worker.onmessage = function(wEvent) {
		// Check that the worker message contains a method.
		if (!("data" in wEvent) || !("method" in wEvent.data)) {
			let msg = "worker did not include a method in its response"
			logErr("workerMessage", msg)
			reportModuleCallKernelError(rwSource, rwSourceIsWorker, rwEvent.data.nonce, msg)
			return
		}

		// Check if the worker is trying to make a call to another
		// module.
		if (wEvent.data.method === "moduleCall") {
			logErr("workerMessage", "worker is making a module call")
			handleModuleCall(wEvent, worker, true)
			return
		}

		// Check if the worker is responding to the original caller.
		if (wEvent.data.method === "moduleResponse") {
			if (!("moduleResponse" in wEvent.data)) {
				let msg = "worker did not include a moduleResponse field in its moduleResponse"
				logErr("workerMessage", msg)
				reportModuleCallKernelError(rwSource, rwSourceIsWorker, rwEvent.data.nonce, msg)
				return
			}
			let message = {
				queryStatus: "resolve",
				method: "moduleResponse",
				nonce: rwEvent.data.nonce,
				err: null,
				output: wEvent.data.moduleResponse,
			}

			// If the source is a worker, the postMessage call
			// needs to be constructed differently than if the
			// source is a window.
			if (rwSourceIsWorker) {
				rwSource.postMessage(message)
			} else {
				rwSource.postMessage(message, rwEvent.source.origin)
			}
			return
		}

		// Check whether the worker has reported an error.
		if (wEvent.data.method === "moduleResponseErr") {
			if (!("err" in wEvent.data)) {
				let msg = "worker did not include an err field in its moduleResponseErr"
				logErr("workerMessage", msg)
				reportModuleCallKernelError(rwSource, rwSourceIsWorker, rwEvent.data.nonce, msg)
				return
			}
			logErr("workerMessage", "worker returned an error:\n"+JSON.stringify(wEvent.data.err))
			reportModuleCallKernelError(rwSource, rwSourceIsWorker, rwEvent.data.nonce, wEvent.data.err)
			return
		}

		let msg = "unrecognized method\n"+JSON.stringify(wEvent.data)
		logErr("workerMessage", msg)
		reportModuleCallKernelError(rwSource, true, rwEvent.data.requestNonce, msg)
		return
	}

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
	// TODO: Need to check that the sourceDomain is correct, we are using
	// rwEvent.origin but that may not actually be the real source. This is
	// also important when receiving calls from other workers, because we
	// need to make sure the domain rights are switched over accordingly.
	//
	// TODO: Derive a proper seed for the module.
	//
	// TODO: The worker is expecting that the inputs have already been
	// checked and sanitized.
	worker.postMessage({
		seed: "TODO",
		sourceDomain: rwEvent.origin,
		method: "moduleCall",
		moduleMethod: rwEvent.data.moduleMethod,
		moduleInput: rwEvent.data.moduleInput,
	})
}

// reportModuleCallKernelError will repsond to the source with an error message,
// indicating that the RPC failed.
//
// The kernel provides a guarantee that 'err' will always be a string.
var reportModuleCallKernelError = function(source, sourceIsWorker, nonce, err) {
	let message = {
		queryStatus: "reject",
		method: "moduleResponseErr",
		nonce,
		err,
	}
	if (sourceIsWorker) {
		source.postMessage(message)
	} else {
		source.postMessage(message, source.origin)
	}
}

// Overwrite the handleMessage function that gets called at the end of the
// event handler, allowing us to support custom messages.
handleMessage = function(event) {
	// Input validation.
	if (!("method" in event.data)) {
		logErr("handleMessage", "kernel request is missing 'method' field")
		return
	}
	if (!("nonce" in event.data)) {
		logErr("handleMessage", "message sent to kernel with no nonce field")
		return
	}

	// Establish a debugging handler that a developer can call to verify
	// that round-trip communication has been correctly programmed between
	// the kernel and the calling application.
	if (event.data.method === "test") {
		handleTest(event)
		return
	}

	// Establish handlers for the major kernel methods.
	if (event.data.method === "moduleCall") {
		handleModuleCall(event, event.source, false)
		return
	}
	if (event.data.method === "fetchGET") {
		handleSkynetKernelFetchGET(event)
		return
	}
	if (event.data.method === "proxyInfo") {
		handleSkynetKernelProxyInfo(event)
		return
	}

	// Unrecognized method, reject the query.
	event.source.postMessage({
		queryStatus: "reject",
		nonce: event.data.nonce,
		method: "unrecognizedKernelMethod",
		err: "unrecognized method: "+event.data.method,
	})
}
