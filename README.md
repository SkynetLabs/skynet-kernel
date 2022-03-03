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

The build process is being updated. It only works on Linux at the moment. Right
now you need to acquire the 'skynet-utils' binary from the 'env-var' branch of
the 'go-skynet' github repo.  You can get it by running 'go build ./...' and
then adding the binary to your PATH. Then you run 'make'. The test suite is a
webapp in 'webapps/kernel-test-suite'. It's a simple gatsby app that you can
deploy with 'gatsby deploy', and build with 'gatsby build'.

Once the extension is built you will see a 'build' folder and a 'build-cache'
folder. The full extension is in 'build/extension/'. You can load the extension
into firefox by going to 'about:debugging' -> 'This Firefox' and clicking on
'Load Temporary Add-on'. Select the manifest.json file from the
'build/extension' folder.

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

###### TODO

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

## Building a Trustless Browser Experience

Due to fundamental limitations of the web, a browser extension is required to
get the full trustless experience of the kernel. The platform has been built so
that users without a browser extension still get the full expernience, however
they are trusting siasky.net to bootstrap them honestly. With a browser
extension, the trust involved with the bootstrapping process can be eliminated.

The two key domains for the kernel are home.siasky.net and kernel.siasky.net.
Home is a user-facing application with a UI that interacts with the kernel.
kernel.siasky.net is a background application that exposes APIs to web
developers. Developers can import the kernel using an iframe, and then leverage
the API to build fully trustless applications.

### Using Bootstrapping for Consistency and Growth

The browser extension itself contains an absolute minimal amount of code. The
only purpose of the browser extension is to fetch the seed from the user, and
then use the seed to download the user's full home and kernel applications.
This accomplishes several things.

The first thing is that it gives the user a consistent experience across
devices and browsers. Changes that the user makes to their home or kernel will
be visible across all of their devices immediately, even if different devices
and browsers are using slightly different versions or implementations of the
bootstrap code.

The most important thing is that it gives the user a high degree of control.
The kernel is not something that SkynetLabs distibutes and forces onto users;
users can download and run any version of the kernel that they want, including
versions made by third parties.

Having a simple bootstrap based extension also reduces the barriers for
adoption. The bootstrap code has been designed to be both minimal and final.
Once the bootstrap code has been released, it should not ever need to change in
the future. This means that the maintenance overhead for browsers and teams
that add native support for the kernel is very small. And the tiny, unobtrusive
nature of the extension also means that the effort required to integrate it in
the first place is minimal.

## Hacking on the Kernel

As much as possible, we've tried to make kernel development accessible to
everyone. Our vision is that the kernel will one day have many different teams
implementing different 'distros', much like the Linux kernel has many people
working on it and publishing different flavors of the operating system.

### Dependencies

You will need the `skynet-utils` binary to build the kernel. The code for the
binary can be found at https://github.com/SkynetLabs/go-skynet. At the moment
this binary is not distributed, you will need to clone the repo and run `go
install ./...` to get the binary. The binary will then appear in your GOPATH.

### Building the Kernel

Once you have all the dependencies, just run 'make'. This will create a build
folder with all of the finished files. 'make' will also upload all of the
relevant files to Skynet.

After running 'make', you will need to load the browser extension found in
build/skynet-kernel-extension into your browser. Currently, only Firefox is
supported. If you are unfamiliar with extension development, use Google to
figure out how to load a temporary extension into your web browser. Make sure
you use the extension in the build folder, not the one in the source code
folder.

The output of 'make' will contain an 'xdg-open' command which will open the
test suite in your browser and verify that the kernel is working correctly.
Make sure you have updated the extension before you run the test suite.

When uploading files to Skynet, the build script will use a Skynet portal. The
default portal is siasky.net, but if the environment variable SKYNET\_PORTAL is
set, the build script will use that portal instead.

At the moment, the only portal that works for kernel development is
dev3.siasky.dev - there are required features that have not been deployed
anywhere else. This should be resolved by December 2021.

### Local File References

Code in the kernel often references other code by skylink. To make life easier,
the build process will replace relative filepaths listed in the kernel with the
correct skylink after uploading the file to Skynet.

You can reference another file using 'branch-file:::$relativePath'. You can see
an example of this happening in
'skynet-kernel-skyfiles/modules/call-other-module.js'.

### The 'useful-code' Folder

The useful-code folder contains some examples of code that may be useful in the
future but hasn't been integrated into the kernel yet, for various reasons.

## Notable Features of the Kernel

The kernel has been designed such that every action is trustless and controlled
by the user. While the kernel itself is bootstrapped through siasky.net, all
future requests will be made using the user's preferred portals. The bootstrap
process is itself fully trustless and optimized to make the minimal possible
use of siasky.net before switching over to using the user's preferred portal
for all requests.

All requests such as downloading files, uploading files, and interacting with
the registry are verified cryptogrpahically. If the user's portal attempts to
lie or present corrupted data, the request will be interrupted.

TODO: Document the logging framework

TODO: Document the modules
