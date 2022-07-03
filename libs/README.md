# Skynet Kernel Libs

This folder contains libraries that are useful for working with and developing
the Skynet kernel.

#### libkernel

libkernel is a library that is intended to be used by skapps to interact with
the skynet kernel. It is a minimal library with not too many functions, but
provides all core functionality for basic Skynet interactions.

#### libkmodule

libkmodule is a library that is intended to be used by kernel modules. It is a
minimal library that provides all core functionality for basic Skynet and
kernel interactions, and for all basic module behaviors.

#### libskynet

libskynet is a library for people working with the actual Skynet protocol. Most
developers will not need to use libskynet, but it is used heavily thorughout
the kernel itself, and in the core skynet modules.

NOTE: There is discussion around breaking libskynet into libskynet and
libskynetapi, with the libskynetapi functions being all of the functions that
perform actual network calls. It is not certain yet whether this is a desirable
spit. If the api calls are pulled out into their own library, libskynet becomes
fully isomorphic.

#### libskynetnode

libskynetnode is a library that implements skynet API calls using nodejs
libraries. There is no isomorphic support for the 'fetch' call, and we elected
to break the node functions out into their own library rather than use
polyfills. Most of the functionality of libskynetnode comes from libskynet, as
most functions in libskynet are isomorphic.

## Code Conventions

All libraries should be written in typescript.

Consts should always be all caps with underscores: `EXAMPLE_CONST`

Functions should not throw under any circumstances. All potential throws should
be caught inside of the function, and an error should be returned instead.
