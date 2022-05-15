import { addContextToErr, composeErr } from "./err.js"
import { init, newKernelQuery } from "./init.js"
import { logErr } from "./log.js"

/**
 * Helper methods for interacting with the Kernel Modules.
 *
 * @module
 */

const noBridge = "the bridge failed to initialize (do you have the Skynet browser extension?)"

/**
 * testMessage will send a test message to the kernel, ensuring that basic
 * kernel communications are working. The promise will resolve to the version
 * of the kernel.
 *
 * @remarks
 * NOTE: This is good reference code for people who are looking to extend
 * libkernel.
 *
 * @returns Promise that resolves to the version of the kernel
 *
 * @public
 */
function testMessage(): Promise<string> {
	// Retrun a promise that will resolve when a response is received from
	// the kernel.
	return new Promise((resolve, reject) => {
		// Every message should start with init. If initialization has
		// already happened, this will be a no-op that instantly
		// resolves.
		init()
			.then(() => {
				// Send a 'test' message to the kernel, which is a
				// method with no parameters.
				//
				// The first return value of newKernelQuery is ignored
				// because it is an update function that we can call if
				// we wish to provide new information to the query via
				// a 'queryUpdate'. The 'test' method does not support
				// any queryUpdates.
				//
				// The second input of newKernelQuery is passed as
				// null, it's usually a handler function to accept
				// 'responseUpdate' messages from the kernel related to
				// the query. The 'test' method doesn't have any
				// 'responseUpdates', so there is no need to create an
				// updateHandler.
				let [, query] = newKernelQuery(
					{
						method: "test",
					},
					null as any
				)
				// We use nested promises instead of promise chaining
				// because promise chaining didn't provide enough
				// control over handling the error. We like wrapping
				// our errors to help indicate exactly which part of
				// the code has gone wrong, and that nuance gets lost
				// with promise chaining.
				query
					.then((response) => {
						if (!("version" in response)) {
							resolve("kernel did not report a version")
							return
						}
						resolve(response.version)
					})
					.catch((err) => {
						reject(addContextToErr(err, "newKernelQuery failed"))
					})
			})
			.catch((err) => {
				// For some reason, the bridge is not available.
				// Likely, this means that the user has not installed
				// the browser extension.
				let cErr = composeErr(noBridge, err)
				logErr(cErr)
				reject(cErr)
			})
	})
}

/**
 * callModule is a generic function to call a module.
 *
 * @remarks
 * It will send a message to the kernel and respond with the kernel's response.
 * All nonce magic is handled for the user.
 *
 * callModule can only be used for query-response communications, there is no
 * support for sending queryUpdate messages or receiving responseUpdate
 * messages. If you need those, use 'connectModule' instead.
 *
 * @param module Skylink for the kernel module to be called
 * @param method Name of the method to be called by the module
 * @param data Data to be passed for use by the method
 * @returns Promise that resolves to the `data` value when `response` is sent by the module.
 *
 * @example
 * ```ts
 * callModule( helloModuleSkylink, 'sayHello', {name: "World"})
 * 	.then((data) => {
 * 		console.log( data.message ); // Hello, World!
 * 	})
 * 	.catch((err) => {
 * 		console.error(errA;)
 * 	})
 * ```
 *
 * @public
 */
function callModule(module: string, method: string, data: any): Promise<any> {
	return new Promise((resolve, reject) => {
		init()
			.then(() => {
				let [, query] = newKernelQuery(
					{
						method: "moduleCall",
						data: {
							module,
							method,
							data,
						},
					},
					null as any
				)
				query
					.then((response) => {
						resolve(response)
					})
					.catch((err) => {
						reject(addContextToErr(err, "moduleCall query to kernel failed"))
					})
			})
			.catch((err) => {
				let cErr = composeErr(noBridge, err)
				logErr(cErr)
				reject(cErr)
			})
	})
}

/**
 * connectModule opens a "connection" to a module. When using 'callModule', all
 * communications have a single round trip. You send a single query message,
 * then you get a single response message. With 'connectModule', the caller has
 * the ability to send updates, and the receiver has the ability to send
 * updates.
 *
 * @remarks
 *
 * The general structure of the communication is the same. A query is created
 * on a module that specifies a particular method. When creating the query, a
 * 'receiveUpdate' method needs to be provided that will be called when the
 * module provides an update. recieveUpdate should have the form:
 *
 * ```ts
 * function receiveUpdate(data: any) { ... }
 * ```
 *
 * updates are not guaranteed to be provided in any particular order.
 *
 * The return value is a tuple of a `sendUpdate` function and a promise. The
 * promise will resolve or reject when the query is complete. The `sendUpdate`
 * value is a function of the form:
 *
 * ```ts
 * function sendUpdate(data: any) { ... }
 * ```
 *
 * If the caller wishes to send an update to the module, they should use the
 * sendUpdate function.
 *
 * @privateRemarks
 *
 * TODO: At the moment it's unclear that the sendUpdate function is being
 * created in a way that is guaranteed to be specific to this one caller,
 * because the nonces may not be unique. We need to work that through with the
 * kernel.
 *
 * @param module Skylink for the kernel module to be called
 * @param method Name of the method to be called by the module
 * @param data Data to be passed for use by the method
 * @param receiveUpdate Method to be called when `responseUpdates` are received from the module. Accepts a `data` argument.
 * @returns Array containing `sendUpdate` method for sending query updates,
 * and a promise that resolves the `data` value when `response` is sent by the module.
 *
 * @example _This code doesn't work for me at the moment._
 *
 * ```ts
 * function receiveUpdate(data) {
 *   console.log(data.message);
 * }
 *
 * let [, query] = connectModule(
 *   sayHelloModule,
 *   'subscribeToHellos',
 *   { data: '' }, // errors without this at the moment
 *   receiveUpdate
 * );
 *
 * query
 *   .then((data) => { console.log( "response received", data ) })
 *   .catch((err) => { console.error('error') });
 * ```
 *
 * @experimental
 */
function connectModule(module: string, method: string, data: any, receiveUpdate: any): [any, Promise<any>] {
	// Create the kernel query.
	let [sendUpdate, query] = newKernelQuery(
		{
			method: "moduleCall",
			data: {
				module,
				method,
				data,
			},
		},
		receiveUpdate
	)

	let p = new Promise((resolve, reject) => {
		init()
			.then(() => {
				query
					.then((response) => {
						resolve(response)
					})
					.catch((err) => {
						reject(addContextToErr(err, "moduleCall query to kernel failed"))
					})
			})
			.catch((err) => {
				let cErr = composeErr(noBridge, err)
				logErr(cErr)
				reject(cErr)
			})
	})
	return [sendUpdate, p]
}

export { callModule, connectModule, testMessage }
