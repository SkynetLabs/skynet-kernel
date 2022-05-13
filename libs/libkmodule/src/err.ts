import { addContextToErr, composeErr } from "libskynet"

// respondErr will send an error to the kernel as a response to a moduleCall.
function respondErr(event: MessageEvent, err: string) {
	postMessage({
		nonce: event.data.nonce,
		method: "response",
		err,
		data: null,
	})
}

export { addContextToErr, composeErr, respondErr }
