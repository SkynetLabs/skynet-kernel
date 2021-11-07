# skynet-kernel

skynet-kernel is a next generation platform for blockchain and dapp
development. In the blockchain world today, users are forced to choose between
convenience and security, because there is no convenient way to get trustless
access to the blockchain space.

skynet-kernel is a framework for building trustless applications entirely
within the web browser. The kernel can support basic applications like a
password manager or a notes app, and the kernel can support more complex
applications like multiplayer videogames or even full blockchains.

The pinnacle of convenience today is the cloud. All of your data in one place,
accessible from any device. People like using services like Coinbase and Infura
because they are convenient. You get to access the blockchain, and you don't
have to do anything beyond logging in.

The kernel emulates this convenience by trustlessly storing all of a user's
data and applications in the cloud. This 'data' can include a full blockchain
state, along with some background scripts that will passively download and
verify blocks in the background while the user browses the web. The resulting
experience should be nearly identical to using Coinbase, except instead of
using a trusted intermediary, users are getting access to a full blockchain.
And similar to coinbase, this full blockchain and all of its state will follow
users from device to device.

## Building a Trustless Browser Experience

The web is fundamentally a trusted experience. The main idea of the web is that
a user contacts a webserver, and then that webserver provides application code
that the user can run in their browser. Because the application code is being
provided by the server, the user is forced into trusted whatever code is being
provided.

We can get in the middle of this using a browser extension. Browser extensions
give us the ability to intercept webpages before they are served and verify the
code that is being provided. We use this technique to bootstrap the kernel.

The two most important pages to the Skynet kernel are home.siasky.net and
kernel.siasky.net. home.siasky.net is the main UI, where the user will be
logging in and managing the kernel. kernel.siasky.net is the webpage that
developers will import (using iframes) to interact with the trustless web.

The entire purpose of the extension is to ensure that the code being served by
home.siasky.net and kernel.siasky.net matches the code promised by the
developers, protecting the user from attackers and malicious actions by the
developers.

Both home and kernel are shell bootstrap applications. Rather than being full
applications themselves, they are small scripts that are able to securely
access the user's Skynet account and then load the full homepage and kernel
from the user's decentralized storage. Because home and kernel are both
bootstrapped, the user has the full ability to change their experience and
install upgrades or alternatives, even without having to modify or switch out
the browser extension.

The long term goal of the kernel project is to have the kernel natively
supported by all web browsers. The bootstrap code itself is only a few hundred
lines, and should never need to be maintained or updated. It is very simple for
a browser to add support for their users, and users will get the same
experience on every supported web browser regardless of how old the bootloader
code is.

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

### Hacking on the Kernel

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
