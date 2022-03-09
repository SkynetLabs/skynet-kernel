# basic-test-suite

basic-test-suite is a kernel module that provides a set of functions designed
to facilitate integration testing with the kernel. Some of the methods test
that basic operations succeed, and other methods are intentionally looking for
the kernel to return an error. Some of the methods are designed to be called by
other modules during testing.

The basic-test-suite itself does not call out to any other modules, it is a
fully self-contained module with no dependencies.
