function listener(details) {
  let url = browser.runtime.getURL("redirect.html");
  console.log(url);
  return {redirectUrl: browser.runtime.getURL("redirect.html")}
}

browser.webRequest.onBeforeRequest.addListener(
  listener,
  {urls: ["https://redirect-test.siasky.net/*"]},
  ["blocking"]
);
