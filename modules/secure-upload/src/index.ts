// secure-upload is a module which will upload a file to Skynet. The skylink is
// computed locally before uploading to ensure that the portal cannot modify
// the data in the middle of the upload.
//
// secure-upload will use portal-dac to determine the user's portals.

// reportErr will send a postMessage back to the kernel reporting the error.
function reportErr(err: string) {
	postMessage({
		kernelMethod: "moduleResponseErr",
		err,
	})
}

// onmessage receives messages from the kernel.
onmessage = function(event) {
	// Check that the general fields are recognized.
	if (event.data.kernelMethod === "moduleCall") {
		handleModuleCall(event)
		return
	}
	if (event.data.kernelMethod === "moduleResponse") {
		// TODO: handleModuleResponse(event)
		return
	}

	// The kernelMethod was not recognized.
	reportErr("unrecognized kernelMethod: "+event.data.kernelMethod)
	return
}

// handleModuleCall will handle any moduleCalls sent to the module.
function handleModuleCall(event: MessageEvent) {
	// Check for the secureUpload call.
	if (event.data.moduleMethod === "secureUpload") {
		handleSecureUpload(event)
		return
	}

	// Unrecognized moduleMethod.
	reportErr("unrecognized moduleMethod "+event.data.moduleMethod)
	return
}

// TODO: handleModuleResponse - need this for portal lookup, and for blake2b
// merkle rooting, I think

// handleSecureUpload will handle a call to secureUpload.
function handleSecureUpload(event: MessageEvent) {
	// Check for the two required fields: filename and fileData.
	if (!("filename" in event.data.moduleInput)) {
		reportErr("missing filename from moduleInput")
		return
	}
	if (!("fileData" in event.data.moduleInput)) {
		reportErr("missing fileData from moduleInput")
		return
	}

	// TODO: Need to validate the filename.

	// Compute the binary version of the metadata.
	//
	// TODO: We may need to include the mode here. If things aren't
	// working, try adding the mode.
	let metadataString = JSON.stringify({
		Filename: event.data.moduleInput.filename,
		Length: event.data.moduleInput.fileData.length,
	})
	let u8 = new TextEncoder().encode(metadataString)

	// Check that we got the encoding right.
	reportErr(JSON.stringify(u8))
	return

	// Build the layout bytes. TODO: Need to encode these to binary.
	/*
	{
		Version: 1,
		Filesize: event.data.moduleInput.fileData.length,
		MetadataSize: metadataBytes.length
		CipherType: 1, // 8 bytes, last byte is a 1.
	}
       */

	// TODO: Build the base sector.

	// TODO: Compute the merkle root of the base sector

	// TODO: Extract the skylink

	// TODO: Do the POST request to /skynet/restore

	// Return the encrypted data.
	let encryptedData = event.data.moduleInput.fileData // TODO: use real encrypted data
	postMessage({
		kernelMethod: "moduleResponse",
		moduleResponse: "success",
	})
}


