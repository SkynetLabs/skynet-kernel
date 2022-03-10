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

// TestLibkernelInit will check the init function of the kernel.
function TestLibkernelInit() {
	return kernel.init()
}

// TestSendTestMessage will send a test message to the kernel and check for the
// result.
function TestSendTestMessage() {
	return kernel.testMessage()
}

// TestModuleHasSeed checks that the module
let basicTestSuite = "AQB6Gs0VcwH-xvEUaoGqORMNuBvpXdt0wRyex-Kqckad-A"
function TestModuleHasSeed() {
	return new Promise((resolve, reject) => {
		kernel.callModule(basicTestSuite, "viewSeed", {})
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

// TestGenericModuleCall will upload a very basic file to Skynet using libkernel.
//
// TODO: Probably want to use something besides padAndEncrypt as the test for a
// generic module.
let padAndEncryptModule = "AQAs00kS6OKUd-FIWj9qdJLArCiEDMVgYBSkaetuTF-MsQ"
function TestGenericModuleCall() {
	return kernel.callModule(padAndEncryptModule, "padAndEncrypt", {
		filepath: "aFilename",
		fileData: new TextEncoder().encode("a bit of file data")
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
		</main>
	)
}
export default IndexPage
/*
			<TestCard name="TestGenericModuleCall" test={TestGenericModuleCall} turn={getTurn()} />
			<TestCard name="TestSecureUpload" test={TestSecureUpload} turn={getTurn()} />
			<TestCard name="TestPadAndEncrypt" test={TestPadAndEncrypt} turn={getTurn()} />
			<TestCard name="TestMsgSpeedSequential1k" test={TestMessageSpeedSequential1k} turn={getTurn()} />
			<TestCard name="TestMsgSpeedParallel1k" test={TestMessageSpeedParallel1k} turn={getTurn()} />
			<TestCard name="TestPadAndEncryptSeq1k" test={TestPadAndEncryptSequential1k} turn={getTurn()} />
*/
