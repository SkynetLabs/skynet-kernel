export {}

declare var browser

window.addEventListener("message", (event) => {
	console.log("message received")
	console.log(event)
	console.log(event.data)
	if (event.data.kernelMethod === "skynetKernelLoaded") {
		kernelFrame.contentWindow.postMessage({kernelMethod: "requestTest"}, "https://kernel.siasky.net")
	}
	if (event.data.kernelMethod === "receiveTest") {
		console.log("test received")
	}
}, false)

// Try to create an iframe.
let kernelFrame = document.createElement("iframe")
kernelFrame.src = "https://kernel.siasky.net"
kernelFrame.style.width = "0"
kernelFrame.style.height = "0"
kernelFrame.style.border = "none"
kernelFrame.style.position = "absolute"
document.body.appendChild(kernelFrame)
console.log("kernel should be appended")

// Create a listener that completely swallows the page, returning nothing
// instead.
function listener(details) {
	console.log("listener hit")
	// TODO: We're going to eventually swap this out for only checking for
	// the kernel, every other page will load directly from the kernel.
	// This will mean that the default kernel is going to have so have some
	// default responses loaded to do the homescreen and auth page.
	if (details.url !== "https://test.siasky.net/") {
		console.log("it's not test")
		let filter = browser.webRequest.filterResponseData(details.requestId)
		filter.onstart = event => {
			filter.close()
		}
		return {}
	}

	// TODO: Injection for test.siasky.net. Need to open an iframe to the
	// kernel and ask it what code is supposed to load.
	console.log("trying test page")
	let filter = browser.webRequest.filterResponseData(details.requestId)
	filter.ondata = event => {
		let enc = new TextEncoder()
		console.log(event.data)
		filter.write(enc.encode(`{"message": "yo"}`))
		filter.close()
	}
}

// Swallow the repsonse headers and set the content-type to text/html. If we
// don't replace the response headers the portal can potentially introduce
// malicious information.
function setResponse(details) {
	let newHeaders = [
		{
			name: "content-type",
			value: "text/html; charset=utf8"
		}
	]
	return {responseHeaders: newHeaders}
}

// Intercept all requests to kernel.siasky.net and home.siasky.net so that they
// can be replaced with trusted code. We need to be confident about the exact
// code that is running at these URLs, as the user will be trusting their data
// and crypto keys to these webpages.
//
// TODO: I believe that we need to catch any http requests and either redirect
// or cancel them.
browser.webRequest.onBeforeRequest.addListener(
	listener,
	{urls: ["https://kernel.siasky.net/*", "https://home.siasky.net/*", "https://test.siasky.net/*"]},
	["blocking"]
)

// Intercept the headers for all requests to kernel.siasky.net and
// home.siasky.net so that they can be replaced with the correct headers.
// Without this step, a portal can insert malicious headers that may alter how
// the code at these URLs behaves.
browser.webRequest.onHeadersReceived.addListener(
	setResponse,
	{urls: ["https://kernel.siasky.net/*", "https://home.siasky.net/*"]},
	["blocking", "responseHeaders"]
)
