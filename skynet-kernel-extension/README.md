# skynet-kernel-extension

The fully compiled skynet-kernel-extension is a single folder that contains an
assortment of files. Some of them are compiled from typescript (the source can
be found in ts-src, and the ouptut can be found in ts-out), and the rest are a
mix of configs, js files, and assets. The non-typescript files can be found in
the 'other' folder.

This odd structure exists to minimize the number of steps required to add a new
file. If you want to add a new non-typescript file to the extension build, put
it in the 'other' folder. If you want to add a new typescript file to the
extension build, put it in the 'ts-src' folder. No other changes (such as
changes to build.sh or to the .gitignore) are necessary.
