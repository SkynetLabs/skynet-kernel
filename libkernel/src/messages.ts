import { addContextToErr, composeErr } from "./err.js"
import { logErr, init, newKernelQuery } from "./init.js"

const noBridge = "the bridge failed to initialize (do you have the Skynet browser extension?)"

// testMessage will send a test message to the kernel, ensuring that basic
// kernel communications are working. The promise will resolve to the version
// of the kernel.
//
// NOTE: This is good reference code for people who are looking to extend
// libkernel.
export function testMessage(): Promise<string> {
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

// callModule is a generic function to call a module. It will send a message to
// the kernel and respond with the kernel's response. All nonce magic is
// handled for the user.
//
// callModule can only be used for query-response communications, there is no
// support for sending queryUpdate messages or receiving responseUpdate
// messages. If you need those, use 'connectModule' instead.
export function callModule(module: string, method: string, data: any): Promise<any> {
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

// upload will take a filename and some file data and perform a secure upload
// to Skynet. Secure in this case means that all data is verified before being
// uploaded - the portal cannot lie about the skylink that it returns after
// uploading the data.
//
// NOTE: The largest allowed file is currently slightly less than 4 MiB
// (roughly 500 bytes less)
export function upload(filename: string, fileData: Uint8Array): Promise<string> {
	return new Promise((resolve, reject) => {
		init()
			.then(() => {
				let [, query] = newKernelQuery(
					{
						method: "moduleCall",
						data: {
							module: "AQAT_a0MzOInZoJzt1CwBM2U8oQ3GIfP5yKKJu8Un-SfNg",
							method: "secureUpload",
							data: {
								filename,
								fileData,
							},
						},
					},
					null as any
				)
				query
					.then((response) => {
						resolve(response.skylink)
					})
					.catch((err) => {
						reject(err)
					})
			})
			.catch((x) => {
				reject(x)
			})
	})
}
