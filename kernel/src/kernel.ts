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
declare var encodeNumber
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

const kernelDistro = "SkynetLabs"
const kernelVersion = "0.1.0"

// Set up a system to track messages that are sent to workers and to connect
// the responses. queriesNonce is a field to help ensure there is only one
// query for each nonce. queries is a map from a nonce to an openQuery.
interface openQuery {
	isWorker: boolean;
	domain: string;
	source: any;
	dest: any;
	nonce: string;
}
var queriesNonce = 0
var queries = {}

// modules is a hashmap that maps from a domain to the module that responds to
// that domain.
interface module {
	worker: Worker;
	domain: string;
}
var modules = {}

// Grab the user's seed because we need it for kernel operations.
let [rootSeed, errGSU] = getUserSeed()
if (errGSU !== null) {
	logErr("error", "unable to create worker because seed is unavailable", errGSU)
	throw "unable to load user seed when loading kernel"
}

// Derive the active seed for this session. We define an active seed so that
// the user has control over changing accounts later, they can "change
// accounts" by switching up their active seed and then reloading all modules.
let activeSeedSalt = new TextEncoder().encode("account:user")
let activeSeedPreimage = new Uint8Array(rootSeed.length + activeSeedSalt.length)
activeSeedPreimage.set(rootSeed, 0)
activeSeedPreimage.set(activeSeedSalt, rootSeed.length)
let activeSeed = blake2b(activeSeedPreimage).slice(0 ,16)

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
		data: {},
		err,
	}
	if (isWorker === true) {
		messagePortal.postMessage(message)
	} else {
		messagePortal.postMessage(message, event.origin)
	}
}

// Create a standard message handler for messages coming from workers.
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
			// TODO: shut down the worker for being buggy.
			return
		}
		if (!("isErr" in event.data.data) || !("message" in event.data.data)) {
			logErr("workerMessage", "received log message, missing data.isErr or data.message")
			// TODO: shut down the worker for being buggy.
			return
		}
		// TODO: We probably want the log function to treat the domain
		// as a tag, we need some way to control here which domains get
		// to log and which domains do not, which might suggest the way
		// we handle tags is not quite correct.
		if (event.data.data.isErr === true) {
			logErr("debug", module.domain, event.data.data.message)
			logErr("workerMessage", module.domain, event.data.data.message)
		} else {
			log("workerMessage", module.domain, event.data.data.message)
		}
		return
	}

	// Check for a nonce.
	if (!("nonce" in event.data)) {
		logErr("workerMessage", "worker message is missing nonce")
		// TODO: shut down the worker for being buggy.
		return
	}

	// Check if ther worker is performing a test query.
	if (event.data.method === "version") {
		module.worker.postMessage({
			nonce: event.data.nonce,
			method: "response",
			err: null,
			data: {
				distribution: kernelDistro,
				version: kernelVersion,
			},
		})
		return
	}

	// If the method is a moduleCall, create a query with the worker that
	// is being called.
	if (event.data.method === "moduleCall") {
		handleModuleCall(event, module.worker, module.domain, true)
		return
	}

	// The only other methods allowed are the queryUpdate, responseUpdate,
	// and response methods.
	let isQueryUpdate = event.data.method === "queryUpdate"
	let isResponseUpdate = event.data.method === "responseUpdate"
	let isResponse = event.data.method === "response"
	if (isQueryUpdate !== true && isResponseUpdate !== true && isResponse !== true) {
		logErr("workerMessage", "received message from worker with unrecognized method")
		// TODO: Shut down the worker for being buggy.
		return
	}

	// Check that the data field is present.
	if (!("data" in event.data)) {
		logErr("workerMessage", "responses and updates from worker need to have a data field")
		// TODO: shut down the worker for being buggy.
		return
	}

	// Grab the query information so that we can properly relay the worker
	// response to the original caller.
	if (!(event.data.nonce in queries)) {
		if (isQueryUpdate === true || isResponseUpdate === true) {
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

	if (isQueryUpdate) {
		// Check that the module still exists before sending a queryUpdate to
		// the module.
		let dest = queries[event.data.nonce].dest
		if (!(dest in modules)) {
			logErr("workerMessage", "worker is sending queryUpdate to module that was killed")
			return
		}
		modules[dest].worker.postMessage({
			nonce: event.data.nonce,
			method: event.data.method,
			data: event.data.data,
		})
		return
	}

	// Check that the err field is being used correctly for response messages.
	if (isResponse) {
		// Check that the err field exists.
		if (!("err" in event.data)) {
			logErr("workerMessage", "responses from worker need to have an err field")
			// TODO: shut down the worker for being buggy
			return
		}

		// Check that exactly one of 'err' and 'data' are null.
		let errNull = event.data.err === null
		let dataNull = event.data.data === null
		if (errNull === dataNull) {
			logErr("workerMessage", "exactly one of err and data must be null")
			// TODO: shut down the worker for being buggy.
			return
		}
	}

	// Pass the response to the original caller. Only response messages should
	// have the err field set.
	let sourceIsWorker = queries[event.data.nonce].isWorker
	let sourceNonce = queries[event.data.nonce].nonce
	let source = queries[event.data.nonce].source
	let msg = {
		nonce: sourceNonce,
		method: event.data.method,
		data: event.data.data,
	}
	// For responses only, set an error and close out the query by deleting it
	// from the query map.
	if (isResponse) {
		logErr("dropping a certain nonce", event.data.nonce, event.data)
		msg["err"] = event.data.err
		delete queries[event.data.nonce]
	} else {
		logErr("sending non-response message", msg)
	}
	if (sourceIsWorker === true) {
		source.postMessage(msg)
	} else {
		source.postMessage(msg, source.origin)
	}
}

// createModule will create a worker for the provided code.
//
// TODO: Need to set up an onerror
function createModule(workerCode: Uint8Array, domain: string): [module, string] {
	// Create a webworker from the worker code.
	let module = {
		domain,
	} as module
	let url = URL.createObjectURL(new Blob([workerCode]))
	try {
		module.worker = new Worker(url)
	} catch (err) {
		logErr("createModule", "unable to create worker", domain, err)
		return [null, addContextToErr(err, "unable to create worker")]
	}
	module.worker.onmessage = function(event: MessageEvent) {
		handleWorkerMessage(event, module)
	}

	let path = "moduleSeedDerivation"+domain
	let u8Path = new TextEncoder().encode(path)
	let moduleSeedPreimage = new Uint8Array(u8Path.length+16)
	moduleSeedPreimage.set(u8Path, 0)
	moduleSeedPreimage.set(activeSeed, u8Path.length)
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
function handleModuleCall(event: MessageEvent, messagePortal: any, callerDomain: string, isWorker: boolean) {
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
	if (typeof event.data.data.method !== "string") {
		logErr("moduleCall", "recieved moduleCall with malformed method")
		respondErr(event, messagePortal, isWorker, "'data.method' needs to be a string")
		return
	}
	if (event.data.data.method === "presentSeed") {
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
	let finalModule = event.data.data.module // Can change with overrides.
	let moduleDomain = event.data.data.module // Does not change with overrides.

	// Define a helper function to create a new query to the module. It will
	// both open a query on the module and also send an update message to the
	// caller with the kernel nonce for this query so that the caller can
	// perform query updates.
	let newModuleQuery = function(module: module) {
		// Get the nonce for this query. The nonce is a
		// cryptographically secure string derived from a number and
		// the user's seed. We use 'kernelNonceSalt' as a salt to
		// namespace the nonces and make sure other processes don't
		// accidentally end up using the same hashes.
		let nonceSalt = new TextEncoder().encode("kernelNonceSalt")
		let nonceBytes = encodeNumber(queriesNonce)
		let noncePreimage = new Uint8Array(nonceSalt.length + activeSeed.length + nonceBytes.length)
		noncePreimage.set(nonceSalt, 0)
		noncePreimage.set(activeSeed, nonceSalt.length)
		noncePreimage.set(nonceBytes, nonceSalt.length+activeSeed.length)
		let nonce = blake2b(noncePreimage)
		queriesNonce += 1
		queries[nonce] = {
			isWorker,
			domain: callerDomain,
			source: messagePortal,
			dest: moduleDomain,
			nonce: event.data.nonce,
		}

		// Send the message to the worker to start the query.
		module.worker.postMessage({
			nonce: nonce,
			domain: callerDomain,
			method: event.data.data.method,
			data: event.data.data.data,
		})

		// If the caller is asking for the kernel nonce for this query,
		// send the kernel nonce. We don't always send the kernel nonce
		// because messages have material overhead.
		if (event.data.sendKernelNonce === true) {
			let msg = {
				nonce: event.data.nonce,
				method: "responseNonce",
				data: {
					nonce,
				}
			}
			if (isWorker) {
				messagePortal.postMessage(msg)
			} else {
				messagePortal.postMessage(msg, event.origin)
			}
		}
	}

	// Check the worker pool to see if this module is already running.
	if (moduleDomain in modules) {
		let module = modules[moduleDomain]
		newModuleQuery(module)
		return
	}

	// TODO: Check localStorage for the module.

	// Download the code for the worker.
	downloadSkylink(finalModule)
	.then(result => {
		// TODO: Save the result to localStorage. Can't do that until
		// subscriptions are in place so that localStorage can sync
		// with any updates from the remote module.

		// Check for a 404.
		//
		// NOTE: This is a side-effect of using the old version of
		// progressiveFetch. When we switch to writing the kernel using
		// libkernel, this check will change.
		if (result.response.status === 404) {
			respondErr(event, messagePortal, isWorker, "could not load module, received 404")
			return
		}

		// Create a new module.
		let [module, err] = createModule(result.fileData, moduleDomain)
		if (err !== null) {
			respondErr(event, messagePortal, isWorker, addContextToErr(err, "unable to create module"))
			return
		}

		// Add the module to the list of modules.
		modules[moduleDomain] = module
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
	if (event.data.method === "version") {
		event.source.postMessage({
			nonce: event.data.nonce,
			method: "response",
			err: null,
			data: {
				distribution: kernelDistro,
				version: kernelVersion,
			},
		}, event.origin)
		return
	}

	// Establish handlers for the major kernel methods.
	if (event.data.method === "moduleCall") {
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
	if (event.data.method === "queryUpdate") {
		respondErr(event, event.source, false, "queryUpdate not yet supported")
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
