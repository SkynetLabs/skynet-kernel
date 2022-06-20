// This is the business logic for the Skynet kernel, responsible for
// downloading and running modules, managing queries between modules and
// applications, managing user overrides, and other core functionalities.

// NOTE: Anything and anyone can send messages to the kernel. All data that
// gets received is untrusted and potentially maliciously crafted. Type
// checking is very important.

import {
	addContextToErr,
	blake2b,
	bufToB64,
	deriveMyskyRootKeypair,
	downloadSkylink,
	encodeU64,
	error,
	tryStringify,
} from "libskynet"
import { moduleQuery, presentSeedData } from "libkmodule"

// TODO: Need to make sure the portal module is setting the field that the
// bootloader uses to get the user's default set of portals to use for
// bootloading. The bootloader will probably need to be updated to decrypt API
// keys that the user has with the portal.

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

// TODO: Need our workers to auto-update when new code is shipped.

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

// TODO: Need some better fix for the 'var queries = {} as any' line

// These three functions are expected to have already been declared by the
// bootloader. They are necessary for getting started and downloading the
// kernel while informing applications about the auth state of the kernel.
//
// The kernel is encouraged to overwrite these functions with new values.
declare var handleMessage: Function
declare var handleSkynetKernelRequestOverride: Function
declare var handleSkynetKernelProxyInfo: Function

// This variable is the seed that got loaded into memory by the bootloader, and
// is the user seed. We keep this seed in memory, because if the user ever logs
// out the kernel is expected to refresh, which will clear the seed.
declare var userSeed: Uint8Array

// Set the distribution and version of this kernel. There may be other versions
// of the kernel in the world produced by other development teams, so openly
// declaring the version number and development team allows other pieces of
// software to determine what features are or are not supported.
//
// At some point we may want something like a capabilities array, but the
// ecosystem isn't mature enough to need that.
const kernelDistro = "SkynetLabs"
const kernelVersion = "0.4.2"

// defaultMyskyRootModules lists out the set of modules that are allowed to
// receive the user's MySky root seed by default.
const defaultMyskyRootModules = ["AQBmFdF14nfEQrERIknEBvZoTXxyxG8nejSjH6ebCqcFkQ"]

// Set up a system to track messages that are sent to workers and to connect
// the responses. queriesNonce is a field to help ensure there is only one
// query for each nonce. queries is a map from a nonce to an openQuery.
//
// TODO: Apparently this interface is just never used. Maybe we don't need it?
interface openQuery {
	isWorker: boolean
	domain: string
	source: any
	origin: any
	dest: any
	nonce: string
}

// modules is a hashmap that maps from a domain to the module that responds to
// that domain.
interface module {
	worker: Worker
	domain: string
}

// wLog is a wrapper for the log and logErr functions, to deduplicate code.
//
// TODO: Need to implement a tag system for the logging.
function wLog(isErr: boolean, tag: string, ...inputs: any) {
	let message = "[skynet-kernel]\n" + tag
	for (let i = 0; i < inputs.length; i++) {
		message += "\n"
		message += tryStringify(inputs[i])
	}
	window.parent.postMessage(
		{
			method: "log",
			data: {
				isErr,
				message,
			},
		},
		"*"
	)
}
function log(tag: string, ...inputs: any) {
	wLog(false, tag, ...inputs)
}
function logErr(tag: string, ...inputs: any) {
	wLog(true, tag, ...inputs)
}

// Cluster all of the large state objects at the top so that we can easily
// track memory leaks. We log exponentially less frequently throughout the
// lifetime of the program to ensure we don't send too many messages total.
var queriesNonce = 0
var queries = {} as any
var modules = {} as any
let waitTime = 30000
function logLargeObjects() {
	let queriesLenStr = Object.keys(queries).length.toString()
	let modulesLenStr = Object.keys(modules).length.toString()
	log("open queries :: open modules : " + queriesLenStr + " :: " + modulesLenStr)
	waitTime *= 1.25
	setTimeout(logLargeObjects, waitTime)
}
setTimeout(logLargeObjects, waitTime)

// Derive the active seed for this session. We define an active seed so that
// the user has control over changing accounts later, they can "change
// accounts" by switching up their active seed and then reloading all modules.
//
// NOTE: If we ever add functionality to change the active seed (which would be
// equivalent to the user switching accounts), we need to make sure that the
// myskyRootKeypair is no longer being derived from the userSeed, but rather
// changes its derivation to the new activeSeed. We only want to use the
// userSeed as the root for the myskyRootKeypair if the active seed is the
// "defaultUserActiveSeed".
let activeSeedSalt = new TextEncoder().encode("defaultUserActiveSeed")
let activeSeedPreimage = new Uint8Array(userSeed.length + activeSeedSalt.length)
activeSeedPreimage.set(userSeed, 0)
activeSeedPreimage.set(activeSeedSalt, userSeed.length)
let activeSeed = blake2b(activeSeedPreimage).slice(0, 16)
let myskyRootKeypair = deriveMyskyRootKeypair(userSeed)

// Write a log that declares the kernel version and distribution.
log("init", "Skynet Kernel v" + kernelVersion + "-" + kernelDistro)

// respondErr will send an error response to the caller that closes out the
// query for the provided nonce. The extra inputs of 'messagePortal' and
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
//
// TODO: If the worker makes a mistake or has a bug that makes it seem
// unstable, we should create some sort of debug log that can be viewed from
// the kernel debug/control panel. We'll need to make sure the debug logs don't
// consume too much memory, and we'll need to terminate workers that are
// bugging out.
//
// TODO: Set up a ratelimiting system for modules making logs, we don't want
// modules to be able to pollute the kernel and cause instability by logging
// too much.
//
// TODO: Need to check that the postMessage call in respondErr isn't going to
// throw or cause issuse in the event that the worker who sent the message has
// been terminated.
//
// TODO: We probably need to have timeouts for queries, if a query doesn't send
// an update after a certain amount of time we drop it.
function handleWorkerMessage(event: MessageEvent, module: module) {
	// TODO: Use of respondErr here may not be correct, should only be using
	// respondErr for functions that are expecting a response and aren't
	// already part of a separate query. If they are part of a separate query
	// we need to close that query out gracefully.

	// Perform input verification for a worker message.
	if (!("method" in event.data)) {
		logErr("worker", module.domain, "received worker message with no method")
		respondErr(event, module.worker, true, "received message with no method")
		return
	}

	// Check whether this is a logging call.
	if (event.data.method === "log") {
		// Perform the input verification for logging.
		if (!("data" in event.data)) {
			logErr("worker", module.domain, "received worker log message with no data field")
			respondErr(event, module.worker, true, "received log messsage with no data field")
			return
		}
		if (typeof event.data.data.message !== "string") {
			logErr("worker", module.domain, "worker log data.message is not of type 'string'")
			respondErr(event, module.worker, true, "received log messsage with no message field")
			return
		}
		if (event.data.data.isErr === undefined) {
			event.data.data.isErr = false
		}
		if (typeof event.data.data.isErr !== "boolean") {
			logErr("worker", module.domain, "worker log data.isErr is not of type 'boolean'")
			respondErr(event, module.worker, true, "received log messsage with invalid isErr field")
			return
		}

		// Send the log to the parent so that the log can be put in the
		// console.
		if (event.data.data.isErr === false) {
			log("worker", "[" + module.domain + "]", event.data.data.message)
		} else {
			logErr("worker", "[" + module.domain + "]", event.data.data.message)
		}
		return
	}

	// Check for a nonce - log is the only message from a worker that does not
	// need a nonce.
	if (!("nonce" in event.data)) {
		event.data.nonce = "N/A"
		logErr("worker", module.domain, "worker sent a message with no nonce", event.data)
		respondErr(event, module.worker, true, "received message with no nonce")
		return
	}

	// Handle a version request.
	if (event.data.method === "version") {
		module.worker.postMessage({
			nonce: event.data.nonce,
			method: "response",
			err: null,
			data: {
				distribution: kernelDistro,
				version: kernelVersion,
				err: null,
			},
		})
		return
	}

	// Handle a call from the worker to another module.
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
		logErr("worker", module.domain, "received message from worker with unrecognized method")
		return
	}

	// TODO: Need to figure out what to do with the errors here. Do we call
	// 'respondErr'? That doesn't seem correct. It's not correct because if we
	// end a query we need to let both sides know that the query was killed by
	// the kernel.

	// Check that the data field is present.
	if (!("data" in event.data)) {
		logErr("worker", module.domain, "received response or update from worker with no data field")
		return
	}

	// Grab the query information so that we can properly relay the worker
	// response to the original caller.
	if (!(event.data.nonce in queries)) {
		// If there's no corresponding query and this is a response, send an
		// error.
		if (isResponse === true) {
			logErr("worker", module.domain, "received response for an unknown nonce")
			return
		}

		// If there's no responding query and this isn't a response, it could
		// just be an accident. queryUpdates and responseUpdates are async and
		// can therefore be sent before both sides know that a query has been
		// closed but not get processed untila afterwards.
		//
		// This can't happen with a 'response' message because the response
		// message is the only message that can close the query, and there's
		// only supposed to be one response message.
		return
	}

	// Handle the queryUpdate message, we basically just need to forward the
	// message to whatever module is processing the original query.
	if (isQueryUpdate) {
		// Check that the module still exists before sending a queryUpdate to
		// the module. If there was an error or an early termination it may not
		// exist.
		let dest = queries[event.data.nonce].dest
		if (!(dest in modules)) {
			logErr("worker", module.domain, "worker is sending queryUpdate to module that was killed")
			return
		}

		// Forward the update to the module.
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
			logErr("worker", module.domain, "got response from worker with no err field")
			return
		}

		// Check that exactly one of 'err' and 'data' are null.
		let errNull = event.data.err === null
		let dataNull = event.data.data === null
		if (errNull === dataNull) {
			logErr("worker", module.domain, "exactly one of err and data must be null")
			return
		}
	}

	// We are sending either a response message or a responseUpdate message,
	// all other possibilities have been handled.
	let sourceIsWorker = queries[event.data.nonce].isWorker
	let sourceNonce = queries[event.data.nonce].nonce
	let source = queries[event.data.nonce].source
	let origin = queries[event.data.nonce].origin
	let msg: any = {
		nonce: sourceNonce,
		method: event.data.method,
		data: event.data.data,
	}
	// For responses only, set an error and close out the query by deleting it
	// from the query map.
	if (isResponse) {
		msg["err"] = event.data.err
		delete queries[event.data.nonce]
	}
	if (sourceIsWorker === true) {
		source.postMessage(msg)
	} else {
		source.postMessage(msg, origin)
	}
}

// createModule will create a worker for the provided code.
function createModule(workerCode: Uint8Array, domain: string): [module, error] {
	// Create a webworker from the worker code.
	let module = {
		domain,
	} as module
	let url = URL.createObjectURL(new Blob([workerCode]))
	try {
		module.worker = new Worker(url)
	} catch (err: any) {
		logErr("worker", domain, "unable to create worker", domain, err)
		return [module, addContextToErr(tryStringify(err), "unable to create worker")]
	}

	// Set the onmessage and onerror functions.
	module.worker.onmessage = function (event: MessageEvent) {
		handleWorkerMessage(event, module)
	}
	module.worker.onerror = function (event: ErrorEvent) {
		logErr("worker", domain, addContextToErr(tryStringify(event.error), "received onerror event"))
	}

	// Check if the module is on the whitelist to receive the mysky seed.
	let sendMyskyRoot = false
	for (let i = 0; i < defaultMyskyRootModules.length; i++) {
		if (domain === defaultMyskyRootModules[i]) {
			sendMyskyRoot = true
			break
		}
	}

	// Send the seed to the module.
	let path = "moduleSeedDerivation" + domain
	let u8Path = new TextEncoder().encode(path)
	let moduleSeedPreimage = new Uint8Array(u8Path.length + 16)
	moduleSeedPreimage.set(u8Path, 0)
	moduleSeedPreimage.set(activeSeed, u8Path.length)
	let moduleSeed = blake2b(moduleSeedPreimage).slice(0, 16)
	let msgData: presentSeedData = {
		seed: moduleSeed,
	}
	let msg: moduleQuery = {
		method: "presentSeed",
		domain: "root",
		data: msgData,
	}
	if (sendMyskyRoot === true) {
		msg.data.myskyRootKeypair = myskyRootKeypair
	}
	module.worker.postMessage(msg)
	return [module, null]
}

// handleModuleCall will handle a callModule message sent to the kernel from an
// extension or webpage.
function handleModuleCall(event: MessageEvent, messagePortal: any, callerDomain: string, isWorker: boolean) {
	if (!("data" in event.data) || !("module" in event.data.data)) {
		logErr("moduleCall", "received moduleCall with no module field in the data", event.data)
		respondErr(event, messagePortal, isWorker, "moduleCall is missing 'module' field: " + JSON.stringify(event.data))
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
		logErr("moduleCall", "recieved moduleCall with malformed method", event.data)
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
	let newModuleQuery = function (module: module) {
		// Get the nonce for this query. The nonce is a
		// cryptographically secure string derived from a number and
		// the user's seed. We use 'kernelNonceSalt' as a salt to
		// namespace the nonces and make sure other processes don't
		// accidentally end up using the same hashes.
		let nonceSalt = new TextEncoder().encode("kernelNonceSalt")
		let [nonceBytes] = encodeU64(BigInt(queriesNonce)) // no need to check the error here, it's safe // TODO: are you sure?
		let noncePreimage = new Uint8Array(nonceSalt.length + activeSeed.length + nonceBytes.length)
		noncePreimage.set(nonceSalt, 0)
		noncePreimage.set(activeSeed, nonceSalt.length)
		noncePreimage.set(nonceBytes, nonceSalt.length + activeSeed.length)
		let nonce = bufToB64(blake2b(noncePreimage))
		queriesNonce += 1
		queries[nonce] = {
			isWorker,
			domain: callerDomain,
			source: messagePortal,
			dest: moduleDomain,
			nonce: event.data.nonce,
			origin: event.origin,
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
				},
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
		.then(([moduleData, errDS]) => {
			// TODO: Save the result to localStorage. Can't do that until
			// subscriptions are in place so that localStorage can sync
			// with any updates from the remote module.

			// Check for a 404.
			if (errDS === "404") {
				respondErr(event, messagePortal, isWorker, "could not load module, received 404")
				return
			}

			// Create a new module.
			let [module, errCM] = createModule(moduleData, moduleDomain)
			if (errCM !== null) {
				respondErr(event, messagePortal, isWorker, addContextToErr(errCM, "unable to create module"))
				return
			}

			// Add the module to the list of modules.
			modules[moduleDomain] = module
			newModuleQuery(module)
		})
		.catch((err) => {
			logErr("moduleCall", "unable to download module", err)
			respondErr(event, messagePortal, isWorker, "unable to download module: " + err)
		})
}

// Overwrite the handleMessage function that gets called at the end of the
// event handler, allowing us to support custom messages.
handleMessage = function (event: any) {
	// Input validation.
	if (!("method" in event.data)) {
		logErr("handleMessage", "kernel request is missing 'method' field")
		return
	}
	if (!("nonce" in event.data)) {
		// TODO: Need to figure out why the one thing isn't stringifying
		// correctly.
		logErr("handleMessage", "message sent to kernel with no nonce field", JSON.stringify(event.data))
		logErr("handleMessage", "message sent to kernel with no nonce field", event.data)
		return
	}

	// Establish a debugging handler that a developer can call to verify
	// that round-trip communication has been correctly programmed between
	// the kernel and the calling application.
	//
	// It was easier to inline the message than to abstract it.
	if (event.data.method === "version") {
		event.source.postMessage(
			{
				nonce: event.data.nonce,
				method: "response",
				err: null,
				data: {
					distribution: kernelDistro,
					version: kernelVersion,
					err: null,
				},
			},
			event.origin
		)
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
		// Check that the module still exists before sending a queryUpdate to
		// the module.
		if (!(event.data.nonce in queries)) {
			logErr("auth", "received queryUpdate but nonce is not recognized", event.data, queries)
			return
		}
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
	if (event.data.method === "requestOverride") {
		handleSkynetKernelRequestOverride(event)
		return
	}
	if (event.data.method === "proxyInfo") {
		handleSkynetKernelProxyInfo(event)
		return
	}

	// Unrecognized method, reject the query.
	respondErr(event, event.source, false, "unrecognized method: " + event.data.method)
}
