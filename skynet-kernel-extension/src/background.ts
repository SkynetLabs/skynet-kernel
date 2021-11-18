declare var browser;

// Create a listener that completely swallows the page, returning nothing
// instead.
function listener(details) {
  let filter = browser.webRequest.filterResponseData(details.requestId);
  filter.onstop = event => {
    filter.disconnect();
  }
  return {};
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
  return {responseHeaders: newHeaders};
}

// Intercept all requests to kernel.siasky.net and home.siasky.net so that they
// can be replaced with trusted code. We need to be confident about the exact
// code that is running at these URLs, as the user will be trusting their data
// and crypto keys to these webpages.
browser.webRequest.onBeforeRequest.addListener(
  listener,
  {urls: ["https://kernel.siasky.net/*", "https://home.siasky.net/*"]},
  ["blocking"]
);

// Intercept the headers for all requests to kernel.siasky.net and
// home.siasky.net so that they can be replaced with the correct headers.
// Without this step, a portal can insert malicious headers that may alter how
// the code at these URLs behaves.
browser.webRequest.onHeadersReceived.addListener(
  setResponse,
  {urls: ["https://kernel.siasky.net/*", "https://home.siasky.net/*"]},
  ["blocking", "responseHeaders"]
);
