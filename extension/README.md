# Skynet Extension

This folder contains the source code for the full Skynet extension. The main
purpose of the extension is to give users a fully trustless skynet experience.
All assets that are loaded from Skynet get fully verfied before being loaded.
This includes skapps, and includes the kernel itself.

To the best of our knowledge, the full Skynet kernel is the only way to have a
fully trustless browsing experience when using Skynet.

NOTE: 'prefer-const' is off in eslint because we use 'eval' and we need some of
the variables to be overwritten by the eval'd code. This means that the linter
incorrectly believes that the variables are never modified.
