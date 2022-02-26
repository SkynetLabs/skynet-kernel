#!/bin/bash

# This is a script to build and deploy a module to skynet.

# Determine whether we are using the dev seed or the prod seed.
if [ "$1" == "dev" ]; then
	seed=$(cat build/dev-seed)
elif [ "$1" == "prod" ]; then
	seed=$(cat build/seed)
else 
	echo "need to specify either 'dev' or 'prod' as the build target"
	exit 1
fi

# Generate the v2 skylink. We use 'module' as the keyword because there's only
# one file that's being deployed.
v2skylink=$(skynet-utils generate-v2skylink module $seed)
echo "uploading module to skynet..."
v1skylink=$(skynet-utils upload-file build/index.js) || (echo "upload failed" && exit 1)
echo "updating module resolver link"
skynet-utils upload-to-v2skylink $v1skylink module $seed || (echo "v2skylink update failed" && exit 1)

echo "Module can be accessed at: $v2skylink"
echo $v1skylink
echo $v2skylink > build/module.txt
