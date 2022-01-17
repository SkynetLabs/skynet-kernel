// parseJSON is a wrapper for JSON.parse that returns an error rather than
// throwing an error.
var parseJSON = function(json: string): [any, Error] {
	try {
		let obj = JSON.parse(json);
		return [obj, null];
	} catch (err) {
		return [null, err];
	}
}
