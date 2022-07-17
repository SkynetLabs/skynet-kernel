import { ActiveQuery, addHandler, callModule, getSeed, handleMessage, logErr, objAsString } from "libkmodule"

// Define the testerModule that we use to help coordinate testing.
const TESTER_MODULE = "AQCPJ9WRzMpKQHIsPo8no3XJpUydcDCjw7VJy8lG1MCZ3g"

// Establish 'onmessage' for the worker, we'll just be using the libkmodule
// method 'handleMessage' nakedly.
onmessage = handleMessage

// Add handlers for all of the methods that the helper supports.
addHandler("mirrorDomain", handleMirrorDomain)
addHandler("updateTest", handleUpdateTest, { receiveUpdates: true })
addHandler("viewSeed", handleViewSeed)
addHandler("viewTesterSeed", handleViewTesterSeed)

// handleMirrorDomain returns the caller's domain to the caller.
function handleMirrorDomain(aq: ActiveQuery) {
	aq.respond({ domain: aq.domain })
}

// handleUpdateTest engages with the tester module in a sort of ping-pong where
// each module keeps incrementing 'progress' by 1 until it reaches 9, at which
// point the helper module resovles the query.
function handleUpdateTest(aq: ActiveQuery) {
	// Check the initial progress value that was sent to the update test.
	if (!("progress" in aq.callerInput)) {
		aq.reject("expecting progress field in input")
		return
	}
	if (aq.callerInput.progress !== 0) {
		aq.reject("expecting call to kick off with progress 0")
		return
	}

	// Send a responseUpdate that increments the progress counter, and
	// establish what progress we expect when the caller sends a query update.
	aq.sendUpdate({ progress: 1 })
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
			aq.reject("expected a progress field in the queryUpdate")
			resolved = true
			return
		}
		if (typeof update.progress !== "number") {
			aq.reject("expected progress field of queryUpdate to be a number")
			resolved = true
			return
		}
		if (update.progress !== expectedProgress) {
			let str = objAsString(update.progress) + " :: " + objAsString(expectedProgress)
			aq.reject("progress value appears incorrect: " + str)
			resolved = true
			return
		}
		if (update.progress > 8) {
			aq.reject("too many updates, 8 should have been the final progress update")
			resolved = true
			return
		}
		if (update.progress === 8) {
			aq.respond({ progress: 9 })
			resolved = true
			return
		}
		aq.sendUpdate({ progress: expectedProgress + 1 })
		expectedProgress += 2
	}
	if (aq.setReceiveUpdate === undefined) {
		aq.reject("handleUpdateTest was not configured to send updates")
		return
	}
	aq.setReceiveUpdate(receiveUpdate)
}

// handle a call to 'viewSeed'. Most modules will not have any sort of support
// for a function like 'viewSeed', the seed is supposed to be private. But we
// need to make sure that the seed distribution from the kernel appears to be
// working, so we expose the seed for this module.
async function handleViewSeed(aq: ActiveQuery) {
	let seed = await getSeed()
	aq.respond({ seed })
}

// handleViewTesterSeed makes a query to the tester module to grab its seed. It
// then returns the seed of the tester module. This method is used by the
// tester module to check that multi-hop module communication works.
async function handleViewTesterSeed(aq: ActiveQuery) {
	// Send the call to the tester module.
	let [resp, err] = await callModule(TESTER_MODULE, "viewSeed", {})
	if (err !== null) {
		aq.reject(err)
		return
	}

	// Check that the tester module responded with a seed field.
	if (!("seed" in resp)) {
		let err = "tester module did not provide seed when 'viewSeed' was called"
		aq.reject(err)
		return
	}

	// Respond with the seed that the tester provided.
	aq.respond({ testerSeed: resp.seed })
}
