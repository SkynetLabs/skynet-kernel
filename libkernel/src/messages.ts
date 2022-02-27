import { log, logErr, init, postKernelQuery } from './init'

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
		.then(x => {
			// Send a 'requestTest' message to the kernel. The
			// request test message uniquely doesn't have any other
			// parameters.
			postKernelQuery({
				kernelMethod: "requestTest",
			})
			// We use nested promises instead of promise chaining
			// because promise chaining didn't provide enough
			// control over handling the error.
			.then(response => {
				if (!("version" in response)) {
					resolve("kernel did not report a version")
					return
				}
				resolve(response.version)
			})
			.catch(response => {
				if (!("err" in response) || typeof response.err !== "string") {
					logErr("unrecognized response in postKernelQuery catch", response)
					reject("unrecognized repsonse")
					return
				}
				reject(response.err)
			})
		})
		.catch(err => {
			// For some reason, the bridge is not available.
			// Likely, this means that the user has not installed
			// the browser extension.
			logErr("bridge is not initialized:", err)
			reject(err)
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
//
// TODO: Clean this function up (the response should be a bit more helpful)
export function upload(filename: string, fileData: Uint8Array): Promise<string> {
	return new Promise((resolve, reject) => {
		init()
		.then(x => {
			return postKernelQuery({
				kernelMethod: "moduleCall",
				module: "AQCS3RHbDlk00IdICFEI1rKZp-VNsnsKWC0n7K-taoAuog",
				moduleMethod: "secureUpload",
				moduleInput: {
					filename,
					fileData,
				},
			})
			.then(response => {
				resolve(response.output)
			})
			.catch(response => {
				reject(response.err)
			})
		})
		.catch(x => {
			reject(x)
		})
	})
}

// padAndEncrypt will take a filename and file data as input and return a
// padded, encrypted version of the data that can be privately stored on
// Skynet.
//
// TODO: Need to figure out how to handle the pubkey and the tweak as well.
// Should padAndEncrypt be telling telling the caller what pubkey and tweak to
// use? Should it outright handle everything? Not sure.
export function padAndEncrypt(filepath: string, fileData: Uint8Array): Promise<string> {
	return new Promise((resolve, reject) => {
		init()
		.then(x => {
			postKernelQuery({
				kernelMethod: "moduleCall",
				module: "AQAs00kS6OKUd-FIWj9qdJLArCiEDMVgYBSkaetuTF-MsQ",
				moduleMethod: "padAndEncrypt",
				moduleInput: {
					filepath,
					fileData,
				},
			})
			.then(response => {
				resolve(response.output)
			})
			.catch(response => {
				reject(response.err)
			})
		})
		.catch(x => {
			reject(x)
		})
	})
}


