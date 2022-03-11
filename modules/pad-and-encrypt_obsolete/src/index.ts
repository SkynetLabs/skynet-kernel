// pad-and-encrypt is a basic module that will take an input set of bytes, pad
// them with zeros to an ideal length, and then encrypt the contents.
//
// The encryption key is a combination of the domainSeed and the filename of
// the file. The domainSeed is provided by the kernel as an input.

// TODO: I'm not really sure where to take the padAndEncrypt thing from here.
// The original idea was that it would automatically pad and encrypt anything
// that you wanted it to. Maybe instead of taking a filename it can take a
// generic salt? The value of a private filesystem is that...
//
// So, something like marstorage is going to have to track all of the data
// regardless. Or skytransfer. So, how can I help them out by giving them a
// filesystem that they can be happy with. They will want to be able to share
// folders.
//
// Do we want to do the upload right in place? From the global attackers view,
// what they see is a collection of files of various sizes. The files are all
// going to be linked to the same pubkey.

// onmessage receives messages from the kernel.
onmessage = function(event) {
	// Check that the general fields are recognized.
	if (event.data.kernelMethod !== "moduleCall") {
		postMessage({
			kernelMethod: "moduleResponseErr",
			err: "unrecognized kernelMethod",
		})
		return
	}

	// Handle calls to 'padAndEncrypt'.
	if (event.data.moduleMethod === "padAndEncrypt") {
		handlePadAndEncrypt(event)
		return
	}

	// Call not recognized, send an error to the kernel.
	postMessage({
		kernelMethod: "moduleResponseErr",
		err: "moduleMethod not provided by kernel",
	})
}

// handlePadAndEncrypt will process calls to 'padAndEncrypt'.
function handlePadAndEncrypt(event: MessageEvent) {
	// Check for fields specific to padAndEncrypt.
	if (!("moduleInput" in event.data) || !("filepath" in event.data.moduleInput) || !("fileData" in event.data.moduleInput)) {
		postMessage({
			kernelMethod: "moduleResponseErr",
			err: "expecting moduleInput with filepath and fileData as fields.",
		})
		return
	}
	// Check that the filepath is a string.
	if (typeof event.data.moduleInput.filepath !== "string") {
		postMessage({
			kernelMethod: "moduleResponseErr",
			err: "expecting moduleInput with filepath and fileData as fields.",
		})
		return
	}
	// TODO: Check that the fileData is a Uint8Array.

	// Perform the actual padding and encryption.
	// + derive keys
	// + determine padded length
	// + prefix padded length
	// + add padding
	// + encrypt file
	// + return result

	// Return the encrypted data.
	let encryptedData = event.data.moduleInput.fileData // TODO: use real encrypted data
	postMessage({
		kernelMethod: "moduleResponse",
		moduleResponse: encryptedData,
	})
}
