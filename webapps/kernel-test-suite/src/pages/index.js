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
	return kernel.init()
}

// TestSendTestMessage will send a test message to the kernel and check for the
// result. If this fails it probably means the kernel failed to load for some
// reason, though it could also mean that the page->bridge->background->kernel
// communication path is broken in some way.
function TestSendTestMessage() {
	return kernel.testMessage()
}

// TestModuleHasSeed checks that the test module was given a seed by the
// kernel. This is one of the fundamental priveledges of being a kernel module:
// receiving a secure and unique seed for module-specific user data.
let kernelTestSuite = "AQB6Gs0VcwH-xvEUaoGqORMNuBvpXdt0wRyex-Kqckad-A"
function TestModuleHasSeed() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "viewSeed", {})
		.then(data => {
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
		.catch(err => {
			reject(err)
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
		})
		.then(data => {
			// The reject and resolve get flipped because we want
			// to trigger an error.
			reject("expecting an error for using a forbidden method")
		})
		.catch(err => {
			// The reject and resolve get flipped because we want
			// to trigger an error.
			resolve("received expected error: "+err)
		})
	})
}

// TestModuleQueryKernel opens a query with the test module that has the test
// module send a test query to the kernel, and then the test module reports the
// kernel version back to us. This test confirms that modules are able to talk
// to the kernel.
//
// The full message flow here is:
// 	webpage -> bridge -> background -> kernel -> module ->
// 		kernel -> module ->
// 	kernel -> background -> bridge -> webpage
function TestModuleQueryKernel() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "sendTestToKernel", {})
		.then(data => {
			if (!("kernelVersion" in data)) {
				reject("expecting response to have a kernelVersion")
				return
			}
			resolve(data.kernelVersion)
		})
		.catch(err => {
			reject("callModule failed: "+err)
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
		kernel.callModule(kernelTestSuite, "viewHelperSeed", {})
		.then(data => {
			if (!("message" in data)) {
				reject("expecting response to have a kernelVersion")
				return
			}
			resolve(data.message)
		})
		.catch(err => {
			reject("callModule failed: "+err)
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
		kernel.callModule(kernelTestSuite, "viewOwnSeedThroughHelper", {})
		.then(data => {
			if (!("message" in data)) {
				reject("expecting response to have a kernelVersion")
				return
			}
			resolve(data.message)
		})
		.catch(err => {
			reject("callModule failed: "+err)
		})
	})
}

// Check that the kernel is assigning the correct domain to the webpage.
function TestMirrorDomain() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "mirrorDomain", {})
		.then(data => {
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
		.catch(err => {
			reject(err)
		})
	})
}

// Check that the kernel is assigning the correct domain to other modules.
function TestTesterMirrorDomain() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "testerMirrorDomain", {})
		.then(data => {
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
		.catch(err => {
			reject(err)
		})
	})
}

// TestModuleHasErrors asks the TestModule whether it has encountered any
// errors during the test cycle.
function TestModuleHasErrors() {
	return new Promise((resolve, reject) => {
		kernel.callModule(kernelTestSuite, "viewErrors", {})
		.then(data => {
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
		.catch(err => {
			reject(err)
		})
	})
}

// Check whether any errors showed up in the helper module of the testing
// module.
let helperModule = "AQAnqy99JwNg5yJ29slKeAspVqLtC5QrAp_fPdjwNMF8kw"
function TestHelperModuleHasErrors() {
	return new Promise((resolve, reject) => {
		kernel.callModule(helperModule, "viewErrors", {})
		.then(data => {
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
		.catch(err => {
			reject(err)
		})
	})
}

// TestSecureUpload will upload a very basic file to Skynet using libkernel.
function TestSecureUpload() {
	return kernel.upload("testUpload.txt", new TextEncoder().encode("test data"))
}

// TestPadAndEncrypt will use the padAndEncrypt function, which has the dual
// purpose of testing encryption and seeing whether or not kernel
// communications are working.
function TestPadAndEncrypt() {
	return kernel.padAndEncrypt("text.txt", new TextEncoder().encode("some file data"))
}

// TestMessageSpeedSequential1k will send ten thousand messages to the kernel
// sequentially.
function TestMessageSpeedSequential1k() {
	// sendSequentialMessages is a helper function that will send a
	// message, wait for the message to resolve, then call itself again
	// with a lower 'remaining' value, exiting out when 'remaining' hits
	// zero.
	let sendSequentialMessages = function(remaining, resolve, reject) {
		if (remaining === 0) {
			resolve("all messages resolved")
			return
		}

		kernel.testMessage()
		.then(x => {
			sendSequentialMessages(remaining-1, resolve, reject)
		})
		.catch(x => {
			reject(x)
		})
	}
	return new Promise((resolve, reject) => {
		sendSequentialMessages(1000, resolve, reject)
	})
}

// TestMessageSpeedParallel1k will send ten thousand messages to the kernel in
// parallel.
function TestMessageSpeedParallel1k() {
	return new Promise((resolve, reject) => {
		let promises = []
		for (let i = 0; i < 1000; i++) {
			promises.push(kernel.testMessage())
		}
		Promise.all(promises)
		.then(x => {
			resolve("all messages reseolved")
		})
		.catch(x => {
			reject(x)
		})
	})
}

// TestPadAndEncryptSequential1k will use the padAndEncrypt function, which has the dual
// purpose of testing encryption and seeing whether or not kernel
// communications are working.
function TestPadAndEncryptSequential1k() {
	let sequentialPadAndEncrypt = function(remaining, resolve, reject) {
		if (remaining === 0) {
			resolve("all messages resolved")
			return
		}

		let u8 = new TextEncoder().encode("some file data")
		kernel.padAndEncrypt("test.txt", u8)
		.then(x => {
			sequentialPadAndEncrypt(remaining-1, resolve, reject)
		})
		.catch(x => {
			reject(x)
		})
	}
	return new Promise((resolve, reject) => {
		sequentialPadAndEncrypt(1000, resolve, reject)
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

// Establish the index page.
const IndexPage = () => {
	return (
		<main>
			<title>Libkernel Test Suite</title>
			<h1>Running Tests</h1>
			<TestCard name="TestLibkernelInit" test={TestLibkernelInit} turn={getTurn()} />
			<TestCard name="TestSendTestMessage" test={TestSendTestMessage} turn={getTurn()} />
			<TestCard name="TestModuleHasSeed" test={TestModuleHasSeed} turn={getTurn()} />
			<TestCard name="TestModulePresentSeed" test={TestModulePresentSeed} turn={getTurn()} />
			<TestCard name="TestModuleQueryKernel" test={TestModuleQueryKernel} turn={getTurn()} />
			<TestCard name="TestModuleCheckHelperSeed" test={TestModuleCheckHelperSeed} turn={getTurn()} />
			<TestCard name="TestViewTesterSeedByHelper" test={TestViewTesterSeedByHelper} turn={getTurn()} />
			<TestCard name="TestMirrorDomain" test={TestMirrorDomain} turn={getTurn()} />
			<TestCard name="TestTesterMirrorDomain" test={TestTesterMirrorDomain} turn={getTurn()} />
			<TestCard name="TestModuleHasErrors" test={TestModuleHasErrors} turn={getTurn()} />
			<TestCard name="TestHelperModuleHasErrors" test={TestHelperModuleHasErrors} turn={getTurn()} />
		</main>
	)
}
export default IndexPage
/*
			<TestCard name="TestSecureUpload" test={TestSecureUpload} turn={getTurn()} />
			<TestCard name="TestPadAndEncrypt" test={TestPadAndEncrypt} turn={getTurn()} />
			<TestCard name="TestMsgSpeedSequential1k" test={TestMessageSpeedSequential1k} turn={getTurn()} />
			<TestCard name="TestMsgSpeedParallel1k" test={TestMessageSpeedParallel1k} turn={getTurn()} />
			<TestCard name="TestPadAndEncryptSeq1k" test={TestPadAndEncryptSequential1k} turn={getTurn()} />
*/
