// The background is the background script that runs for the duration of the
// kernel's life. It is responsible for passing messages between pages calling
// the kernel and the kernel itself. We use a background page so that there
// only needs to be a single kernel for the whole browser, instead of requiring
// each webpage to open an iframe.
//
// There are a few places where we need to use 'any' instead of a real type
// because this is a browser extension and not all of the types are recognized
// by typescript. If you know how to get rid of any of these, please let us
// know. These areas are marked with a 'tsc' comment.

import { DataFn, KernelAuthStatus, RequestOverrideResponse } from "libskynet";

declare let browser: any; // tsc

// Set up the code for handling queries and ports. They are both objects that
// can suffer memory leaks, so we declare them together alongside a tracker
// that will log when it appears like there's a memory leak.
let queriesNonce = 1;
const queries: any = new Object();
let portsNonce = 0;
let openPorts = {} as any;
let timer = 20000;
function logLargeObjects() {
  const queriesLen = Object.keys(queries).length;
  const portsLen = Object.keys(openPorts).length;
  if (queriesLen > 500) {
    console.error("queries appears to be leaking:", queriesLen);
  }
  if (portsLen > 50) {
    console.error("ports appears to be leaking:", portsLen);
  }
  timer *= 1.25;
  setTimeout(logLargeObjects, timer);
}
setTimeout(logLargeObjects, timer);

// Create a promise that will resolve when the bootloader is ready to receive
// messages. We'll also track the auth info here, since the bootloader lets us
// know that it is ready to receive messages by sengind the auth info.
let authStatus: KernelAuthStatus;
let authStatusKnown = false;
let authStatusResolve: DataFn;
const blockForBootloader = new Promise((resolve) => {
  authStatusResolve = resolve;
});

// queryKernel returns a promise that will resolve when the kernel has
// responded to the query. The resolve function is stored in the kernelQueries
// object using the nonce as the key. It will be called by the listener that
// receives the kernel's response.
//
// NOTE: the queriesNonce and queries object is also shared by the
// bridgeListener.
//
// NOTE: queryKernel cannot be used if you need queryUpdates or
// responseUpdates, it's only intended to be used with single-message queries.
function queryKernel(query: any): Promise<any> {
  // Return the promise that will resolve once we receive a message from the
  // kernel.
  return new Promise((resolve) => {
    // Define the callback which will be called when a response is recieved
    // from the kernel.
    const receiveResponse = function (data: any) {
      // The receiveResponse field gets resolved to the entire message
      // that was received, this is because some messages are being
      // passed to the module and need to contain a nonce, etc. Our
      // internal queryKernel for this file though doesn't need the
      // method and the nonce, it just needs the response data, so it
      // resolves data.data.
      resolve(data.data);
    };

    // Wait until the bootloader is ready, then send the query to the
    // bootloader.
    blockForBootloader.then(() => {
      const nonce = queriesNonce;
      queriesNonce += 1;
      query.nonce = nonce;
      queries[nonce] = receiveResponse;
      if (kernelFrame.contentWindow !== null) {
        kernelFrame.contentWindow.postMessage(query, "http://kernel.skynet");
      } else {
        // I'm not sure when this can happen, but perhaps if the
        // kernelFrame internally calls window.close() or some
        // equivalent call, the contentWindow of the kernelFrame might
        // be null.
        console.error("kernelFrame.contentWindow was null, cannot send message!");
      }
    });
  });
}

// handleKernelMessage will handle messages from the kernel.
//
// The kernel is considered trusted so there is no type checking on the inputs.
function handleKernelMessage(event: MessageEvent) {
  // Ignore all messages that aren't coming from the kernel.
  if (event.origin !== "http://kernel.skynet") {
    return;
  }
  const data = event.data.data;

  // Check if the kernel is trying to get a log message written.
  if (event.data.method === "log") {
    if (data.isErr === false) {
      console.log(data.message);
    } else {
      console.error(data.message);
    }
    return;
  }

  // Check if the kernel has sent an auth status message.
  if (event.data.method === "kernelAuthStatus") {
    authStatus = data;
    if (authStatusKnown === false) {
      authStatusResolve();
      authStatusKnown = true;
      console.log("bootloader is now initialized");
      if (authStatus.loginComplete !== true) {
        console.log("user is not logged in: waiting until login is confirmed");
      }
    }

    // Need to pass the new auth to all ports that are connected to the
    // background. Need to wrap it in a try-catch because the postMessage
    // here will throw if the tab was suddenly closed or some other event
    // knocked out the port.
    for (const [, port] of Object.entries(openPorts)) {
      try {
        (port as any).postMessage(event.data);
      } catch {
        // Nothing to do here, sometimes there can be errors if the
        // page closed unexpectedly. No need to log or otherwise handle
        // the error.
      }
    }

    // If the kernel is signaling that there has been a logout, reload the
    // iframe to reset both the kernel and the background state. A hard
    // refresh isn't strictly necessary but it guarantees that old items
    // are cleaned up properly.
    if (data.logoutComplete === true) {
      console.log("received logout signal, clearing all ports");

      // Iterate over all of the openPorts and close them.
      for (const [, port] of Object.entries(openPorts)) {
        try {
          (port as any).disconnect();
        } catch {
          // Nothing to do here, sometimes there can be errors if the
          // page closed unexpectedly. No need to log or otherwise
          // handle the error.
        }
      }

      // Reset the openPorts object.
      openPorts = {};
    }

    return;
  }

  // All other message types are expected to be associated with a query.
  // Concurrency limitations means its totally possible to receive an update
  // for a message after the message has been closed, therefore it's not an
  // error if there is no query for this nonce anymore.
  if (!(event.data.nonce in queries)) {
    return;
  }

  // Pass the data along using the receiveResult method. If this is a
  // response, it is the final communication and the query can be deleted.
  const receiveResult = queries[event.data.nonce];
  if (event.data.method === "response") {
    delete queries[event.data.nonce];
  }
  // Need to pass along the full event.data because in some cases it is being
  // passed directly to a module or skapp, and that entity will need fields
  // like the method and nonce.
  receiveResult(event.data);
}
window.addEventListener("message", handleKernelMessage);

// handleBridgeMessage and the related functions will receive and handle
// messages coming from the bridge. Note that many instances of the bridge can
// exist across many different web pages.
//
// We keep track of all the open ports so that we can send them updated auth
// messages when new auth messages arrive.
function handleBridgeMessage(port: any, portNonce: number, data: any, domain: string) {
  // Check that the message has a nonce and therefore can receive a response.
  if (!("nonce" in data)) {
    return;
  }

  // If the message is not a queryUpdate, we set the domain of the message
  // and we set the response function in the queries map. The domain needs to
  // be set so that the kernel knows the domain of the app sending the
  // request.
  //
  // These fields can be skipped for a queryUpdate because they were already
  // sent in the original query.
  if (data.method !== "queryUpdate") {
    queries[data.nonce] = (response: any) => {
      if (portNonce in openPorts) {
        port.postMessage(response);
      }
    };
    data["domain"] = domain;
  }
  kernelFrame.contentWindow!.postMessage(data, "http://kernel.skynet");
}
function bridgeListener(port: any) {
  // Add this port to the set of openPorts.
  const portNonce = portsNonce;
  portsNonce++;
  openPorts[portNonce] = port;

  // Set up the garbage collection for the port.
  port.onDisconnect.addListener(() => {
    delete openPorts[portNonce];
  });

  // Grab the domain of the webpage that's connecting to the background
  // page. The kernel needs to know the domain so that it can
  // conditionally apply restrictions or grant priviledges based on the
  // domain. This is especially important for modules, as admin access to
  // control the data of a module is typically only granted to a single
  // web domain.
  const domain = new URL(port.sender.url).hostname;

  // Add a listener to grab messages that are sent over the port.
  port.onMessage.addListener(function (data: any) {
    handleBridgeMessage(port, portNonce, data, domain);
  });

  // Send a message down the port containing the current auth status of the
  // kernel. If a new webpage is just connecting to the kernel it's not going
  // to know the status, we have to tell it.
  blockForBootloader.then(() => {
    port.postMessage({
      method: "kernelAuthStatus",
      data: authStatus,
    });
  });
}
// Add a listener that will catch messages from content scripts.
browser.runtime.onConnect.addListener(bridgeListener);

// Establish a proxy that enables the user to visit non-existent TLDs, such as
// '.hns' and '.eth' and '.skynet'. The main idea behind this proxy is that we
// proxy non-existant URLs to a URL that does exist, so that the page still
// loads.
//
// We use proxies as a workaround for a fundamental limitation of
// onBeforeRequest - you cannot replace or inject a webpage that does not
// exist. We can't support imaginary domains like 'kernel.skynet' without a
// proxy because they don't actually exist, which means any calls to
// 'filter.write()' in an 'onBeforeRequest' response will fail. If we could
// cancel a request in onBeforeRequest while also still being able to write a
// response and injecting headers with 'onHeadersReceived', we could drop the
// proxy requirement.
//
// Similary, we need to use 'type: "http"' instead of 'type: "https"' because
// the proxy server does not have TLS certs for the imaginary domains. This
// will result in the user getting an insecure icon in the corner of their
// browser. Even though the browser thinks the communication is insecure, the
// truth is that the whole page is being loaded from a secure context (the
// kerenl) and is being authenticated and often (though not always) encrypted
// over transport. So the user is safe from MitM attacks and some forms of
// snooping despite the insecure warning.
//
// The proxy itself has a hard-coded carve-out for 'kernel.skynet' to allow the
// kernel to load. It communicates with the kernel to determine what other
// pages to proxy.
function handleProxyRequest(info: any) {
  // Hardcode an exception for 'kernel.skynet'. We need this exception
  // because that's where the kernel exists, and the kernel needs to be
  // loaded before we can ask the kernel whether we should be proxying
  // something.
  //
  // When we return an array of proxy options, the browser will go
  // through the options in order until one of the proxies succeeds. By
  // having a list, we ensure that even if one of the major services is
  // down, the kernel extension and all pages will still work.
  const hostname = new URL(info.url).hostname;
  if (hostname === "kernel.skynet") {
    return [
      { type: "http", host: "localhost", port: 25252 },
      { type: "http", host: "skynetpro.net", port: 80 },
      { type: "http", host: "skynetfree.net", port: 80 },
      { type: "http", host: "siasky.net", port: 80 },
      { type: "http", host: "web3portal.com", port: 80 },
    ];
  }

  return { type: "direct" };
}
browser.proxy.onRequest.addListener(handleProxyRequest, { urls: ["<all_urls>"] });

// onBeforeRequestListener processes requests that are sent to us by the
// onBeforeRequest hook. The page 'kernel.skynet' is hardcoded and will be
// completely swallowed, returning a blank page. The content script for
// 'kernel.skynet' will inject code that loads the kernel.
//
// For all other pages, the kernel will be consulted. The kernel will either
// indicate that the page should be ignored and therefore loaded as the server
// presents it, or the kernel will indicate that an alternate response should
// be provided.
//
// NOTE: The filters are pretty difficult to use correctly, and are highly
// prone to disruptive race conditions if you aren't precise with your
// implementation. Please get extra review if making any changes to the flow of
// the filters.
function onBeforeRequestListener(details: any) {
  // For the kernel, we swallow the entire page. The 'bootloader' content
  // script will everything that we need.
  if (details.url === "http://kernel.skynet/") {
    // Get the filter and swallow any response from the server.
    const filter = browser.webRequest.filterResponseData(details.requestId);
    filter.onstart = () => {
      filter.close();
    };
    return;
  }

  // For the favicon, we make a request to a content script that has access
  // to the favicon.
  if (details.url === "http://kernel.skynet/favicon.ico") {
    // Send a message to the kernel requesting an override for the
    // favicon.ico. The kernel is itself loading this favicon from the
    // browser, I just wasn't certain how to get binary objects directly to
    // the background page, so we fetch it via a content script instead.
    const faviconPromise = queryKernel({
      method: "requestOverride",
      data: {
        url: details.url,
        method: details.method,
      },
    });

    // Get the filter and swallow any response from the server. Setting
    // 'onData' to a blank function will swallow all data from the server.
    const filter = browser.webRequest.filterResponseData(details.requestId);
    filter.ondata = () => {
      // By setting 'ondata' to the emtpy function, we effectively ensure
      // that none of the data will be processed.
    };
    filter.onstop = () => {
      faviconPromise.then((result: RequestOverrideResponse) => {
        filter.write(result.body);
        filter.close();
      });
    };
    return;
  }

  // For the favicon, we make a request to a content script that has access
  // to the favicon.
  if (details.url === "http://kernel.skynet/auth.html") {
    // Send a message to the kernel requesting an override for the auth
    // page. The kernel is itself loading the auth page from the browser, I
    // just wasn't certain how to get binary objects directly to the
    // background page, so we fetch it via a content script instead.
    const authPagePromise = queryKernel({
      method: "requestOverride",
      data: {
        url: details.url,
        method: details.method,
      },
    });

    // Get the filter and swallow any response from the server. Setting
    // 'onData' to a blank function will swallow all data from the server.
    const filter = browser.webRequest.filterResponseData(details.requestId);
    filter.ondata = () => {
      // By setting 'ondata' to the emtpy function, we effectively ensure
      // that none of the data will be processed.
    };
    filter.onstop = () => {
      authPagePromise.then((result: RequestOverrideResponse) => {
        filter.write(result.body);
        filter.close();
      });
    };
    return;
  }

  // Otherwise do nothing.
  return {};
}
browser.webRequest.onBeforeRequest.addListener(onBeforeRequestListener, { urls: ["<all_urls>"] }, ["blocking"]);

// onHeadersReceivedListener will replace the headers provided by the portal
// with trusted headers, preventing the portal from interfering with the kernel
// by providing bad headers.
function onHeadersReceivedListener(details: any) {
  // For kernel.skynet, replace the response headers with trusted headers.
  if (details.url === "http://kernel.skynet/" || details.url === "http://kernel.skynet/auth.html") {
    const headers = [
      {
        name: "content-type",
        value: "text/html; charset=utf8",
      },
    ];
    return { responseHeaders: headers };
  }

  // For the favicon, replace the headers with png headers.
  if (details.url === "http://kernel.skynet/favicon.ico") {
    const headers = [
      {
        name: "content-type",
        value: "image/png",
      },
    ];
    return { responseHeaders: headers };
  }

  // For everything else, use the standard headers.
  return { responseHeaders: details.responseHeaders };
}
browser.webRequest.onHeadersReceived.addListener(onHeadersReceivedListener, { urls: ["<all_urls>"] }, [
  "blocking",
  "responseHeaders",
]);

// Open an iframe containing the kernel.
const kernelFrame: HTMLIFrameElement = document.createElement("iframe");
kernelFrame.src = "http://kernel.skynet";
document.body.appendChild(kernelFrame);
