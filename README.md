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

The kernel intercepts all network requests going to the domain 'skt.us', a
domain owned by the Skynet Labs team. Users that don't have the Skynet
extension will see a 404 page that explains what Skynet is and how to get the
extension. Users that do have the extension will be able to trustlessly load
any application which is hosted on Skynet.

###### NOTE: skt.us has not been fully set up yet, in the meantime the kernel is actually using siasky.net as the primary domain. This is expected to change in the next few weeks.

The kernel supports static web pages, decentralized storage endpoints
(including uploads, downloads, and SkyDB), and also supports long running
background applications will run so long as the user has their web browser
open. A simple example of a useful background application is a chat service
which listens for messages from other users. A more advanced example would be a
crypto trading bot.

## Repository Structure

This repository is still early and is being continuously refactored. I have
done my best to keep the README up-to-date, but use some common sense.

The 'extension' folder contains the source code for the browser extension. It's
a typescript project which uses a manual bundler (build.sh at the top level) to
compile into the final browser extension.

'libkernel' contains a node library that can help skapps interact with the
kernel. The main goal of libkernel is to greatly simplify the process of
communicating effectively with the kernel.

The 'webapps' directory contains webapps that are a key part of the development
process.

'modules' contains a few kernel modules that are partially implemented. In
general, the code there is clean enough that it could be used as a reference
for making your own modules.

'sknyet-kernel-extension' contains the code for the browser extension that is
necessary to make the kernel trustless.

'skynet-kernel-skyfiles' contains the full kernel.

'useful-code/auth-pages' contains some very jank and very basic HTML files that
are used for login and authentication.

## The Build Process

You need to build the utility in the 'go-skynet' repo from the 'david/env-var'
branch. You also need to be running linux (support for Mac is coming). You will
also need typescript. Once you have all those things, just run 'make'.

In useful-code/gatsby-testapp/index.js you'll find some Gastby/React code that
is capable of testing the project. The whole build and test process is
currently pretty jank, it might be easier to wait a week or two.

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
