# libkernel

libkernel is a node module for web developers that would like to use the Skynet
kernel in their applications, or would like to build modules for the Skynet
kernel. It contains a bunch of helper functions and syntax sugar for
interacting with the kernel itself, and it also contains a bunch of functions
for dealing with Skynet objects such as skylinks.

libkernel for the time being should be considered highly unstable - there is
ongoing discussion about whether the scope of libkernel is too broad and
whether some of the Skynet related functions should be split out into their own
libraries. Methods you depend on today may be gone or have altered APIs
tomorrow, we hope to have libkernel in a stable place within the next 2-3
weeks.

A particular quirk of libkernel is that errors are always of the type `string | null` rather than being of type `Error`. This is because libkernel is
frequently used in webworkers and other settings where errors need to be
serialized and send over postMessage, and the `Error` type is generally not
suitable for this. We therefore use strings everywhere as errors, to ensure
that libkernel can be used in all relevant places.

## Roadmap

libkernel needs to expose a method to directly send messages to the kernel,
without adding any formatting or wrapping. This is necessary in particular for
the test suite so that the test suite can attempt to send malformed messages
and ensure that the kernel is performing all of the safety checks on bad
messages and continues to function after receiving malformed messages.
