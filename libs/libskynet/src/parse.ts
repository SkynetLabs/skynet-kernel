// parseJSON is a wrapper for JSON.parse that returns an error rather than
// throwing an error.
function parseJSON(json: string): [any, string | null] {
	try {
		let obj = JSON.parse(json)
		return [obj, null]
	} catch (err: any) {
		return [{}, err.toString()]
	}
}

export { parseJSON }
