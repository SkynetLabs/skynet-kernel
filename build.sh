#!/bin/bash

# This is a script which builds and deploys the kernel. On Skynet, that
# essentially just means uploading the files to Skynet. Before we do that
# however, we need to perform a compilation step.
#
# Some of the files in the kernel reference other files in the kernel by their
# hash. To make development more convenient, we use a string
# 'branch-file:::<relative filepath>' to reference other files. The compilation
# step translates the relative paths into Skylinks that are unique to this
# build, and then uploads the transformed files in the deploy step.

# Detect that all required dependencies are available.
if ! [ -x "$(command -v jq)" ]; then
	echo "jq could not be found, please install jq"
	exit
fi
if ! [ -x "$(command -v curl)" ]; then
	echo "curl could not be found, please install curl"
	exit
fi

# Detect which portal should be used for uploading.
skynet_portal="${SKYNET_PORTAL:-https://siasky.net}"

# TODO: There are several portal operations in this file that are currently
# unverified. We have the ability to check that the portal is being honest when
# we deploy, so we should. The best way to go about this would be to make a
# separate binary in a separate repo, a CLI tool for Skynet (maybe even skyc)
# that can perform the uploading and downloading instead of curl, and when we
# start using the registry to make and deploy V2 skylinks, we should use the
# tool for that as well.

# TODO: Currently all the links used by the build script are V1 Skylinks. This
# means that files need to be processed and uploaded in a specific order, and
# that the file dependencies must form a DAG. If we switch to using V2
# Skylinks, we can both ignore the order that files are processed and also
# allow files to reference each other.
#
# When we switch to V2 skylinks, we will do things in a slightly different
# order. First, we will determine (probably via script input) whether this
# build is a developer build or a production build. If it is a developer build,
# we will generate a random seed for the build. If it is a production build, we
# will use an environment variable to fetch the production seed.
#
# After we have the seed, we will use that seed to deterministically generate a
# unique public key for each file, and we will use that pubkey to determine the
# V2 skylink of that file. We will then use that pubkey to find-and-replace the
# 'branch-file:::' strings. Finally, we will upload all the files at once. This
# lets us process files in any order, and allows files to reference each other.

# Establish the order that we will use to process files. This step is only
# necessary until we have support for V2 skylinks.
files=( "skynet-kernel-skyfiles/modules/basic.js" \
	"skynet-kernel-skyfiles/modules/call-other-module.js" \
	"skynet-kernel-skyfiles/homescreen.html" \
	"skynet-kernel-skyfiles/homescreen.js" \
	"skynet-kernel-skyfiles/skynet-kernel.js" \
	"skynet-kernel-extension/content-kernel.js" \
	"skynet-kernel-skyfiles/tester.html")

# Copy the kernel extension into the build folder. We do this so we don't have
# to enumerate every file in the extension above, as only the kernel.js itself
# needs to be processed.
mkdir -p build
cp -r skynet-kernel-extension build/

# Create the build dir and copy all of relevant files into it.
for file in "${files[@]}"
do
	dir=$(dirname "$file")
	mkdir -p "build/$dir"
	cp "$file" "build/$file"
done

# Upload the files in order, and then do a find and replace to replace the
# trigger strings with the appropriate skylinks.
#
# TODO: Eventually, this loop will be replaced by a trio of loops. The first
# loop will create a V2 skylink for each file, and then the second loop will
# find and replace all of the trigger strings, and then the final loop will
# upload each file and publish it under the temporary V2 skylink. The final
# output will provide skylinks for the kernel, the test files, and all of the
# modules.
for file in "${files[@]}"
do
	echo "Uploading $file"
	# Upload the file from the build folder to Skynet.
	upload_output=$(curl -s -L -X POST "$skynet_portal/skynet/skyfile" -F "file=@build/$file")
	# Parse the skylink from the output with jq
	skylink=$(echo $upload_output | jq '.skylink')
	# Remove the leading and trailing quotes from the output.
	skylink="${skylink%\"}"
	skylink="${skylink#\"}"
	# Escape the string so it can be safely passed to sed's find and
	# replace.
	escaped_file=$(printf '%s\n' "$file" | sed -e 's/[]\/$*.^[]/\\&/g')
	# Update every other file in the directory to use the skylink.
	grep -lr "branch-file:::$file" build | xargs -r sed -i -e "s/branch-file:::$escaped_file/$skylink/g"
done

# Formatting for the output
echo

# Pop open the tester file from the build.
upload_output=$(curl -s -L -X POST "$skynet_portal/skynet/skyfile" -F "file=@build/skynet-kernel-skyfiles/tester.html")
# Parse the skylink from the output with jq
skylink=$(echo $upload_output | jq '.skylink')
# Remove the leading and trailing quotes from the output.
skylink="${skylink%\"}"
skylink="${skylink#\"}"

# Instruct the user on how to test the updated kernel
#
# TODO: There seems to be an issue with the extension where using another
# portal prevents the test from being successful. That shouldn't be the case,
# because the test is itself just a v1 skylink, and all other operations are
# performend directly in the kernel, which is currently configured to just use
# siasky.net.
echo refresh the extension in your browser and then test with the test file
echo you can open the test file with the following command
echo xdg-open $skynet_portal/$skylink
