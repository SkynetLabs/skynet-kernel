# libkernel

libkernel is a node module for web developers what would like to use Skynet in
their applications. It creates a direct connection to the Skynet kernel and
then provides helper methods for interacting with the kernel.

A quirk of libkernel is that errors are of the type `string | null` rather than
being type `Error`. This is because libkernel is frequently used in webworkers
and other settings where errors need to be sent over postmessage, and the
`Error` type is not suitable for postmessage.

libkernel is still being reviewed, but is expected to be stable. There may be a
small number of breaking changes in the near future, and after that we will be
providing strong compatibility promises around the libkernel API.

## Roadmap

libkernel needs to expose a method to directly send messages to the kernel,
without adding any formatting or wrapping. This is necessary in particular for
the test suite so that the test suite can attempt to send malformed messages
and ensure that the kernel is performing all of the safety checks on bad
messages and continues to function after receiving malformed messages.
