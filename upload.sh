#!/bin/bash

# This script expects a single input, which is the portal that should be used
# for the Skynet operations.
#
# TODO: The portal operations should be verified as honest. Maybe we need a
# special uploader tool or something. Maybe we can add skyc as a dependency.
# That might also give us an easy way to generate seeds for the V2 links and
# then sign them.

# Establish the array which states which order we are going to be uploading
# files in. The order matters because of dependency ranges.
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
# trigger strings with the appropriate skylinks. Eventually, this loop will be
# replaced by a trio of loops. The first loop will create a V2 skylink for each
# file, and then the second loop will find and replace all of the trigger
# strings, and then the final loop will upload each file and publish it under
# the temporary V2 skylink. The final output will provide skylinks for the
# kernel, the test files, and all of the modules.
for file in "${files[@]}"
do
	echo "Uploading $file"
	# Upload the file from the build folder to Skynet.
	upload_output=$(curl -s -L -X POST "$1/skynet/skyfile" -F "file=@build/$file")
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
upload_output=$(curl -s -L -X POST "$1/skynet/skyfile" -F "file=@build/skynet-kernel-skyfiles/tester.html")
# Parse the skylink from the output with jq
skylink=$(echo $upload_output | jq '.skylink')
# Remove the leading and trailing quotes from the output.
skylink="${skylink%\"}"
skylink="${skylink#\"}"

# Instruct the user on how to test the updated kernel
echo refresh the extension in your browser and then test with the test file
echo you can open the test file with the following command
echo xdg-open $1/$skylink
