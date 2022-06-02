import * as React from "react"
import * as kernel from "libkernel"

// Define a set of functions which facilitate executing the tests sequentially.
// Each test is assigned a 'turn' and then will wait to begin execution until
// all tests before it have completed.
var turns = []
var next = 0
function getTurn() {
	let turn = new Promise((resolve) => {
		turns.push(resolve)
		if (next === 0) {
			next++
			resolve()
		}
	})
	return turn
}
function nextTest() {
	if (next < turns.length) {
		let resolve = turns[next]
		next++
		resolve()
	}
}

// TestLibkernelInit will check the init function of libkernel. This tests that
// the bridge script was loaded. If this fails, it either means the browser
// extension is missing entirely or it means that something fundamental broke.
function TestLibkernelInit() {
	return new Promise((resolve, reject) => {
		kernel.init().then((err) => {
			if (err !== null) {
				reject(err)
				return
			}
			resolve("kernel loaded successfully")
		})
	})
}

// TestGetKernelVersion will send a test message to the kernel and check for the
// result. If this fails it probably means the kernel failed to load for some
// reason, though it could also mean that the page->bridge->background->kernel
// communication path is broken in some way.
function TestGetKernelVersion() {
	return new Promise((resolve, reject) => {
		kernel.kernelVersion().then(([data, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			if (!("version" in data)) {
				reject("no version provided in return value")
				return
			}
			resolve(data.version)
		})
	})
}

// TestModuleHasSeed checks that the test module was given a seed by the
// kernel. This is one of the fundamental priveledges of being a kernel module:
// receiving a secure and unique seed for module-specific user data.
//
// The full message flow here is:
// 	webpage => bridge => background => 
// 		kernel => test module ->
// 		kernel ->
// 	background -> bridge -> webpage
let kernelTestSuite = "AQCPJ9WRzMpKQHIsPo8no3XJpUydcDCjw7VJy8lG1MCZ3g"
function TestModuleHasSeed() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "viewSeed", {}).then(([data, err]) => {
			if (err !== null) {
				reject("viewSeed returned an error: ", err)
				return
			}
			if (!("seed" in data)) {
				reject("viewSeed in test module did not return a data.seed")
				return
			}
			if (data.seed.length !== 16) {
				reject("viewSeed in test module returned a seed with a non-standard length")
				return
			}
			resolve("viewSeed appears to have returned a standard seed")
		})
	})
}

// TestModuleLogging checks that the test suite module is capable of logging.
// This test requires looking in the console of the kernel to see that the log
// was printed correctly.
function TestModuleLogging() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "testLogging", {}).then(([data, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			resolve("test module has produced logs")
		})
	})
}

// TestMissingModule checks that the kernel correctly handles a call to a
// module that doesn't exist. For the module, we use the test module but with
// the final character modified so that the hash doesn't actually point to
// anything.
let moduleDoesNotExist = "AQCPJ9WRzMpKQHIsPo9no3XJpUydcDCjw7VJy8lG1MCZ3g"
function TestMissingModule() {
	return new Promise((resolve, reject) => {
		kernel.callModule(moduleDoesNotExist, "viewSeed", {}).then(([data, err]) => {
			if (err !== null) {
				resolve(err)
				return
			}
			reject("kernel is supposed to return an error:"+ JSON.stringify(data))
		})
	})
}

// TestMalformedModule checks that the kernel correctly handles a call to a
// module that is using a malformed skylink.
let moduleMalformed = "AQCPJ9WRzMpKQHIsPo8no3XJpUydcDCjw7VJy8lG1MCZ3"
function TestMalformedModule() {
	return new Promise((resolve, reject) => {
		kernel.callModule(moduleMalformed, "viewSeed", {}).then(([data, err]) => {
			if (err !== null) {
				resolve(err)
				return
			}
			reject("kernel is supposed to return an error")
		})
	})
}

// TestModulePresentSeed attempts to send a 'presentSeed' method to the test
// module. This is expected to fail because the kernel is not supposed to allow
// external callers to use the 'presentSeed' method. If it succeeds, the test
// module will log an error that TestModuleHasErrors will catch.
function TestModulePresentSeed() {
	return new Promise((resolve, reject) => {
		let fakeSeed = new Uint8Array(16)
		kernel.callModule(kernelTestSuite, "presentSeed", {
			seed: fakeSeed,
		}).then(([data, err]) => {
			if (err !== null) {
				resolve("received expected error: "+err)
				return
			}
			reject("expecting an error for using a forbidden method")
		})
	})
}

// TestModuleQueryKernel opens a query with the test module that has the test
// module send a test query to the kernel, and then the test module reports the
// kernel version back to us. This test confirms that modules are able to talk
// to the kernel.
//
// The full message flow here is:
// 	webpage => bridge => background => 
// 		kernel => test module =>
// 			kernel -> test module ->
// 		kernel ->
// 	background -> bridge -> webpage
function TestModuleQueryKernel() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "sendTestToKernel", {}).then(([data, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			if (!("kernelVersion" in data)) {
				reject("expecting response to have a kernelVersion")
				return
			}
			resolve(data.kernelVersion)
		})
	})
}

// TestModuleCheckHelperSeed opens a query with the test module to have the
// test module check the seed of the helper module.
//
// The full message flow here is:
// 	webpage => bridge => background =>
// 		kernel => test module =>
// 			kernel => helper module ->
// 		kernel -> test module ->
// 	kernel -> background -> bridge -> webpage
function TestModuleCheckHelperSeed() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "viewHelperSeed", {}).then(([data, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			if (!("message" in data)) {
				reject("expecting response to have a kernelVersion")
				return
			}
			resolve(data.message)
		})
	})
}

// TestViewTesterSeedByHelper has the test module as the helper module to fetch
// the seed of the test module. This test ensures that multi-hop module
// communication works.
//
// The full message flow here is:
// 	webpage => bridge => background =>
// 		kernel => test module =>
// 			kernel => helper module =>
// 				kernel => test module ->
// 			kernel -> helper module ->
// 		kernel -> test module ->
// 	kernel -> background -> bridge -> webpage
function TestViewTesterSeedByHelper() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "viewOwnSeedThroughHelper", {}).then(([data, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			if (!("message" in data)) {
				reject("expecting response to have a kernelVersion")
				return
			}
			resolve(data.message)
		})
	})
}

// Check that the kernel is assigning the correct domain to the webpage.
function TestMirrorDomain() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "mirrorDomain", {}).then(([data, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			if (!("domain" in data)) {
				reject("mirrorDomain did not return a domain")
				return
			}
			if (typeof data.domain !== "string") {
				reject("mirrorDomain returned wrong type: "+typeof data.domain)
				return
			}
			if (data.domain !== window.location.hostname) {
				reject("wrong domain\nexpected: "+window.location.hostname+"\ngot: "+data.domain)
				return
			}
			resolve("got expected domain: "+data.domain)
		})
	})
}

// Check that the kernel is assigning the correct domain to other modules.
function TestTesterMirrorDomain() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "testerMirrorDomain", {}).then(([data, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			if (!("domain" in data)) {
				reject("testerMirrorDomain did not return a domain")
				return
			}
			if (typeof data.domain !== "string") {
				reject("testerMirrorDomain returned wrong type: "+typeof data.domain)
				return
			}
			if (data.domain !== kernelTestSuite) {
				reject("wrong domain\nexpected: "+kernelTestSuite+"\ngot: "+data.domain)
				return
			}
			resolve("got expected domain: "+data.domain)
		})
	})
}

// Check that the kernel is rejecting moduleCall messages that don't include a
// method field.
function TestMethodFieldRequired() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, null, {}).then(([data, err]) => {
			if (err !== null) {
				resolve("kernel failed when there was a call with no method: "+err)
				return
			}
			reject("expecting a call to the kernel with no method to fail")
		})
	})
}

// TestResponseUpdates checks that modules can successfully send responseUpdate
// messages.
function TestResponseUpdates() {
	return new Promise((resolve, reject) => {
		let progress = 0
		let receiveUpdate = function(data) {
			if (!("eventProgress" in data)) {
				reject("eventProgress not provided in response")
				return
			}
			if (data.eventProgress !== progress+25) {
				// NOTE: event ordering is not actually guaranteed by the spec, but
				// this is a situation where parallelism is low enough that the
				// ordering should be okay.
				reject("progress messages appear to be arriving out of order")
				return
			}
			progress += 25
		}
		let [, query] = kernel.connectModule(kernelTestSuite, "testResponseUpdate", {}, receiveUpdate)
		query.then(([data, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			if (progress !== 75) {
				reject("response was received before responseUpdates were completed")
				console.log("progress is:", progress)
				return
			}
			if (!("eventProgress" in data)) {
				reject("expecting response to contain eventProgress")
				return
			}
			if (data.eventProgress !== 100) {
				reject("expecting response eventProgress to be 100")
				return
			}
			resolve("received all messages in order and final message was a response")
		})
	})
}

// TestModuleUpdateQuery checks that modules can successfully send queryUpdate
// and responseUpdate messages.
function TestModuleUpdateQuery() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "updateTest", {}).then(([data, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			resolve(data)
		})
	})
}

// TestIgnoreResponseUpdates checks that you can safely use callModule on a
// module method that provides response updates.
function TestIgnoreResponseUpdates() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "testResponseUpdate", {}).then(([data, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			if (!("eventProgress" in data)) {
				reject("expecting response to contain eventProgress")
				return
			}
			if (data.eventProgress !== 100) {
				reject("expecting response eventProgress to be 100")
				return
			}
			resolve("received final message when calling testResponseUpdate using callModule")
		})
	})
}

// TestBasicCORS has the test module make a fetch request to a couple of
// websites to check that CORS is not preventing workers from talking to the
// network.
function TestBasicCORS() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "testCORS", {}).then(([data, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			if (!("url" in data)) {
				reject("testCORS did not return a url")
				return
			}
			if (typeof data.url !== "string") {
				reject("testCORS returned wrong type: "+typeof data.domain)
				return
			}
			resolve("CORS test passed for url: "+data.url)
		})
	})
}

// TestSecureUploadAndDownload will upload a very basic file to Skynet using
// libkernel. It will then download that skylink using libkernel.
function TestSecureUploadAndDownload() {
	return new Promise((resolve, reject) => {
		let fileDataUp = new TextEncoder().encode("test data")
		kernel.upload("testUpload.txt", fileDataUp)
		.then(([data, err])=> {
			if (err !== null) {
				reject("upload failed: "+err)
				return
			}
			if (!("skylink" in data)) {
				reject("return value of upload had no skylink field")
				return
			}
			let skylink = data.skylink
			kernel.download(skylink).then(([ddata, derr])=> {
				if (derr !== null) {
					reject("download failed: "+derr)
					return
				}
				let fileDataDown = ddata.fileData
				if (fileDataUp.length !== fileDataDown.length) {
					reject("uploaded data and downloaded data do not match: "+JSON.stringify({uploaded: fileDataUp, downloaded: fileDataDown}))
					return
				}
				for (let i = 0; i < fileDataUp.length; i++) {
					if (fileDataUp[i] !== fileDataDown[i]) {
						reject("uploaded data and downloaded data do not match: "+JSON.stringify({uploaded: fileDataUp, downloaded: fileDataDown}))
						return
					}
				}
				resolve(skylink)
			})
		})
	})
}

// TestMsgSpeedSequential5k will send ten thousand messages to the kernel
// sequentially.
function TestMsgSpeedSequential5k() {
	// sendSequentialMessages is a helper function that will send a
	// message, wait for the message to resolve, then call itself again
	// with a lower 'remaining' value, exiting out when 'remaining' hits
	// zero.
	let sendSequentialMessages = function(remaining, resolve, reject) {
		if (remaining === 0) {
			resolve("all messages resolved")
			return
		}

		kernel.kernelVersion().then(([data, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			sendSequentialMessages(remaining-1, resolve, reject)
		})
	}
	return new Promise((resolve, reject) => {
		sendSequentialMessages(5000, resolve, reject)
	})
}

// TestModuleSpeedSequential5k will have the tester module perform five
// thousand sequential messages on the helper module.
function TestModuleSpeedSequential20k() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "callModulePerformanceSequential", {iterations: 20000}).then(([data, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			resolve("sequential messages succeeded")
		})
	})
}

// TestMsgSpeedParallel5k will send ten thousand messages to the kernel in
// parallel.
function TestMsgSpeedParallel5k() {
	return new Promise((resolve, reject) => {
		let promises = []
		for (let i = 0; i < 5000; i++) {
			promises.push(kernel.kernelVersion())
		}
		Promise.all(promises)
		.then(x => {
			for (let i = 0; i < x.length; i++) {
				let err = x[i][1]
				if (err !== null) {
					reject(err)
					return
				}
			}
			resolve("all messages reseolved")
		})
		.catch(x => {
			// I don't believe there's any way for the above call
			// to reject but we check anyway.
			reject(x)
		})
	})
}

// TestModuleSpeedParallel5k will have the tester module perform five
// thousand sequential messages on the helper module.
function TestModuleSpeedParallel20k() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "callModulePerformanceParallel", {iterations: 20000})
		.then(([data, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			resolve("sequential messages succeeded")
		})
	})
}

// TestModuleHasErrors asks the TestModule whether it has encountered any
// errors during the test cycle.
function TestModuleHasErrors() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "viewErrors", {})
		.then(([data, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			if (!("errors" in data)) {
				reject("viewErrors in test module did not return a data.errors")
				return
			}
			if (data.errors.length !== 0) {
				reject("test module has acculumated errors: " + JSON.stringify(data.errors))
				return
			}
			resolve("test module did not accumulate any errors")
		})
	})
}

// Check whether any errors showed up in the helper module of the testing
// module.
let helperModule = "AQCoaLP6JexdZshDDZRQaIwN3B7DqFjlY7byMikR7u1IEA"
function TestHelperModuleHasErrors() {
	return new Promise((resolve, reject) => {
		kernel.callModule(helperModule, "viewErrors", {}).then(([data, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			if (!("errors" in data)) {
				reject("viewErrors in helper module did not return a data.errors")
				return
			}
			if (data.errors.length !== 0) {
				reject("helper module has acculumated errors: " + JSON.stringify(data.errors))
				return
			}
			resolve("helper module did not accumulate any errors")
		})
	})
}

// TestCard is a react component that runs a test and reports the result.
function TestCard(props) {
	const [testStatus, setTestStatus] = React.useState("test is waiting")
	const [statusColor, setStatusColor] = React.useState("rgba(60, 60, 60, 0.6)")
	const [duration, setDuration] = React.useState(0)

	React.useEffect(() => {
		props.turn
		.then(x => {
			setTestStatus("test is running")
			setStatusColor("rgba(255, 165, 0, 0.6)")
			let start = performance.now()
			props.test()
			.then(x => {
				setTestStatus("test success: " + x)
				setStatusColor("rgba(0, 80, 0, 0.6)")
				setDuration(performance.now()-start)
				nextTest()
			})
			.catch(x => {
				console.error(x)
				setTestStatus(x)
				setStatusColor("rgba(255, 0, 0, 0.6)")
				let end = performance.now()
				setDuration(end-start)
				nextTest()
			})
		})
	}, [props])

	return (
		<div style={{border: "1px solid black", backgroundColor: statusColor, margin: "12px", padding: "6px"}}>
			<p>{props.name}</p>
			<p>{testStatus}</p>
			<p>{duration}ms</p>
		</div>
	)
}

// LoginButton is a react component that allows the user to log into the
// kernel. It is only displayed if there is an auth error.
//
// TODO: Ha maybe not.
function LoginButton(props) {
	let loginPopup = function() {
		window.open("https://skt.us/auth.html", "_blank")
	}
	return (
		<div>
			<button text="login" style={{margin: "12px"}} onClick={loginPopup}>Login to Kernel</button>
		</div>
	)
}

// Establish the index page.
const IndexPage = () => {
	return (
		<main>
			<title>Libkernel Test Suite</title>
			<h1>Running Tests</h1>
			<LoginButton />
			<TestCard name="TestLibkernelInit" test={TestLibkernelInit} turn={getTurn()} />
			<TestCard name="TestGetKernelVersion" test={TestGetKernelVersion} turn={getTurn()} />
			<TestCard name="TestModuleHasSeed" test={TestModuleHasSeed} turn={getTurn()} />
			<TestCard name="TestModuleLogging" test={TestModuleLogging} turn={getTurn()} />
			<TestCard name="TestModuleMissingModule" test={TestMissingModule} turn={getTurn()} />
			<TestCard name="TestModuleMalformedModule" test={TestMalformedModule} turn={getTurn()} />
			<TestCard name="TestModulePresentSeed" test={TestModulePresentSeed} turn={getTurn()} />
			<TestCard name="TestModuleQueryKernel" test={TestModuleQueryKernel} turn={getTurn()} />
			<TestCard name="TestModuleCheckHelperSeed" test={TestModuleCheckHelperSeed} turn={getTurn()} />
			<TestCard name="TestViewTesterSeedByHelper" test={TestViewTesterSeedByHelper} turn={getTurn()} />
			<TestCard name="TestMirrorDomain" test={TestMirrorDomain} turn={getTurn()} />
			<TestCard name="TestTesterMirrorDomain" test={TestTesterMirrorDomain} turn={getTurn()} />
			<TestCard name="TestMethodFieldRequired" test={TestMethodFieldRequired} turn={getTurn()} />
			<TestCard name="TestResponseUpdates" test={TestResponseUpdates} turn={getTurn()} />
			<TestCard name="TestModuleUpdateQuery" test={TestModuleUpdateQuery} turn={getTurn()} />
			<TestCard name="TestIgnoreResponseUpdates" test={TestIgnoreResponseUpdates} turn={getTurn()} />
			<TestCard name="TestBasicCORS" test={TestBasicCORS} turn={getTurn()} />
			<TestCard name="TestSecureUploadAndDownload" test={TestSecureUploadAndDownload} turn={getTurn()} />
			<TestCard name="TestMsgSpeedSequential5k" test={TestMsgSpeedSequential5k} turn={getTurn()} />
			<TestCard name="TestModuleSpeedSeq20k" test={TestModuleSpeedSequential20k} turn={getTurn()} />
			<TestCard name="TestMsgSpeedParallel5k" test={TestMsgSpeedParallel5k} turn={getTurn()} />
			<TestCard name="TestModuleSpeedParallel20k" test={TestModuleSpeedParallel20k} turn={getTurn()} />
			<TestCard name="TestModuleHasErrors" test={TestModuleHasErrors} turn={getTurn()} />
			<TestCard name="TestHelperModuleHasErrors" test={TestHelperModuleHasErrors} turn={getTurn()} />
		</main>
	)
}

export default IndexPage
