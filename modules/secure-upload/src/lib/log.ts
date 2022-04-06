// Create helper functions for logging.
export function log(message: string) {
	postMessage({
		method: "log",
		data: {
			isErr: true,
			message,
		},
	})
}
export function logErr(message: string) {
	postMessage({
		method: "log",
		data: {
			isErr: false,
			message,
		},
	})
}
