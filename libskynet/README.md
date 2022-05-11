# libskynet

libskynet is a node module targeted at low level skynet developers. libskynet
provides helper methods that make it easier to manipulate base skynet
primitives like skylinks and to work with things like download and registry
proofs that are sent by the portal.

Most developers building applications on Skynet should use libkernel instead of
libskynet.

One quirk of libskynet is that errors always use the type `string | null`
rather than being type `Error`. This is because the errors often need to be
sent over postmessage, and the `Error` type cannot be sent over postmessage.

libskynet is still unstable. We are trying to minimize the total number of
breaking changes and expect to be able to offer strong compatibility changes
soon.
