// pad-and-encrypt is a basic module that will take an input set of bytes, pad
// them with zeros to an ideal length, and then encrypt the contents.
//
// The encryption key is a combination of the domainSeed and the filename of
// the file. The domainSeed is provided by the kernel as an input.

// TODO: There is probably a way to clean up a lot of this input validation, we
// can probably make this step a lot nicer.

// onmessage receives messages from the kernel.
onmessage = function(event) {
	// Check that the general fields are recognized.
	if (!("data" in event) || !("kernelMethod" in event.data) || event.data.kernelMethod !== "moduleCall") {
		postMessage({
			kernelMethod: "moduleResponseErr",
			err: "unrecognized kernelMethod",
		})
		return
	}
	// Check that the kernel has provided a seed.
	//
	// TODO: Also need to check the typing of the seed.
	if (!("seed" in event.data)) {
		postMessage({
			kernelMethod: "moduleResponseErr",
			err: "no seed provided by kernel",
		})
		return
	}
	// Check that a sourceDomain was provided. We will use the sourceDomain
	// to derive an encryption key from the seed.
	if (!("sourceDomain" in event.data)) {
		postMessage({
			kernelMethod: "moduleResponseErr",
			err: "no sourceDomain provided, cannot encrypt data",
		})
		return
	}
	// Check that the caller has requested the right method.
	if (!("moduleMethod" in event.data)) {
		postMessage({
			kernelMethod: "moduleResponseErr",
			err: "moduleMethod not provided by kernel",
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
