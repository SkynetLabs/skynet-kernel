# skynet-kernel

skynet-kernel is a next generation platform for blockchain and dapp
development. In the blockchain world today, users are forced to choose between
convenience and security, because there is no convenient way to get trustless
access to the blockchain space.

skynet-kernel is a framework for building fully trustless applications in the
cloud, accessible by a web browser. With skynet-kernel, developers can build
applications that have all of the convenience of Coinbase and all of the
trustlessness of running a local full node. Because all of the state is stored
in the cloud, the user's experience can follow them from device-to-device.

The kernel today is being used to build decentralized file sharing platforms
(like alternatives to WeTransfer), decentralized streaming platforms (like
alternatives to Twitch), in-browser blockchains (like alternatives to Bitcoin),
and even alternatives to infrasturcture like Github.

## TODO: ROADMAP (remove this section once completed)

+ The downloadSkylink call needs to be updated so that it is checking the
  Merkle proofs provided by the portal. This will include changing which
  endpoint it calls so that the proofs exist at all.

+ There is no spec for what the Skynet file should look like to instruct the
  kernel of the user's portal prefernces, we need to build one. Might make
  sense to wait to do this until we have support for setting the user's preferred
  portals in the kernel proper. The design I'm leaning towards is to just use a
  generic json object, so that the full kernel can insert more fields and
  basically entirely ignore the bootstrap ones.

+ Need to update Homescreen to be able to handle the 'skynetKernelLoadFailed'
  message.

+ We need to update the progressiveFetch protocol to parse and display the
  error in the event of a 400 response from the portal. We should probably
  still assume malice in that case but at the very least we want to relay the
  error back to the user in case it's a genuine problem with the applicaiton.

+ We need to update the progressiveFetch API so that in the event of a
  malicious portal (or even a dysfuncitonal one), we can track that portal for
  the given API endpoint. This includes changing the way we handle the catch for
  5XX calls, because the caller needs to know that one of the portals failed...

+ The downloadSkylink call needs to be extended so that it can verify large
  file downloads on top of small file downloads.

+ The registry reads and writes should be updated so that they use encryption.
  This has complications when you are using a resolver link to load the kernel,
  probably the user will not switch to an encrypted kernel until they pick their
  own, but we should still have the extension capable of detecting and decrypting
  an encrypted kernel.

+ In the extension, check localStorage for the user's kernel to avoid having to
  download it.

+ Create all of the overwrites in the kernel to replace the default functions
  loaded by the extension. We want to make sure that the user gets a consistent
  experience, and we don't trust all browser extensions to use exactly the same
  default functions.

+ Create an API in the kernel for changing the logging settings.

+ Remove the downloadV1Skylink function in the extension. Currently it is used
  by several of the modules, so we can't delete it until the modules are
  updated.

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

+ The registry lookup needs to change the method of signature verification if
  the type is set to '2', we can't blindly assume the portal is malicious just
  because a registry entry is type 2.

+ The Skynet protocol should be extended so that 404 responses on registry
  lookups and downloads are accompanied by host signatures that confirm they
  don't have the file, so that a portal cannot easily just lie about it.

+ The Skynet protocol should be extended so that after doing a write or an
  upload, some signatures are sent by hosts confirming that they received the
  data, put the data into a contract, and are now hosting the data. We may not be
  able to get very far with this, as a portal could always upload a file and then
  delete it immediately after.

+ Either the progressiveFetch or the download+registry calls need to be updated
  so that they correctly manage 429 responses. Probably do it at the
  download/registry level, as the best behavior might be different depending on
  request type.

+ Explore possibilities of using shared workers to operate the kernel, we may
  be able to reduce the overall loadof using Skynet that way, ensure only one
  kernel is running per browser, instead of spinning up a whole kernel per tab.

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


## Browser Extension Design

The browser extension code can be found in 'skynet-kernel-extension'. The most
important file is 'background.js', which will swallow all pages from
'home.siasky.net' and 'kernel.siasky.net' so that they can be replaced with
custom code that the user can trust.

TODO: Fill this out as the remaining components for the browser are completed.

-----
-----
-----
-----

(old readme starts here)

## Kernel Design

The skynet-node itself is broken into 5 major pieces:

+ skynet-node bootloader
+ skynet-node authentication page
+ skynet-node kernel
+ skynet-node homescreen
+ skynet-node modules

### skynet-node bootloader

The bootloader is contained in skynet-node-extension/content-node.js. It
contains code that is intended to be loaded in an invisible iframe. The
bootloader will check if the user is logged in. If the user is indeed logged
in, the bootloader will look for the skynet-node kernel and modules in their
skynet storage and load both of them from Skynet.

If the user is not logged in, the bootloader will send some messages to the
parent window indicating that authentication failed, and that the parent window
needs to trigger user authentication.

The core idea of the bootloader is to give the user as much flexibility as
possible over controlling their own kernel. The bootloader necessarily must be
contained entirely within any extension or web browser that the user is using
to access Skynet. It is not always easy to upgrade software at this layer, and
if the user has many different devices, each device may end up containing a
different version or flavor of the bootloader.

By putting as much functionality as possible in the kernel, which gets loaded
from the bootloader at runtime, we can give the user as much flexibility as
possible to change their skynet-node from a webapp. There is a substantial
added bonus that changes made to the kernel on one device will immediately be
avaialble on all other devices - the user's experience at the kernel level will
always be consistent across devices.

### skynet-node authentication page

The authentication page is technically part of the bootloader. The user cannot
load their skynet-node kernel until they are logged in, because if they are not
logged in the web browser has no way to figure out which version of the kernel
it is supposed to load.

The authentication page handles collecting the seed from the user, so that the
user can get logged in. The authentication page is also able to create seeds
for the user if the user has never used Skynet before.

### skynet-node kernel

The kernel is where the main power of the skynet-node happens. The kernel is a
relatively simple architecture that maps API requests to kernel modules that
are able to handle the API requests. The user has the ability to choose any set
of code that they want to handle each API request, putting the user in full
control of what happens on their skynet-node.

Each module runs in its own webworker, which provides sandboxing. Modules can
make API calls back to the kernel, which allows modules to communicate with
each other and use each others APIs.

This part is still WIP.

### skynet-node homescreen

The homescreen is a special app which is allowed to live at
https://home.siasky.net/ and loads a list of all the user's trustlessly
installed applications. The default page for home.siasky.net is itself a
bootloader that will grab the true homepage from node.siasky.net. If the user
is not logged in, the homescreen bootloader will open the authentication page
and ensure the user gets logged in.

### skynet-node modules

The skynet-node modules are a series of modules, each able to serve a specific
set of API endpoints in a specific data domain. Modules can be short lived (for
example, performing a file download, or looking up the user's profile picture),
or modules can be long running (for example, verifying a blockchain in the
background).

Long running moduels have the advantage of giving the user a consistent state
across all of their devices. If any webpage is open on any of their devices
that has node.siasky.net running in an iframe, the user's background threads
will be active, keeping the user's system up-to-date.

This part is still WIP.

## skynet-node-skyfiles

The skyfiles folder contains the default files for the pages that get loaded
from homescreen. Right now, those pages are the html and javascript for the
homescreen application, and some javascript for the default skynet-node kernel.
