import { addContextToErr, addHandler, callModule, getSeed, handleMessage } from "libkmodule"

// Track any errors that come up during execution. This is non-standard, most
// modules will not need to do this.
let errors: string[] = []

// Define the testerModule that we use to help coordinate testing.
const testerModule = "AQCPJ9WRzMpKQHIsPo8no3XJpUydcDCjw7VJy8lG1MCZ3g"

// Establish 'onmessage' for the worker, we'll just be using the libkmodule
// method 'handleMessage' nakedly.
onmessage = handleMessage

// Add handlers for all of the methods that the helper supports.
addHandler("mirrorDomain", handleMirrorDomain)
addHandler("viewErrors", handleViewErrors)
addHandler("viewSeed", handleViewSeed)
addHandler("viewTesterSeed", handleViewTesterSeed)

// handleMirrorDomain returns the caller's domain to the caller.
function handleMirrorDomain(data: any, accept: any, reject: any, metadata: any) {
	accept({ domain: metadata.domain })
}

// handleViewErrors exposes the errors object that accumulates all the errors
// the module finds throughout testing.
function handleViewErrors(data: any, accept: any) {
	accept({ errors })
}

// handle a call to 'viewSeed'. Most modules will not have any sort of support
// for a function like 'viewSeed', the seed is supposed to be private. But we
// need to make sure that the seed distribution from the kernel appears to be
// working, so we expose the seed for this module.
async function handleViewSeed(data: any, accept: any) {
	let seed = await getSeed
	accept({ seed })
}

// handleViewTesterSeed makes a query to the tester module to grab its seed. It
// then returns the seed of the tester module. This method is used by the
// tester module to check that multi-hop module communication works.
async function handleViewTesterSeed(data: any, accept: any, reject: any) {
	// Send the call to the tester module.
	let [resp, err] = await callModule(testerModule, "viewSeed", {})
	if (err !== null) {
		errors.push(<string>addContextToErr(err, "could not call 'viewSeed' on tester module"))
		reject(err)
		return
	}

	// Check that the tester module responded with a seed field.
	if (!("seed" in resp)) {
		let err = "tester module did not provide seed when 'viewSeed' was called"
		errors.push(err)
		reject(err)
		return
	}

	// Respond with the seed that the tester provided.
	accept({ testerSeed: resp.seed })
}
