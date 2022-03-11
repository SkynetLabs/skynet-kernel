# kernel-test-suite

kernel-test-suite is a kernel module that provides a set of functions designed
to facilitate integration testing with the kernel. Some of the methods test
that basic operations succeed, and other methods are intentionally looking for
the kernel to return an error. The kernel-test-suite depends on a few helper
modules, especially for checking that cross-module communication works.

There are a good number of comments throughout the module, someone who is
looking to learn a bit more about module development or about how the kernel
works in general could get a lot of value out of reading the code. It should be
noted that because this is a tester module, there are a lot more checks and a
lot more input validation than is typically necessary in an ordinary module. We
tried to mark the places where this is happening, but it may also be good to
check out a non-testing module as well to see what a standard module looks
like.
