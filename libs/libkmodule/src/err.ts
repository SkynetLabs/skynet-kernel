import { clearIncomingQuery } from "./queries.js"
import { tryStringify } from "libskynet"

// respondErr will send an error to the kernel as a response to a moduleCall.
function respondErr(event: MessageEvent, err: string) {
	let strErr = tryStringify(err)
	postMessage({
		nonce: event.data.nonce,
		method: "response",
		err: strErr,
		data: null,
	})
	clearIncomingQuery(event.data.nonce)
}

export { respondErr }
