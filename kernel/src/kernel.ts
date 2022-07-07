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
	b64ToBuf,
	deriveMyskyRootKeypair,
	downloadSkylink,
	encodeU64,
	error,
	tryStringify,
	validSkylink,
} from "libskynet"
import { moduleQuery, presentSeedData } from "libkmodule"

// These three functions are expected to have already been declared by the
// bootloader. They are necessary for getting started and downloading the
// kernel while informing applications about the auth state of the kernel.
//
// The kernel is encouraged to overwrite these functions with new values.
declare var handleIncomingMessage: Function
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
const kernelVersion = "0.7.0"

// defaultMyskyRootModules lists out the set of modules that are allowed to
// receive the user's MySky root seed by default.
const defaultMyskyRootModules = [
	"AQBmFdF14nfEQrERIknEBvZoTXxyxG8nejSjH6ebCqcFkQ", // Resolver link for Redsolver's Mysky Module
	"IABOv7_dkJwtuaFBeB6eTR32mSvtLsBRVffEY9yYL0v0rA", // Immutable link for the mysky test module
]

// IS_EXTENSION is a boolean that indicates whether or not the kernel is
// running in a browser extension.
const IS_EXTENSION = window.origin === "http://kernel.skynet"

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

// ModuleLaunchFn defines the type signature for the launch function of a
// module.
type ModuleLaunchFn = () => error

// modules is a hashmap that maps from a domain to the module that handles
// queries to that domain.
//
// We also keep the source code of the module so that we don't have to download
// it again if it gets called multiple times.
//
// worker and openQueries will only be set if workerIsRunning is 'true'.
interface Module {
	domain: string
	url: string
	workerIsRunning: boolean
	worker?: Worker
	openQueries?: number

	launch: ModuleLaunchFn
}

// wLog is a wrapper for the log and logErr functions, to deduplicate code.
//
// TODO: Need to implement a tag system for the logging. We will use the
// dashboard to control logging messages and verbosity.
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
let queriesNonce = 0
let queries = {} as any
let modules = {} as any
let modulesLoading = {} as any
let notableErrors: string[] = []
let waitTime = 30000
function logLargeObjects() {
	let queriesLenStr = Object.keys(queries).length.toString()
	let modulesLenStr = Object.keys(modules).length.toString()
	let modulesLoadingLenStr = Object.keys(modulesLoading).length.toString()
	log(
		"open queries :: open modules :: modules loading : " +
			queriesLenStr +
			" :: " +
			modulesLenStr +
			" :: " +
			modulesLoadingLenStr
	)
	waitTime *= 1.25
	setTimeout(logLargeObjects, waitTime)
}
setTimeout(logLargeObjects, waitTime)

// Establish the stateful variable for tracking module overrides.
let moduleOverrideList = {} as any

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
function handleWorkerMessage(event: MessageEvent, mod: Module) {
	// TODO: Use of respondErr here may not be correct, should only be using
	// respondErr for functions that are expecting a response and aren't
	// already part of a separate query. If they are part of a separate query
	// we need to close that query out gracefully.

	// Check that the module still has a running worker.
	if (mod.workerIsRunning === false) {
		let errStr = "received message from worker that supposedly isn't running"
		logErr("worker", mod.domain, errStr)
		respondErr(event, mod.worker, true, errStr)
		return
	}
	if (mod.worker === undefined || mod.openQueries === undefined) {
		let errStr = "received message but mod.worker or mod.openQueries is undefined"
		logErr("worker", mod.domain, errStr)
		respondErr(event, mod.worker, true, errStr)
		return
	}

	// Perform input verification for a worker message.
	if (!("method" in event.data)) {
		logErr("worker", mod.domain, "received worker message with no method")
		respondErr(event, mod.worker, true, "received message with no method")
		return
	}

	// Check whether this is a logging call.
	if (event.data.method === "log") {
		// Perform the input verification for logging.
		if (!("data" in event.data)) {
			logErr("worker", mod.domain, "received worker log message with no data field")
			respondErr(event, mod.worker, true, "received log messsage with no data field")
			return
		}
		if (typeof event.data.data.message !== "string") {
			logErr("worker", mod.domain, "worker log data.message is not of type 'string'")
			respondErr(event, mod.worker, true, "received log messsage with no message field")
			return
		}
		if (event.data.data.isErr === undefined) {
			event.data.data.isErr = false
		}
		if (typeof event.data.data.isErr !== "boolean") {
			logErr("worker", mod.domain, "worker log data.isErr is not of type 'boolean'")
			respondErr(event, mod.worker, true, "received log messsage with invalid isErr field")
			return
		}

		// Send the log to the parent so that the log can be put in the
		// console.
		if (event.data.data.isErr === false) {
			log("worker", "[" + mod.domain + "]", event.data.data.message)
		} else {
			logErr("worker", "[" + mod.domain + "]", event.data.data.message)
		}
		return
	}

	// Check for a nonce - log is the only message from a worker that does not
	// need a nonce.
	if (!("nonce" in event.data)) {
		event.data.nonce = "N/A"
		logErr("worker", mod.domain, "worker sent a message with no nonce", event.data)
		respondErr(event, mod.worker, true, "received message with no nonce")
		return
	}

	// Handle a version request.
	if (event.data.method === "version") {
		mod.worker.postMessage({
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
		handleModuleCall(event, mod.worker, mod.domain, true)
		return
	}

	// The only other methods allowed are the queryUpdate, responseUpdate,
	// and response methods.
	let isQueryUpdate = event.data.method === "queryUpdate"
	let isResponseUpdate = event.data.method === "responseUpdate"
	let isResponse = event.data.method === "response"
	if (isQueryUpdate !== true && isResponseUpdate !== true && isResponse !== true) {
		logErr("worker", mod.domain, "received message from worker with unrecognized method")
		return
	}

	// TODO: Need to figure out what to do with the errors here. Do we call
	// 'respondErr'? That doesn't seem correct. It's not correct because if we
	// end a query we need to let both sides know that the query was killed by
	// the kernel.

	// Check that the data field is present.
	if (!("data" in event.data)) {
		logErr("worker", mod.domain, "received response or update from worker with no data field")
		return
	}

	// Grab the query information so that we can properly relay the worker
	// response to the original caller.
	if (!(event.data.nonce in queries)) {
		// If there's no corresponding query and this is a response, send an
		// error.
		if (isResponse === true) {
			logErr("worker", mod.domain, "received response for an unknown nonce")
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
			logErr("worker", mod.domain, "worker is sending queryUpdate to module that was killed")
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
		// Decrease the number of queries to the worker.
		mod.openQueries -= 1
		if (mod.openQueries < 0) {
			logErr("openQueries for a module dropped below zero")
		}
		if (mod.openQueries === 0) {
			mod.worker.terminate()
			delete mod.worker
			delete mod.openQueries
			mod.workerIsRunning = false
		}

		// Check that the err field exists.
		if (!("err" in event.data)) {
			logErr("worker", mod.domain, "got response from worker with no err field")
			return
		}

		// Check that exactly one of 'err' and 'data' are null.
		let errNull = event.data.err === null
		let dataNull = event.data.data === null
		if (errNull === dataNull) {
			logErr("worker", mod.domain, "exactly one of err and data must be null")
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

// createModule will create a module from the provided worker code and domain.
// This call does not launch the worker, that should be done separately.
function createModule(workerCode: Uint8Array, domain: string): Module {
	// Generate the URL for the worker code.
	let url = URL.createObjectURL(new Blob([workerCode]))

	// Create the module object.
	let mod = {
		domain,
		url,
		workerIsRunning: false,

		launch: function (): error {
			return launchModule(mod)
		},
	} as Module
	return mod
}

// launchModule is the function that gets called in module.launch to launch a worker.
function launchModule(mod: Module): error {
	// Check if the worker is already running.
	if (mod.workerIsRunning === true) {
		return "cannot launch the module, the module is already running"
	}

	// Create and launch the worker.
	try {
		mod.worker = new Worker(mod.url)
	} catch (err: any) {
		logErr("worker", mod.domain, "unable to create worker", mod.domain, err)
		return addContextToErr(tryStringify(err), "unable to create worker")
	}
	mod.workerIsRunning = true
	mod.openQueries = 0

	// Set the onmessage and onerror functions.
	mod.worker.onmessage = function (event: MessageEvent) {
		handleWorkerMessage(event, mod)
	}
	mod.worker.onerror = function (event: ErrorEvent) {
		logErr("worker", mod.domain, addContextToErr(tryStringify(event.error), "received onerror event"))
	}

	// Check if the module is on the whitelist to receive the mysky seed.
	let sendMyskyRoot = defaultMyskyRootModules.includes(mod.domain)

	// Send the seed to the module.
	let path = "moduleSeedDerivation" + mod.domain
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
	mod.worker.postMessage(msg)
	return null
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
	let newModuleQuery = function (mod: Module) {
		// Launch the worker if it is not running already.
		if (mod.workerIsRunning === false) {
			let err = mod.launch()
			if (err !== null) {
				let errCtx = addContextToErr(err, "unable to launch worker")
				logErr("worker", errCtx)
				respondErr(event, messagePortal, isWorker, errCtx)
				return
			}
		}

		// Add one to the number of open queries on the module.
		//
		// We can ignore the undefined check because we checked above if the
		// worker was running and called mod.launch(), which will create these
		// fields if they don't already exist.
		mod.openQueries! += 1

		// Get the nonce for this query. The nonce is a
		// cryptographically secure string derived from a number and
		// the user's seed. We use 'kernelNonceSalt' as a salt to
		// namespace the nonces and make sure other processes don't
		// accidentally end up using the same hashes.
		let nonceSalt = new TextEncoder().encode("kernelNonceSalt")
		let [nonceBytes] = encodeU64(BigInt(queriesNonce))
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
		mod.worker!.postMessage({
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

	// Check the worker pool to see if this module is already available.
	if (moduleDomain in modules) {
		let module = modules[moduleDomain]
		newModuleQuery(module)
		return
	}

	// Check if another thread is already fetching the module.
	if (moduleDomain in modulesLoading) {
		let p = modulesLoading[moduleDomain]
		p.then((errML: error) => {
			if (errML !== null) {
				respondErr(event, messagePortal, isWorker, addContextToErr(errML, "module could not be loaded"))
				return
			}
			let module = modules[moduleDomain]
			newModuleQuery(module)
		})
	}

	// Fetch the module in a background thread, and launch the query once the
	// module is available.
	let moduleLoadedPromise = new Promise((resolve) => {
		// TODO: Check localStorage for the module.

		// Download the code for the worker.
		downloadSkylink(finalModule).then(([moduleData, errDS]) => {
			// TODO: Save the result to localStorage. Can't do that until
			// subscriptions are in place so that localStorage can sync
			// with any updates from the remote module.

			// Check for a 404.
			if (errDS === "404") {
				respondErr(event, messagePortal, isWorker, "could not load module, received 404")
				resolve("received 404")
				delete modulesLoading[moduleDomain]
				return
			}

			// Create a new module.
			let module = createModule(moduleData, moduleDomain)

			// Check that some parallel process didn't already create the
			// module. We only want one module running at a time.
			if (moduleDomain in modules) {
				// Though this is an error, we do already have the module so we
				// use the one we already loaded.
				logErr("a module that was already loaded has been loaded")
				notableErrors.push("module loading experienced a race condition")
				let module = modules[moduleDomain]
				newModuleQuery(module)
				resolve(null)
				return
			}
			modules[moduleDomain] = module
			newModuleQuery(module)
			resolve(null)
			delete modulesLoading[moduleDomain]
		})
	})
	modulesLoading[moduleDomain] = moduleLoadedPromise
}

// callerIsDashboard checks that the caller of a method is the secure dashboard
// of the kernel.
function callerIsDashboard(event: MessageEvent): boolean {
	return true
	/*
	let extensionDash == "http://kernel.skynet/dashboard.html"
	let sktDash = "https://skt.us/dashboard.html"
	if (IS_EXTENSION && event.origin !== extensionDash) {
		return false
	}
	if (event.origin !== sktDash && event.origin !== extensionDash) {
		return false
	}
	return true
   */
}

// handleSkynetKernelGetModuleOverrides handles a kernel message that is
// requesting the list of module overrides. This is a restricted call that can
// only be used by priviledged pages.
function handleSkynetKernelGetModuleOverrides(event: MessageEvent) {
	// Implement the access control.
	if (!callerIsDashboard(event)) {
		respondErr(event, event.source, false, "this page is not allowed to call the restricted endpoint")
		return
	}

	// Provide the list of module overrides.
	if (event.source === null) {
		return
	}
	event.source.postMessage(
		{
			nonce: event.data.nonce,
			method: "response",
			err: null,
			data: moduleOverrideList,
		},
		event.origin as any // tsc
	)
}

// handleSkynetKernelSetModuleOverrides handles a kernel message that is
// attempting to update the list of module overrides. This is a restricted call
// that can only be used by priviledged pages.
function handleSkynetKernelSetModuleOverrides(event: MessageEvent) {
	// Implement the access control.
	if (!callerIsDashboard(event)) {
		respondErr(event, event.source, false, "this page is not allowed to call the restricted endpoint")
		return
	}

	// Have to check for null independently because 'typeof null' will evaluate
	// to "object".
	if (event.data.data === null || event.data.data === undefined) {
		respondErr(event, event.source, false, "provided call data is not an object")
		return
	}
	let newOverrides = event.data.data.newOverrides
	if (newOverrides === null || typeof newOverrides !== "object") {
		respondErr(event, event.source, false, "newOverrides needs to be a key-value list of module overrides")
		return
	}

	// Iterate over the keys and values of the object and ensure that all of
	// them are legal override objects.
	for (let [key, value] of Object.entries(newOverrides)) {
		// Check that the key is a valid skylink. This key represents a module.
		if (typeof key !== "string") {
			respondErr(event, event.source, false, "module identifiers should be strings")
			return
		}
		let [skylinkU8, errBTB] = b64ToBuf(key)
		if (errBTB !== null) {
			respondErr(event, event.source, false, addContextToErr(errBTB, "unable to decode key"))
			return
		}
		if (!validSkylink(skylinkU8)) {
			respondErr(event, event.source, false, "module identifiers should be valid skylinks")
			return
		}

		// Check that the value is an object.
		if (value === undefined) {
			respondErr(event, event.source, false, "provided data is not a valid list of module overrides")
			return
		}
		// Check that the notes field exists and is a string.
		if (typeof (value as any).notes !== "string") {
			respondErr(event, event.source, false, "every module override should have a notes field")
			return
		}
		// Check that the notes field isn't too large.
		if ((value as any).notes.length > 140) {
			respondErr(event, event.source, false, "every module override should have a notes field")
			return
		}
		// Check that the override field exists and is a string.
		if (typeof (value as any).override !== "string") {
			respondErr(event, event.source, false, "every module override should have an override field")
			return
		}
		let [overrideU8, errBTB2] = b64ToBuf((value as any).override)
		if (errBTB2 !== null) {
			respondErr(event, event.source, false, addContextToErr(errBTB, "unable to decode override value"))
			return
		}
		if (!validSkylink(overrideU8)) {
			respondErr(event, event.source, false, addContextToErr(errBTB, "override is not a valid skylink"))
			return
		}
	}

	// Update the overrides list and respond with success.
	moduleOverrideList = newOverrides
	if (event.source === null) {
		return
	}
	event.source.postMessage(
		{
			nonce: event.data.nonce,
			method: "response",
			err: null,
			data: {
				success: true,
			},
		},
		event.origin as any
	)
}

// Overwrite the handleIncomingMessage function that gets called at the end of the
// event handler, allowing us to support custom messages.
handleIncomingMessage = function (event: any) {
	// Ignore all messages from ourself.
	if (event.source === window) {
		return
	}

	// Input validation.
	if (!("method" in event.data)) {
		logErr("handleIncomingMessage", "kernel request is missing 'method' field")
		return
	}
	if (!("nonce" in event.data)) {
		logErr("handleIncomingMessage", "message sent to kernel with no nonce field", event.data)
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
				},
			},
			event.origin
		)
		return
	}

	// Establish a debugging handler to return any noteworthy errors that the
	// kernel has encountered. This is mainly intended to be used by the test
	// suite.
	if (event.data.method === "checkErrs") {
		event.source.postMessage(
			{
				nonce: event.data.nonce,
				method: "response",
				err: null,
				data: {
					errs: notableErrors,
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
	if (event.data.method === "getModuleOverrides") {
		handleSkynetKernelGetModuleOverrides(event)
		return
	}
	if (event.data.method === "setModuleOverrides") {
		handleSkynetKernelSetModuleOverrides(event)
		return
	}

	// Unrecognized method, reject the query.
	respondErr(event, event.source, false, "unrecognized method: " + event.data.method)
}
