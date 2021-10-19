// Create a listener that completely swallows the pages of the given URLs,
// returning nothing instead.
//
// TODO: Ideally, instead of just replacing the request with nothing and
// resetting the headers, we use redirectUrl to load an extension page that has
// all of the code that we want. I couldn't figure out how to get it working
// though, all attempts resulted in the extension not running.
function listener(details) {
  let filter = browser.webRequest.filterResponseData(details.requestId);
  filter.onstop = event => {
    filter.disconnect();
  }
  return {};

  // return {redirectUrl: "https://google.com"}; - this works
  // return {redirectUrl: "homescreen.html"}; - this doesn't work
  // return {cancel: true}; - this cancels the request, but I don't know how to serve a webpage afterwards
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

// The extension will listen to all requests that go to node.siasky.net and
// home.siasky.net and replace them with trusted content scripts. The content
// scripts are identical to what the user expects those web pages to serve. The
// value of the browser extension is that we eliminate all possibility that
// siasky.net can act maliciously.
// 
// We swallow all code at all of the node.siasky.net and home.siasky.net URLs
// even though there are only 3 actual pages we care about as an extra security
// precaution. If the user navigates to the wrong URL on accident, we don't
// want the server to have a chance to inject malicious html.
browser.webRequest.onBeforeRequest.addListener(
  listener,
  {urls: ["https://node.siasky.net/*", "https://home.siasky.net/*"]},
  ["blocking"]
);

browser.webRequest.onHeadersReceived.addListener(
  setResponse,
  {urls: ["https://node.siasky.net/*", "https://home.siasky.net/*"]},
  ["blocking", "responseHeaders"]
);
