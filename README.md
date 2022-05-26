# skynet-kernel (EXPERIMENTAL, FIREFOX ONLY)

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

## Known Issues

The build process only works on Linux and is highly non-standard. If you are
getting started on a new machine, you will also need to swap out the v2
skylinks of every kernel module that gets imported by the test suite, by
libkernel, and by other modules. This is high priority to fix.

There are a bunch of other places in the code where things are done in strange
or inefficient ways. The kernel is very much in a state of 'it started working
so we stopped touching it for now', we will be going thorugh the kernel over
the next few weeks and cleaning up a lot of the jank and inefficiency. Some of
the jank is actually doing a good job of exposing bugs, so we won't be cleaning
that up until all the bugs are fixed first. The jank is medium priority to
clean up.

We have done our best to polish and finish all pieces of the code that might
impact compatibility in the future. Things like the kernel messaging protocol
are well refined at this point and should not be changing. Developers using the
kernel API or building kernel modules should be prepared for minor breaking
changes, but the kernel is already in a place where there's a reasonable chance
that we will never need to make any breaking changes.

This browser extension does not work in Chrome. This is medium-high priority to
fix.

## Repository Structure

The 'extension' folder contains the source code for the browser extension. It's
a typescript project which uses a manual bundler (build.sh at the top level) to
compile into the final browser extension. The code in this folder is
responsible for creating a trustless execution zone for the user.

The 'http-server' folder contains an http-server which serves basic http
responses to all requests to localhost:25252. This is a completely optional
utility which improves performance and privacy. See the README in this folder
for more details.

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

See [here](libs/libkmodule/README.md) for information on developing kernel
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
+ Kernel -> Parent
+ Kernel -> Module

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
	nonce: <string>,
	method: "test",
})
```

The response from the bridge will have the form:

```ts
window.postMessage({
	nonce: originalQuery.nonce,
	method: "response",
	err: <string | null>,
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
	nonce: <string>,
	method: "newKernelQuery",
	data: <any>,
})
```

Any queryUpdate messages should have the form:

```ts
	nonce: originalQuery.nonce,
	method: "queryUpdate",
	data: <any>,
```

Any responseUpdate messages will have the form:

```ts
	nonce: originalQuery.nonce,
	method: "responseUpdate",
	data: <any>,
```

The final response will have the form:

```ts
window.postMessage({
	nonce: originalQuery.nonce,
	method: "response",
	err: <string | null>,
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
	nonce: <string>,
	method: "test",
}, "http://kernel.skynet")
```

The response will have the form:

```ts
event.source.postMessage({
	nonce: originalMessage.nonce,
	method: "response",
	err: <string | null>,
	data: {
		version: <string>,
	},
}, event.origin)
```

There is no support for queryUpdate or responseUpdate messages for this method.

#### proxyInfo

proxyInfo is a request usually made by the background script to the kernel
requesting whether a particular url is supposed to be proxied. This endpoint is
available to all callers, as they could learn the results of the endpoint
anyway by making a normal 'fetch' request to a URL that they suspect is being
proxied.

The main purpose of proxyInfo is to enable the kernel to support arbitrary
TLDs. Examples of TLDs that can be supported by proxyInfo are '.skynet',
'.hns', '.web3', and '.eth'.

The bootloader supports the method, but always indicates that a page should not
be proxied. The background page already has a special, permanent carve-out for
'.skynet' domains, because that is where the kernel gets loaded.

The query message should have the form:

```ts
kernelFrame.contentWindow.postMessage({
	nonce: <string>,
	method: "proxyInfo",
	data: {
		url: <string>,
	},
}, "http://kernel.skynet")
```

The response will have the form:

```ts
event.source.postMessage({
	nonce: originalRequest.nonce,
	method: "response",
	err: <string | null>,
	data: {
		// If proxy is 'false', the other types will be excluded.
		proxy: <boolean>,
		proxyValue: <any>,
	},
}, event.origin)
```

There is no support for queryUpdate or responseUpdate messages for this method.

#### requestOverride

requestOverride is used by the background script to vet all requests
intercepted by onBeforeRequest and determine whether the data should be
replaced by other data. This endpoint is available to all callers, as they
could figure out what the replacement data is anyway by making a fetch request.

requestOverride is one of the most important methods of the kernel, as it
allows the user to load webpages in a fully trustless way. The kernel can
replace a standard query to a URL like 'homescreen.web3' and inject the user's
preferred homescreen code, providing a guarantee that no web server can replace
a user's application with malicious code. This makes crypto applications
significantly safer and more decentralized.

This method is supported by the bootloader, but only for the page at
http://kernel.skynet/auth.html

The request should have the form:

```ts
kernelFrame.contentWindow.postMessage({
	nonce: <string>,
	method: "getRequest",
	data: {
		url: <string>,
		method: <string>,
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
	err: <string | null>,
	data: {
		headers: <header[]>,
		body: <Uint8Array>,
	},
}, event.origin)
```

There is no support for queryUpdate or responseUpdate messages for this method.

#### callModule

callModule is the main programmable element of the kernel. A module is a new
element that exists entirely inside of a webworker, where it is sandboxed away
from other webworkers. This means that the module can have its own private
state, and with some help from the kernel it also can get its own private
storage. Modules can be used to build systems like private folders for the
user, private messaging systems for the user, profile information for the user
that can be read by anyone but only updated by certain domains, or really any
repository of shared data.

callModule itself is how external users ask the kernel to create a module
query. The inputs of a callModule call are the module that is being called, the
method that is being called on the module, and any input that should be
provided to the module. The module that is being called is typically a resolver
skylink which tells the kernel how to download the code for the module. The
kernel will then run that code in a webworker and pass the input to the module.

callModule is not available in the bootloader, the user must be logged in for a
callModule request to succeed.

The message contains a 'domain' field which states which domain the calling
application is in. If the message is being sent by a web page, the kernel will
ignore this field and instead use the actual domain of the sender.  If the
message is being sent by a browser extension, the domain is trusted to be
accurate. This does create a vulnerability where a user may install a rogue
browser extension that could then impersonate any domain and gain unfair access
to the user's data and modules. We don't have a good solution to this problem
at this time.

The message will have the form:

```ts
kernelFrame.contentWindow.postMessage({
	nonce: <string>,
	domain: <string>,
	method: "moduleCall",
	data: {
		module: <string>,
		method: <string>,
		data: <any>,
	},
}, "http://kernel.skynet")
```

Any queryUpdate messages should have the form:

```ts
	nonce: originalQuery.nonce,
	method: "queryUpdate",
	data: <any>,
```

Any responseUpdate messages will have the form:

```ts
	nonce: originalQuery.nonce,
	method: "responseUpdate",
	data: <any>,
```

The final response will have the form:

```ts
window.postMessage({
	nonce: originalQuery.nonce,
	method: "response",
	err: <string | null>,
	data: <any>,
})
```

### Kernel -> Parent

The kernel generally exists in an iframe, typically inside of the background
page of a browser extension. The kernel has a few messages that it will send to
its parent to ensure that everything is working smoothly.

#### log

For whatever reason, calls to 'console.log' from the kernel are not visible
when the kernel exists in the iframe of a background page of a web extension.
To overcome this problem, the kernel can send a method that requests a log
message be sent. If 'isErr' is set to 'true', the kernel is requesting a
console.error instead of a console.log.

The message will have the form:

```ts
window.parent.postMessage({
	method: "log",
	data: {
		isErr: <boolean>,
		message: <string>,
	},
}, window.parent.origin)
```

This message is not a query, and therefore there are no response messages.
There are also no queryUpdate or responseUpdate messages.

#### kernelAuthStatusChanged

kernelAuthStatusChanged is a message that will be sent by the kernel to the
parent if the user's auth status has changed. This typically means that the
user has logged in, though it can also mean that the user has logged out, or
that the user has switched to another account.

Regardless of the source cause, the expectation from the kernel is that the
iframe containing the kernel will be refreshed. Because there is state that
needs to be kept consistent between the caller and the kernel (such as any open
queries, and such as the loading status of the kernel), the kernel does not
automatically refresh itself.

The message will have the form:

```ts
window.parent.postMessage({
	method: "kernelAuthStatusChanged",
}, window.parent.origin)
```

This message is not a query, and therefore there are no response messages.
There are also no queryUpdate or responseUpdate messages.

#### kernelReady

kernelReady is a message that gets sent by the kernel when the kernel is ready
to receive messages. This message is sent before the kernel has fully finished
loading, but the kernel will properly wait to process the messages until it has
loaded all the way.

The message will have the form:

```ts
window.parent.postMessage({
	method: "kernelReady",
}, window.parent.origin)
```

This message is not a query, and therefore there are no response messages.
There are also no queryUpdate or responseUpdate messages.

#### kernelAuthStatus

kernelAuthStatus is a message that the kernel will send once the kernel knows
whether or not the user is logged in. If the user is not logged in, it will
know almost immediately. If the user is logged in, it will wait to send this
message until it knows whether the user's kernel could be loaded and eval'd. If
the user's kernel could not be loaded, it will include an err.

The message will have the form:

```ts
window.parent.postMessage({
	method: "kernelAuthStatus",
	data: {
		userAuthorized: <boolean>,
		err: <string | null>,
	},
}, window.parent.origin)
```

### Kernel -> Module

There is one predefined method that the kernel will send to a module, which is
the 'presentSeed' method. Other other methods are variants of the 'callModule'
method, which have a standardized set of inputs but the actual method name and
data will depend on the specification of the module itself. The kernel of
course does not know what this specification is, so the method name and data
are fully untrusted inputs.

#### presentSeed

presentSeed gets called immediately after a worker is created, it contains a
seed that module can use. That seed is unique to the module, and is derived
from the user's login seed. It will be the same on all of the user's devices,
and different from the unique seed that gets presented to other modules.

The derivation uses the domain of the module (which is a Skylink, can be either
a resolver link or a content link) and the user's seed.

```ts
	let path = "moduleSeedDerivation"+moduleResolverSkylink
	let u8Path = new TextEncoder().encode(path)
	let moduleSeedPreimage = new Uint8Array(u8Path.length+16)
	let moduleSeed = blake2b(moduleSeedPreimage).slice(0, 16)
```

The message will have the form:

```ts
worker.postMessage({
	method: "presentSeed",
	data: {
		seed: <Uint8Array>,
	},
})
```

This message is not a query, and therefore does not support queryUpdate,
responseUpdate, or response messages.

#### callModule

Unlike the other methods in this documentation, 'callModule' is not actually a
real method but a class of methods. The method that gets passed into the module
is whatever method the original caller is hoping to run on the module, instead
of being "callModule". The nonce is a nonce that's specific to the connection
between the kernel and the module.

The message will have the form:

```ts
worker.postMessage({
	nonce: <number>,
	method: <string>,
	data: <any>,
})
```

Any queryUpdate messages will have the form:

```ts
worker.postMessage({
	nonce: originalQuery.nonce,
	method: "queryUpdate",
	data: <any>,
})
```

Any responseUpdate should have the form:

```ts
postMessage({
	nonce: originalQuery.nonce,
	method: "responseUpdate",
	data: <any>,
})
```

Any response should have the form:

```ts
postMessage({
	nonce: originalQuery.nonce,
	method: "response",
	err: <string | null>,
	data: <any>,
})
```

Once a response is sent, the query is closed and all future messages for that
nonce will be ignored or met with an error.

## TODO: Bootloader Roadmap (Remove once completed)

+ Need a specification for the file that loads the user's portal preferences.
  This file should be encrypted and padded.

+ Need some easy way for an application to tell if the user is logged in

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

+ Update all of the crypto functions so that they can be overwritten by the
  kernel, and namespace them so they don't get in the way of future cryptos.
  The annoying thing here is that the crypto libraries use 'var' everywhere
  instead of 'let', and I'm not completely sure if there are any performance
  hacks which make use of the general scoping of 'var', so I'm not confident we
  can blindly transition them all to 'let' declarations.

+ There are places where we could potentially switch the typescript types to be
  using fixed size arrays, which would eliminate the need for some of the
  functions to be doing length checking.

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

+ The downloadSkylink call needs to be extended so that it can verify large
  file downloads on top of small file downloads. This should probably happen in
  the full kernel, and we should probably avoid any situation where the full
  kernel gets to be more than what can fit in a standard base sector. At roughly
  4 MB in size, we should be able to avoid having the kernel get larger.

+ Create all of the overwrites in the kernel to replace the default functions
  loaded by the extension. We want to make sure that the user gets a consistent
  experience, and we don't trust all browser extensions to use exactly the same
  default functions.

+ Adjust the log function so that it's not using localStorage

+ Create an API in the kernel for changing the logging settings.

+ Either the progressiveFetch or the download+registry calls need to be updated
  so that they correctly manage 429 responses. Probably do it at the
  download/registry level, as the best behavior might be different depending on
  request type.

+ update the 'skynetKernelLoaded' message to include the user's pubkey if they
  have successfully logged in.
