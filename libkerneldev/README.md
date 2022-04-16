## libkerneldev

libkerneldev is a library that contains a bunch of functions which are common
to the development of the Skynet kernel. These are things used by the
extension, by the kernel itself, by the build systems, and even by the modules.

One noticeable quirk of libkernedev is that strings are used instead of Errors
everywhere. This is because errors often need to be passed over postMessage in
the kernel, and the Error type can't be sent over postMessage.
