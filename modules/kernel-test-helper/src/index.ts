import { addContextToErr, addHandler, callModule, getSeed, handleMessage, logErr, tryStringify } from "libkmodule"

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
addHandler("updateTest", handleUpdateTest, { receiveUpdates: true })
addHandler("viewErrors", handleViewErrors)
addHandler("viewSeed", handleViewSeed)
addHandler("viewTesterSeed", handleViewTesterSeed)

// handleMirrorDomain returns the caller's domain to the caller.
function handleMirrorDomain(activeQuery: any) {
	activeQuery.accept({ domain: activeQuery.domain })
}

// handleUpdateTest engages with the tester module in a sort of ping-pong where
// each module keeps incrementing 'progress' by 1 until it reaches 9, at which
// point the helper module resovles the query.
function handleUpdateTest(activeQuery: any) {
	// Check the initial progress value that was sent to the update test.
	if (!("progress" in activeQuery.callerInput)) {
		activeQuery.reject("expecting progress field in input")
		return
	}
	if (activeQuery.callerInput.progress !== 0) {
		activeQuery.reject("expecting call to kick off with progress 0")
		return
	}

	// Send a responseUpdate that increments the progress counter, and
	// establish what progress we expect when the caller sends a query update.
	activeQuery.sendUpdate({ progress: 1 })
	let expectedProgress = 2

	// Define the function that will receive updates. Track whether the query
	// has already been resolved to avoid sending multiple response messages.
	let resolved = false
	let receiveUpdate = function (update: any) {
		// Ensure that we are not sending repeat responses.
		if (resolved) {
			logErr("handleUpdateTest received an update after already resolving")
			return
		}
		if (!("progress" in update)) {
			activeQuery.reject("expected a progress field in the queryUpdate")
			resolved = true
			return
		}
		if (typeof update.progress !== "number") {
			activeQuery.reject("expected progress field of queryUpdate to be a number")
			resolved = true
			return
		}
		if (update.progress !== expectedProgress) {
			let str = tryStringify(update.progress) + " :: " + tryStringify(expectedProgress)
			activeQuery.reject("progress value appears incorrect: " + str)
			resolved = true
			return
		}
		if (update.progress > 8) {
			activeQuery.reject("too many updates, 8 should have been the final progress update")
			resolved = true
			return
		}
		if (update.progress === 8) {
			activeQuery.accept({ progress: 9 })
			resolved = true
			return
		}
		activeQuery.sendUpdate({ progress: expectedProgress + 1 })
		expectedProgress += 2
	}
	activeQuery.setReceiveUpdate(receiveUpdate)
}

// handleViewErrors exposes the errors object that accumulates all the errors
// the module finds throughout testing.
function handleViewErrors(activeQuery: any) {
	activeQuery.accept({ errors })
}

// handle a call to 'viewSeed'. Most modules will not have any sort of support
// for a function like 'viewSeed', the seed is supposed to be private. But we
// need to make sure that the seed distribution from the kernel appears to be
// working, so we expose the seed for this module.
async function handleViewSeed(activeQuery: any) {
	let seed = await getSeed()
	activeQuery.accept({ seed })
}

// handleViewTesterSeed makes a query to the tester module to grab its seed. It
// then returns the seed of the tester module. This method is used by the
// tester module to check that multi-hop module communication works.
async function handleViewTesterSeed(activeQuery: any) {
	// Send the call to the tester module.
	let [resp, err] = await callModule(testerModule, "viewSeed", {})
	if (err !== null) {
		errors.push(<string>addContextToErr(err, "could not call 'viewSeed' on tester module"))
		activeQuery.reject(err)
		return
	}

	// Check that the tester module responded with a seed field.
	if (!("seed" in resp)) {
		let err = "tester module did not provide seed when 'viewSeed' was called"
		errors.push(err)
		activeQuery.reject(err)
		return
	}

	// Respond with the seed that the tester provided.
	activeQuery.accept({ testerSeed: resp.seed })
}
