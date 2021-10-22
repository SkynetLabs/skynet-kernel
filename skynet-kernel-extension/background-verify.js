// TODO: This is one of the final steps of the kernel development, but we are
// going to want to switch the mechanics of this file from injecting code to
// verifying code. We will want to verify the headers, and we will want to
// verify the response. We are expecting the server (siasky.net) to respond with
// an exact set of code, any other response from the server is considered
// invalid and will be discarded.
//
// The long term goal would be to make a full exception in the browsers where
// this extension fully replaces siasky.net with known responses, rather than
// just verifying those responses. Current web standards are incompatible with
// that goal, so we are compromising for the time being.
// 
// Once we have transitioned from deleting the response from skynet to just
// verifying the response, we will not need any of the content scripts, because
// the remote server will be serving the content scripts.

// Create a listener that completely swallows the pages of the given URLs,
// returning nothing instead.
function listener(details) {
  let filter = browser.webRequest.filterResponseData(details.requestId);
  filter.onstop = event => {
    filter.disconnect();
  }
  return {};
}

// Since we can't seem to cancel the request entirely, we need to swallow the
// response headers and replace them with custom responses. We don't want the
// portal interfering with the operation of our kernel by adding malicious
// response headers.
function setResponse(details) {
  let newHeaders = [
    {
      name: "content-type",
      value: "text/html; charset=utf8"
    }
  ]
  return {responseHeaders: newHeaders};
}

// The extension will listen to all requests that go to kernel.siasky.net and
// home.siasky.net and replace them with trusted content scripts. The content
// scripts are identical to what the user expects those web pages to serve. The
// value of the browser extension is that we eliminate all possibility that
// siasky.net can act maliciously.
// 
// We swallow all code at all of the kernel.siasky.net and home.siasky.net URLs
// even though there are only 3 actual pages we care about as an extra security
// precaution. If the user navigates to the wrong URL on accident, we don't
// want the server to have a chance to inject malicious html.
browser.webRequest.onBeforeRequest.addListener(
  listener,
  {urls: ["https://kernel.siasky.net/*", "https://home.siasky.net/*"]},
  ["blocking"]
);

browser.webRequest.onHeadersReceived.addListener(
  setResponse,
  {urls: ["https://kernel.siasky.net/*", "https://home.siasky.net/*"]},
  ["blocking", "responseHeaders"]
);
