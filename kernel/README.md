# Skynet Kernel Core

This repo is the skynet kernel core. More info soon.

Need to document somewhere (why not here) that the kernel+bootloader pairing
currently depend on the idea that the kernel is minified and the bootloader is
not. Otherwise the libraries that the kernel uses can conflict with the
libraries that the bootloader uses and the eval can fail.
