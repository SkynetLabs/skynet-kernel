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

// TODO: Need to add support for QueryUpdate messages.

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

// TODO: Need to set up a system for tracking the number of workers that we
// have open and deciding when to terminate workers when we reach some
// threshold of "too many".

// TODO: Need some way to control the total number of queries that are open so
// that we don't leak memory. This needs to be handled at all layers where a
// query map exists. This gets tricky when you have multiple layers of queries
// going for a request. For example, a webapp has a query to a kernel that's a
// moduleCall, which means the kernel also has a query going to the worker. We
// need to make sure that the worker query fails eventually, and we also need
// to make sure that when it does fail we close out the webapp query as well.

// TODO: We need to make a sort of task manager app to kill workers. As far as
// I know though there's no easy way to tell how much memory and cpu each
// worker is consuming.

// TODO: Change the logging format for any postMessage based logging to include
// an array of objects to log rather than just a string, this will solve our
// issue where things like quotes around objects get escaped a billion times.
// When you do this, remember to update the test modules so that they make use
// of the new logging format properly.

// TODO: Don't declare these, actually overwrite them. We don't want to be
// dependent on a particular extension having the same implementation as all of
// the others.
declare var blake2b
declare var downloadSkylink
declare var getUserSeed
declare var defaultPortalList
declare var preferredPortals
declare var addContextToErr
declare var handleMessage
declare var log
declare var logErr
declare var handleTest
declare var handleSkynetKernelRequestOverride
declare var handleSkynetKernelProxyInfo

const kernelVersion = "v0.0.1"

// Set up a system to track messages that are sent to workers and to connect
// the responses. queriesNonce is a field to help ensure there is only one
// query for each nonce. queries is a map from a nonce to an openQuery.
interface openQuery {
	isWorker: boolean;
	domain: string;
	source: any;
	nonce: number;
}
var queriesNonce = 0
var queries = new Object()

// modules is an array that keeps track of all the modules that are currently
// running. The 'worker' is the webworker object that runs the code of the
// module, and the 'ready' object is a promise which will resolve when the
// worker sends a message indicating that it is ready to receive messages.
interface module {
	// The webworker object.
	worker: Worker;

	// The domain that the worker is allowed to operate within.
	domain: string;
}
var modules = new Object()

// respondErr will send an error response to the caller that closes out the
// query for the provided nonce. The gross extra inputs of 'messagePortal' and
// 'isWorker' are necessary to handle the fact that the MessageEvent you get
// from a worker message is different from the MessageEvent you get from a
// window message, and also from the fact that postMessage has different
// arguments depending on whether the messagePortal is a worker or a window.
function respondErr(event: any, messagePortal: any, isWorker: boolean, err: string) {
	let message = {
		nonce: event.data.nonce,
		method: "response",
		err,
	}
	if (isWorker === true) {
		messagePortal.postMessage(message)
	} else {
		messagePortal.postMessage(message, event.origin)
	}
}

// Create a standard message handler for the workers. Every worker will be
// using this handler. The event input is the standard MessageEvent that is
// presented when the worker sends a message. The domain is the domain of the
// worker. The resolve/reject pair are the resolve/reject elements of a
// promise.
function handleWorkerMessage(event: MessageEvent, module: module) {
	// Check for a method.
	if (!("method" in event.data)) {
		logErr("workerMessage", "worker message is missing method")
		// TODO: shut down the worker for being buggy.
		return
	}
	
	// Check whether this is a logging call.
	if (event.data.method === "log") {
		if (!("data" in event.data)) {
			logErr("workerMessage", "received log with no data field")
			return
		}
		if (!("isErr" in event.data.data) || !("message" in event.data.data)) {
			logErr("workerMessage", "received log message, missing data.isErr or data.message")
			return
		}
		// TODO: We probably want the log function to treat the domain
		// as a tag, we need some way to control here which domains get
		// to log and which domains do not, which might suggest the way
		// we handle tags is not quite correct.
		if (event.data.data.isErr === true) {
			logErr("workerMessage", module.domain, event.data.data.message)
		} else {
			log("workerMessage", module.domain, event.data.data.message)
		}
		return
	}

	// Check for a nonce.
	if (!("nonce" in event.data) || !("method" in event.data)) {
		logErr("workerMessage", "worker message is missing nonce")
		// TODO: shut down the worker for being buggy.
		return
	}

	// Check for a test method, this is also a way to get the version of
	// the kernel. It was easier to just define the full message here than
	// to abstract the handleTest function to be able to handle responding
	// to both webworkers and windows.
	if (event.data.method === "test") {
		module.worker.postMessage({
			nonce: event.data.nonce,
			method: "response",
			err: null,
			data: {
				version: kernelVersion,
			},
		})
		return
	}

	// If the method is a moduleCall, open a query to the worker that is
	// being called.
	if (event.data.method === "moduleCall") {
		handleModuleCall(event, module.worker, module.domain, true)
		return
	}

	// Only options left are response and responseUpdate
	if (event.data.method !== "responseUpdate" && event.data.method !== "response") {
		logErr("workerMessage", "received message from worker with unrecognized method")
		// TODO: Shut down the worker for being buggy.
		return
	}

	// Grab the query information so that we can properly relay the worker
	// response to the original caller.
	if (!(event.data.nonce in queries)) {
		if (event.data.method === "responseUpdate") {
			// It's possible that non-deterministic ordering of
			// messages resulted in this responseUpdate being
			// processed after the final response was processed,
			// therefore this is not a fatal error and doesn't need
			// to result in the worker being shut down.
			return
		}
		logErr("workerMessage", "received message from worker for non-existent nonce")
		// TODO: Shut down the worker for being buggy.
		return
	}
	log("debug", "received a response or responseUpdate from the worker, sending back to caller")
	let sourceIsWorker = queries[event.data.nonce].isWorker
	let sourceNonce = queries[event.data.nonce].nonce
	let source = queries[event.data.nonce].source

	// Check that the required fields and rules are met.
	if (!("err" in event.data) || !("data" in event.data)) {
		logErr("workerMessage", "responseUpdates from worker need to have an err and data field")
		// TODO: shut down the worker for being buggy.
		return
	}
	let errNull = event.data.err === null
	let dataNull = event.data.data === null
	if (errNull === dataNull) {
		logErr("workerMessage", "exactly one of err and data must be null")
		// TODO: shut down the worker for being buggy.
		return
	}

	// Pass the message to the original caller.
	let msg = {
		nonce: sourceNonce,
		method: event.data.method,
		err: event.data.err,
		data: event.data.data,
	}
	log("debug", "kernel received response message from worker, sending it forward", msg)
	if (sourceIsWorker === true) {
		log("debug", "sourceIsWorker was set to true!?")
		source.postMessage(msg)
	} else {
		log("debug", "sending to source", source.origin)
		source.postMessage(msg, source.origin)
	}

	// For responses only, close out the query.
	if (event.data.method === "response") {
		delete queries[event.data.nonce]
	}
}

// createMdoule will create a worker for the provided code.
//
// TODO: Need to set up an onerror
function createModule(workerCode: Uint8Array, domain: string): [module, string] {
	// Create a webworker from the worker code.
	let module = {} as module
	let url = URL.createObjectURL(new Blob([workerCode]))
	try {
		module.worker = new Worker(url)
	} catch (err) {
		logErr("createModule", "unable to create worker", domain, err)
		return [null, addContextToErr(err, "unable to create worker")]
	}
	module.worker.onmessage = function(event: MessageEvent) {
		log("debug", "received message from worker", event.data)
		handleWorkerMessage(event, module)
	}

	let path = "moduleSeedDerivation"+domain
	let u8Path = new TextEncoder().encode(path)
	let moduleSeedPreimage = new Uint8Array(u8Path.length+16)
	let moduleSeed = blake2b(moduleSeedPreimage).slice(0, 16)
	module.worker.postMessage({
		method: "presentSeed",
		domain: "root",
		data: {
			seed: moduleSeed,
		},
	})
	return [module, null]
}

// handleModuleCall will handle a callModule message sent to the kernel from an
// extension or webpage.
function handleModuleCall(event: MessageEvent, messagePortal: any, domain: string, isWorker: boolean) {
	if (!("data" in event.data) || !("module" in event.data.data)) {
		logErr("moduleCall", "received moduleCall with no module field in the data", event.data)
		respondErr(event, messagePortal, isWorker, "moduleCall is missing 'module' field: "+JSON.stringify(event.data))
		return
	}
	if (typeof event.data.data.module !== "string" || event.data.data.module.length != 46) {
		logErr("moduleCall", "received moduleCall with malformed module")
		respondErr(event, messagePortal, isWorker, "'module' field in moduleCall is expected to be a base64 skylink")
		return
	}
	if (!("method" in event.data.data)) {
		logErr("moduleCall", "received moduleCall without a method set for the module")
		respondErr(event, messagePortal, isWorker, "no 'data.method' specified, module does not know what method to run")
		return
	}
	if (event.data.data.method === "presentSeed") {
		log("debug", "caught an illegal call to presentSeed")
		logErr("moduleCall", "received malicious moduleCall - only root is allowed to use presentSeed method")
		respondErr(event, messagePortal, isWorker, "presentSeed is a priviledged method, only root is allowed to use it")
		return
	}
	if (!("data" in event.data.data)) {
		logErr("moduleCall", "received moduleCall with no input for the module")
		respondErr(event, messagePortal, isWorker, "no field data.data in moduleCall, data.data contains the module input")
		return
	}

	// TODO: Load any overrides.
	let finalModule = event.data.data.module

	// Define a helper function to create a new query to the module.
	let newModuleQuery = function(module: module) {
		// Before doing anything, we need to wait for the worker to
		// finish startup.
		let nonce = queriesNonce
		queriesNonce += 1
		queries[nonce] = {
			isWorker,
			domain,
			source: messagePortal,
			nonce: event.data.nonce,
		}
		log("debug", "sending message to worker", domain, event.data)
		module.worker.postMessage({
			nonce: nonce,
			domain,
			method: event.data.data.method,
			data: event.data.data.data,
		})
	}

	// Check the worker pool to see if this module is already running.
	if (finalModule in modules) {
		let module = modules[finalModule]
		newModuleQuery(module)
		return
	}

	// TODO: Check localStorage for the module.

	// Download the code for the worker.
	downloadSkylink(event.data.data.module)
	.then(result => {
		// TODO: Save the result to localStorage. Can't do that until
		// subscriptions are in place so that localStorage can sync
		// with any updates from the remote module.

		// Create a new module.
		let [module, err] = createModule(result.fileData, domain)
		if (err !== null) {
			respondErr(event, messagePortal, isWorker, addContextToErr(err, "unable to create module"))
			return
		}

		// Add the module to the list of modules.
		modules[event.data.data.module] = module
		newModuleQuery(module)
	})
	.catch(err => {
		logErr("moduleCall", "unable to download module", err)
		respondErr(event, messagePortal, isWorker, "unable to download module: "+err)
	})
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
	//
	// It was easier to inline the message than to abstract it.
	if (event.data.method === "test") {
		event.source.postMessage({
			nonce: event.data.nonce,
			method: "response",
			err: null,
			data: {
				version: kernelVersion,
			},
		}, event.origin)
		return
	}

	// Establish handlers for the major kernel methods.
	if (event.data.method === "moduleCall") {
		log("debug", "received moduleCall", event.data)
		// Check for a domain. If the message was sent by a browser
		// extension, we trust the domain provided by the extension,
		// otherwise we use the domain of the parent as the domain.
		// This does mean that the kernel is trusting that the user has
		// no malicious browser extensions, as we aren't checking for
		// **which** extension is sending the message, we are only
		// checking that the message is coming from a browser
		// extension.
		if (event.origin.startsWith("moz") && !("domain" in event.data)) {
			logErr("moduleCall", "caller is an extension, but no domain was provided")
			respondErr(event, event.source, false, "caller is an extension, but not domain was provided")
			return
		}
		let domain
		if (event.origin.startsWith("moz")) {
			domain = event.data.domain
		} else {
			domain = new URL(event.origin).hostname
		}
		handleModuleCall(event, event.source, domain, false)
		return
	}
	if (event.data.method === "requestOverride") {
		handleSkynetKernelRequestOverride(event)
		return
	}
	if (event.data.method === "proxyInfo") {
		handleSkynetKernelProxyInfo(event)
		return
	}

	// Unrecognized method, reject the query.
	respondErr(event, event.source, false, "unrecognized method: "+event.data.method)
}
