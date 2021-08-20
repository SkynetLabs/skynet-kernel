// Create a listener that completely swallows the pages of the given URLs,
// returning nothing instead.
//
// TODO: Ideally instead of just replacing the request with nothing, the
// request is never fired in the first place, accomplishing two things. First,
// the round trip time to the network is eliminated. Second, the user does not
// need siasky.net to be online for them to access Skynet.
function listener(details) {
  let filter = browser.webRequest.filterResponseData(details.requestId);
  filter.onstop = event => {
    filter.disconnect();
  }

  return {};
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
