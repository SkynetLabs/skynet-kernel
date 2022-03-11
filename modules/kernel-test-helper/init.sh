#!/bin/bash

# This is a script to initialize a new module. It will create a dev seed for
# the module (for testing), and a production seed for the module.

# Detect whether skynet-utils is available.
if ! [ -x "$(command -v skynet-utils)" ]; then
	echo "skynet-utils could not be found, please install skynet-utils"
	exit
fi

# Create a seed for the module for development, and a seed for the module for
# production.
mkdir -p build
if ! [ -f build/seed ]; then
	seed=$(skynet-utils generate-seed)
	echo $seed > build/seed
fi
if ! [ -f build/dev-seed ]; then
	seed=$(skynet-utils generate-seed)
	echo $seed > build/dev-seed
fi
