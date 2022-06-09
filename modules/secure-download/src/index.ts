// secure-download is a module which will download a file from Skynet. The hash
// of the file is computed locally after the data is received to ensure that
// the data matches the skylink.

import { activeQuery, addContextToErr, addHandler, handleMessage, tryStringify } from "libkmodule"

import {
	b64ToBuf,
	defaultPortalList,
	error,
	progressiveFetch,
	progressiveFetchResult,
	validSkylink,
	verifyDownloadResponse,
} from "libskynet"

addHandler("secureDownload", handleSecureDownload)
onmessage = handleMessage

// handleSecureDownload will handle a call to secureDownload.
function handleSecureDownload(aq: activeQuery) {
	// Parse the skylink.
	if (!("skylink" in aq.callerInput)) {
		aq.reject("missing skylink from method data")
		return
	}
	if (typeof aq.callerInput.skylink !== "string") {
		aq.reject("filename is expected to be a string")
		return
	}
	let [u8Link, err64] = b64ToBuf(aq.callerInput.skylink)
	if (err64 !== null) {
		aq.reject(addContextToErr(err64, "unable to decode skylink"))
		return
	}
	if (!validSkylink(u8Link)) {
		aq.reject("skylink " + aq.callerInput.skylink + " is not valid")
		return
	}

	// Call progressiveFetch to perform the download.
	let endpoint = "/skynet/trustless/basesector/" + aq.callerInput.skylink
	let fileDataPtr = { fileData: new Uint8Array(0), err: null }
	let verifyFunction = function (response: Response): Promise<error> {
		return verifyDownloadResponse(response, u8Link, fileDataPtr)
	}
	progressiveFetch(endpoint, null, defaultPortalList, verifyFunction).then((result: progressiveFetchResult) => {
		if (result.success !== true) {
			let err = tryStringify(result.messagesFailed)
			aq.reject(addContextToErr(err, "unable to download file"))
			return
		}
		if (fileDataPtr.err !== null) {
			aq.reject(addContextToErr(fileDataPtr.err, "file appears to be corrupt"))
			return
		}
		aq.accept({
			fileData: fileDataPtr.fileData,
		})
	})
}
