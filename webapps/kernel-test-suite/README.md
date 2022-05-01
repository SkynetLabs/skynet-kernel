# Kernel Test Suite

The kernel test suite is a skapp which uses production versions of libkernel
and a set of modules to perform integration testing on libkernel and key
modules like secure-upload and secure-download.

The long term plan for testing development branches of key modules and the
kernel itself will involve overrides that get set in the kernel. The dev will
override whatever module they are working on in the kernel and then can run the
full production test suite against their development code.
