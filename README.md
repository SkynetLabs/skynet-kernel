# skynet-node-extension

skynet-node is a browser extension for Firefox (soon cross-browser compatibile)
which ensures the user is getting the correct set of code from siasky.net. In
the typical case, the javascript loaded by the browser extension is exactly
identical to the javascript that gets loaded from siasky.net. In the event that
siasky.net goes rogue and begins serving malicious pages, the browser extension
will protect the user, guaranteeing that the user only receives the original
pages.

To eliminate the need for siasky.net to be online at all, the entire javascript
for skynet-node is contained within the browser extension. An alternative,
though less desirable, implementation of this extension would not contain any
code, but rather just a hash. There would be no content scripts at all, and
instead the background script would ensure that the pages being served by
siasky.net match a specific hash. This is less desirable because it means that
in the event that siasky.net goes rogue, the user cannot use Skynet at all,
whereas in the current implementation the user is able to trustlessly use
Skynet even if siasky.net is serving malicious pages.

The extension can be installed using the standard firefox temporary extension
installation process. This involves going to about:debugging. Just google it,
you'll figure it out. The folder with the extension code is
'skynet-node-extension'.

## skynet-node design

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
