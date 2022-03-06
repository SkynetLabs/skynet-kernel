# skynet-kernel (EXPERIMENTAL)

skynet-kernel is a web3 browser extension that creates a fully trustless
client-side environment for the user. Every line of code that runs in this
environment gets verified by the client before running, enabling users to run
applications like Defi frontends, decentralized storage clients, and even
entire blockchain full nodes from their web browser without needing to fear
that a malicious server could serve them corrupt data.

The kernel works as a browser extension that intercepts network requests sent
by the browser. The kernel replaces the traditional network request (which
trusts the server) with a verifiable network request, ensuring that when the
user loads a webpage or application, the user is loading exactly the code that
they are expecting to load.

The kernel introduces new TLDs such as '.skynet' and '.hns' which can host
applications. Due to limitations of the browser extension API, users will have
to visit these applications by going to 'http' URLs instead of 'https' URLs.
For example, a user logs in using 'http://kernel.skynet/auth.html'

The kernel supports static web pages, decentralized storage endpoints
(including uploads, downloads, and SkyDB), and also supports long running
background applications. A simple example of a useful background application is
a chat service which listens for messages from other users. A more advanced
example would be a crypto trading bot.

The kernel also supports 'modules', which are hosted in private domains and can
serve APIs to webapps and other modules. Modules enable web3 applications to
securely share data, and enable users to export their information between
applications. A simple example of a module would track a username and avatar
for a user, so that all web3 applications may load the same profile information
for the user. A more complex example might be a social graph which establishes
all of a users friends and all of the content creators that they follow,
allowing a user to automatically be subscribed to all of their favorite
creators the moment they join a new application or platform.

## Repository Structure

The 'extension' folder contains the source code for the browser extension. It's
a typescript project which uses a manual bundler (build.sh at the top level) to
compile into the final browser extension. The code in this folder is
responsible for creating a trustless execution zone for the user.

The 'kernel' folder contains the default kernel that gets loaded for the user
when the user first logs into Skynet. The majority of the interesting concepts
are in this folder.

The 'libkernel' folder contains a node library that can help skapps interact
with the kernel. The main goal of libkernel is to greatly simplify the process
of communicating effectively with the kernel.

The 'modules' folder contains example kernel modules, including modules
maintained by the core team that are intended to be broadly useful to
developers.

The 'webapps' directory contains webapps that are a key part of the development
process. The most important apps are the default home page, the default
authenticated home page, the page that allows a user to log into Skynet, and a
testapp which provides integration testing for the kernel.

## Building the Kernel

The build process is being updated. Currently, the build process is linux-only.
That will be fixed soon. The extension has only been tested on Firefox. That
will also be fixed soon.

### Dependencies

To build the kernel today, first you need to build the 'skynet-utils' binary.
To do this, clone the repo at 'github.com/SkynetLabs/go-skynet', check out the
'env-var' branch, and run `go install ./...`. If you do not have go installed
on your machine, you can install go by following the directions at
'go.dev/doc/install/source'. Make sure you update your PATH variable, typically
you need to add both `export PATH=$PATH:/usr/local/go/bin' and `export
PATH=$PATH:/home/user/go/bin` to your .bashrc.

You will also need 'tsc', which is the typescript compiler. You can install
typescript by running `npm install -g typescript`. If you do not have npm, you
will need to follow an online tutorial for getting it working.

### Build the Extension

Once you have 'skynet-utils' and 'tsc' in your PATH, you can build the kernel
by running 'make'. This will create a 'build' folder and a 'build-cache' folder
in the repo. The browser extension will be in 'build/extension' and the kernel
will be in 'build/kernel'.

You can load the extension into Firefox by going to 'about:debugging' -> 'This
Firefox' and then clicking on 'Load Temporary Add-on'. Navigate to
'build/extension' in the file picker and select the 'manifest.json' file. This
will load the Skynet Kernel into Firefox as a temporary add-on.

### Run the Test Suite

To run the kernel test suite, you will need 'gatsby', which you can get by
running the command `npm install -g gatsby`. Then navigate to the
'webapp/kernel-test-suite' folder in your terminal and run `gatsby develop`.

You can then view the test suite by navigating to 'localhost:8000' in your
browser. If you have not logged into the kernel before, many of the tests will
fail. You can log in by going to 'http://kernel.skynet/auth.html' Refresh the
test suite to re-run the tests. You may need to include 'http://' when you type
the URL, because your browser will not recognize 'kernel.skynet' as a valid
domain and instead think you want to use a search engine.

## Using the Kernel

There is a javascript library available in npm called 'libkernel' which
abstracts all of this away and provides a simple API that allows developers to
interact with the kernel. A typical libkernel call looks something like:

```js
libkernel.upload("someFile.mp4", fileData)
.then(resp => successCallback(resp))
.catch(err => errCallback(err))
```

A generic moduleCall will typically look something like:

```js
kernel.callModule(moduleEncryptFile, "encryptFile", {
	filepath: "someFile.mp4",
	fileData,
})
.then(resp => successCallback(resp))
.catch(err => errCallback(err))
```
If you are developer that is just looking to build cool webapps, you stop
reading here and get started by using 'libkernel'. Check out the README in the
libkernel folder for more examples of interesting code.

One of the best ways to help us keep the kernel reliable is to contribute
testing to the test suite. If you write an application or a module for the
kernel, we would love to have integration tests for your module added to our
test suite. This helps ensure that future changes to the kernel will maintain
full compatibility with your libraries and applications.

## Developing Kernel Modules

See the README in the modules folder for an overview of how to develop kernel
modules.

## Sending Messages From a Webpage

The Skynet kernel consists of three major elements. There's the kernel itself,
which lives in an iframe at 'kernel.skynet', there's the background script of
the browser extension which hosts the kernel, and there's the content bridge of
the browser extension which allows webpages to communicate with the kernel.

The kernel lives in the background script inside of an iframe. Because the
kernel is in an iframe at its own domain, the kernel is able to safely manage
user secrets. The user's seed is kept inside of this iframe, where it is
inaccessible to the background script, and also inaccessible to all webpages
that use the kernel.

The background script of the browser extension runs continuously throughout the
life of the browser. It loads the kernel using an iframe at startup, and then
keeps that iframe open until the browser is closed. The perforamnce penalty of
creating a new iframe is only paid a single time. All webapps that wish to use
the kernel can send messages to the bridge rather than needing to create their
own iframe, which substantially improves page load times.

The background script communicates with the kernel using postMessage. Webapps
are not able to communicate to the kernel directly, nor are they able to
communicate to the background page directly. Instead, webapps need to
communicate with the bridge. Webapps will send a message to the bridge, the
bridge will send a message to the background, the background will send a
message to the kernel, and then the kernel will respond to the background,
which will respond to the bridge, which will respond to the page.

Visualized:

```
page -> bridge -> background -> kernel -> background -> bridge -> page
```

Though there are 6 messages total, the entire process typically takes under 2
milliseconds to complete.

All messaging in the kernel is asynchronous. If the user sends multiple
messages at once, the user needs a way to map the messages that got sent to the
responses that will be received. This is done by adding a nonce to every
message. The response will contain a matching nonce.

## Sending Messages from a Module

Modules exist as webworkers inside of the kernel iframe. Modules are allowed to
send messages to the kernel, including making requests to call other modules.
If moduleA is making a function call on moduleB, the message routing looks like
this:

```
moduleA -> kernel -> moduleB -> kernel -> moduleA
```

From the perspective of moduleA, they are sending a single request to the
kernel and receiving a single response from the kernel. This is true regardless
of how many addition modules moduleB needs to invoke. In general, the messaging
overhead here is around 0.2 milliseconds per message, which is fast enough to
allow modules to call out to each other in cascades that have dozens of total
dependencies. Even calls that invoke thousands of modules can finish in under a
second.

## Message Protocols

The kernel requires a number of messaging protocols, which are all outlined
below. The key relationships are:

+ Web page -> Bridge
+ Bridge -> Background Page
+ All -> Kernel
+ Kernel -> Background Page
+ Kernel -> Module
+ Module -> Kernel

At all layers, parallel communications are supported. This means that at any
time, any of these layers could have many simultaneous messages open, and the
responses might come back fully out of order. To overcome this, every message
is expected to include a nonce that will enable queries to be matched with
responses.

All messages also have a 'method' field, which indicates which type of message
is being sent and what code will be used by the receiver to process the
message.

An intial message opens up a 'query' and assigns the query a unique nonce. All
subsequent messages within the query will use the same nonce, and will use one
of three methods:

+ queryUpdate: Sent by the caller to provide new information about the query
+ reponseUpdate: Sent by the receiver to provide new information to the caller
  about the query.
+ response: Sent by the receiver as the final message associated with a query.
  Future messages that use the query's nonce will be ignored.

All messages will therefore have a nonce and a method. Messages can optionally
have a 'data' field, which can be any object and will vary based on the query
method.

Finally, all response messages will have an 'err' field. If there is no error,
'err' will be set to 'null'. If there is an error, it is expected that there
will be no data payload.

### Web Page -> Bridge

According to the browser spec, web pages are not allowed to talk to browser
extension background pages directly. Instead, they have to communicate to the
background page using a content script. In the kernel, we've called that
content script 'the bridge', and it can be found in
'extension/content-bridge.ts'.

The browser extension loads the bridge into every single page. Any webpage,
including any centralized web page, is able to contact the bridge and use it to
communicate with the user's kernel. The vast majority of application calls will
talk exclusively to the bridge.

The only two methods of the bridge are 'test' and 'newKernelQuery'.  'test' is
a simple handshake protocol that a webpage can perform to confirm that the
bridge exists. 'newKernelQuery' will cause the bridge to open a new query with
the kernel, forwarding all updates and responses.

Because multiple scripts on the same page may be trying to communicate with the
bridge, and those scripts have no way to avoid nonce reuse, we namespace the
messages. libkernel uses the namespace 'libkernel', other scripts that
communicate with the bridge should take care to use namespaces that are not
going to collide.

#### test

The 'test' method can be used to check that the bridge exists. The bridge
usually responds within 10 milliseconds. If there is no response after three
seconds, it is safe to assume that the bridge does not exist, which usually
means that the user has not installed the skynet browser extension.

The query message should have the form:

```ts
window.postMessage({
	namespace: <string>,
	nonce: <number>,
	method: "test",
})
```

The response from the bridge will have the form:

```ts
window.postMessage({
	namespace: originalQuery.namespace,
	nonce: originalQuery.nonce,
	method: "response",
	err: null,
	data: {
		version: <string>,
	},
})
```

There are no QueryUpdates or ResponseUpdates for this method.

#### newKernelQuery

newKernelQuery is a method used by a web page to request a query be created
with the kernel. The payload for the message is called the 'data'. The bridge
will assign a nonce to the data, and then send the data to the kernel to open a
new query.

Note that the message does not go directly from the bridge to the kernel, it
makes a stop at the background page along the way. This stop is also nearly
transparent, though the nonce which was added by the bridge will be swapped out
for a background-specific nonce.

The initial query should have the form:

```ts
window.postMessage({data
	namespace: <string>,
	nonce: <number>,
	method: "newKernelQuery",
	data: <any>,
})
```

Any queryUpdate messages should have the form:

```ts
	namespace: originalQuery.namespace,
	nonce: originalQuery.nonce,
	method: "queryUpdate",
	data: <any>,
```

Any responseUpdate messages will have the form:

```ts
	namespae: originalQuery.namespace,
	nonce: originalQuery.nonce,
	method: "responseUpdate",
	err: null,
	data: <any>,
```

The final response will have the form:

```ts
window.postMessage({
	namespace: originalQuery.namespace,
	nonce: originalQuery.nonce,
	method: "response",
	err: null,
	data: <any>,
})
```

### Bridge -> Background Page

The bridge communicates with the background page using browser.runtime.connect.
This creates a single port that will be used for all communications between the
bridge and the background.

The only query method allowed is newKernelQuery. queryUpdate, responseUpdate,
and response are also all supported. When a message is passed from the bridge
to the background, the background will swap out the nonce and otherwise send
the message directly to the kernel. When the kernel responds, the background
will swap out the nonce again to restore the original nonce used by the bridge.
The response is otherwise passed along untouched.

### All -> Kernel

Most callers will be communicating with the kernel through the bridge, however
the kernel can be queried directly as well by opening an iframe to the kernel.
Opening an iframe has a significant intial performance penalty, but
applications that are sending huge numbers of messages to the kernel may
benefit from reduced overheads, as they will not need to pass messages through
the bridge or background page. It should be noted that total savings are less
than 1 millisecond per kernel query, and very few applications will actually
benefit from opening their own kernel iframe.

#### test

test is a method that is supported by both the bootloader and the full kernel.
It can be used by callers to establish that the kernel has loaded and is ready
for communication.

The query message should have the form:

```ts
kernelFrame.contentWindow.postMessage({
	nonce: <number>,
	method: "test",
}, "http://kernel.skynet")
```

The response will have the form:

```ts
event.source.postMessage({
	nonce: originalMessage.nonce,
	method: "response",
	err: null,
	data: {
		version: <string>,
	},
}, event.origin)
```

#### requestGET

requestGET is intended to emulate a GET request sent to a webserver. The input
'url' is the url that the caller would normally be querying. The kernel will
respond the way that the kernel believes a webserver at this URL should
respond. requestGET is one of the most important methods to making the web
trustless - the kernel is able to serve code that the user knows and trusts,
rather than allowing a rogue server to provide compromised code. This is how we
enable the user to log into the kernel without any fear that their seed will be
stolen by a webserver.

This method is supported by the bootloader, but only for the page at
http://kernel.skynet/auth.html

The request should have the form:

```ts
kernelFrame.contentWindow.postMessage({
	nonce: <number>,
	method: "getRequest",
	data: {
		url: <string>,
	},
}, "http://kernel.skynet")
```

The response will have the form:

```ts
interface header {
	name: string;
	value: string;
}
event.source.postMessage({
	nonce: event.data.nonce,
	method: "response",
	err: null,
	data: {
		headers: <header[]>,
		body: <Uint8Array>,
	},
}, event.origin)
```

There are no queryUpdate or responseUpdate messages supported for this method.

#### requestDNS

#### callModule

### Kernel -> Background Page

#### log

#### logErr

#### authStatusChanged

#### skynetKernelLoaded

### Kernel -> Module

TODO

### Module -> Kernel

TODO

## TODO: Bootloader Roadmap (Remove once completed)

+ Need a specification for the file that loads the user's portal preferences.
  This file should be encrypted and padded.

+ We should add a version number for loading the user's kernel. v1 means the
  kernel is not encrypted, v2 means the kernel is encrypted. Higher versions
  can be used to indicate that the browser extension is not safe and needs to
  be updated.

+ Modify the set of default portals. Since the user is creating a seed when
  they first use the kernel, we should be able to support free signup-required
  portals.

+ The registry lookup needs to change the method of signature verification if
  the type is set to '2', we can't blindly assume the portal is malicious just
  because a registry entry is type 2.

+ Try to find some solution (perhaps using content scripts) to allow skynet
  pages to talk to the kernel through the background script rather than needing
  to open an iframe to the kernel themselves. This is a performance boost. At the
  very worst, we could have the kernel be a shim that forwards messages to the
  background script. Though... this may not be good for parallelism. Maybe the
  way forward is to let the app choose between talking to a dedicated kernel
  instance and the background script. Or maybe the dedicated kernel can make the
  call.

+ Remove the downloadV1Skylink function in the extension. Currently it is used
  by several of the modules, so we can't delete it until the modules are
  updated. Need to wait until the trustless endpoint is broadly deployed.

+ Update all of the crypto functions so that they can be overwritten by the
  kernel, and namespace them so they don't get in the way of future cryptos.
  The annoying thing here is that the crypto libraries use 'var' everywhere
  instead of 'let', and I'm not completely sure if there are any performance
  hacks which make use of the general scoping of 'var', so I'm not confident we
  can blindly transition them all to 'let' declarations.

+ There are places where we could potentially switch the typescript types to be
  using fixed size arrays, which would eliminate the need for some of the
  functions to be doing length checking.

+ Split the actual kernel and module files into separate repos. Once that is
  complete, the build process should get simpler. Then hardcode the default
  kernel so that you don't need to transplant it in the build process and in the
  extension.

+ Add UI elements to the extension that allows a user to change the set of
  hardcoded portals which get used to bootstrap the kernel.

+ There are a bunch of places where we are using the 'number' type when we
  probably should be using the BigInt type. Especially in the trustless pieces
  of the download code, like with the merkle tree stuff.

## TODO: Full Kernel Roadmap

+ We need to update the progressiveFetch protocol to parse and display the
  error in the event of a 400 response from the portal. We should probably
  still assume malice in that case but at the very least we want to relay the
  error back to the user in case it's a genuine problem with the applicaiton.

+ We need to update the progressiveFetch API so that in the event of a
  malicious portal (or even a dysfuncitonal one), we can track that portal for
  the given API endpoint. This includes changing the way we handle the catch for
  5XX calls, because the caller needs to know that one of the portals failed...

+ Need to update Homescreen to be able to handle the 'skynetKernelLoadFailed'
  message.

+ The downloadSkylink call needs to be extended so that it can verify large
  file downloads on top of small file downloads. This should probably happen in
  the full kernel, and we should probably avoid any situation where the full
  kernel gets to be more than what can fit in a standard base sector. At roughly
  4 MB in size, we should be able to avoid having the kernel get larger.

+ Create all of the overwrites in the kernel to replace the default functions
  loaded by the extension. We want to make sure that the user gets a consistent
  experience, and we don't trust all browser extensions to use exactly the same
  default functions.

+ Create an API in the kernel for changing the logging settings.

+ Either the progressiveFetch or the download+registry calls need to be updated
  so that they correctly manage 429 responses. Probably do it at the
  download/registry level, as the best behavior might be different depending on
  request type.
