## libskynetnode

libskynetnode is a node module that offers nodejs compatibility with libskynet.
The vast majority of libskynet functions are isomorphic, but a few of them are
not isomorphic.

Specifically, any function that requires 'fetch' is not isomorphic (so
progressiveFetch and all helpers that use progressiveFetch), and the random
number generation is also not isomorphic.
