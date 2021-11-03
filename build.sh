#!/bin/bash

# This is a script which builds and deploys the kernel. The general process is
# that we copy every file to a build directory, then we compute a v2skylink for
# each file, then we compile every file by replacing the 'branch-file'
# directives with the correct v2skylinks, finally we upload the compiled files
# to skynet and update the corresponding v2 skylinks.
#
# The result is that the files can be uploaded in any order, and the
# 'branch-file' primitives allows for circular communication.

# TODO: When we eventually switch to production deployments, we'll want to
# integrate in a way that allows us to have primary and secondary registry
# entries.

# Detect that skynet-utils is available.
if ! [ -x "$(command -v skynet-utils)" ]; then
	echo "skynet-utils could not be found, please install skynet-utils"
	exit
fi

# Generate a random seed that we will use to generate the public keys for every
# file.
seed=$(skynet-utils generate-seed)

# Create the build directory and copy the required directories over.
mkdir -p build
cp -r skynet-kernel-extension build/
cp -r skynet-kernel-skyfiles build/

# Create a v2 skylink for each file in each directory, and perform a
# find-and-replace on the rest of the files in the directory to replace
# relative path references with the appropriate v2 skylink.
files=$(find build)
for file in $files
do
	# Skip any directories.
	if [ -d $file ];
	then
		continue
	fi

	# Generate the v2 skylink for this file.
	v2skylink=$(skynet-utils generate-v2skylink ${file#*/} $seed)
	# Escape the filename for compatibility.
	escaped_file=$(printf '%s\n' "${file#*/}" | sed -e 's/[]\/$*.^[]/\\&/g')
	# Update every other file in the directory to use the v2 skylink.
	grep -lr "branch-file:::${file#*/}" build | xargs -r sed -i -e "s/branch-file:::$escaped_file/$v2skylink/g"
done

# Now that every file has been updated to reference the correct v2 skylinks,
# upload them all to skynet and update the corresponding v2 skylinks to point
# to the correct file. After this is done, the kernel should be functional.
for file in $files
do
	# Skip any directories.
	if [ -d $file ];
	then
		continue
	fi

	# Upload the file and get the v1 skylink.
	v1skylink=$(skynet-utils upload-file $file)
	echo "Uploaded ${file#*/}: $v1skylink"
	skynet-utils upload-to-v2skylink $v1skylink ${file#*/} $seed
done

# Get the skylink of the tester file.
tester_skylink=$(skynet-utils upload-file-dry build/skynet-kernel-skyfiles/tester.html)

# Detect which portal should be used to open the test file.
skynet_portal="${SKYNET_PORTAL:-https://siasky.net}"

# Instruct the user on how to test the updated kernel
echo
echo refresh the extension in your browser and then test with the test file
echo you can open the test file with the following command
echo xdg-open $skynet_portal/$tester_skylink
