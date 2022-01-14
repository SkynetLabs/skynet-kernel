// parseJSON is a wrapper for JSON.parse that returns an error rather than
// throwing an error. This cleans up the code substantially.
var parseJSON = function(json: string): [any, string] {
	try {
		let obj = JSON.parse(json);
		return [obj, null];
	} catch (err) {
		return [null, err];
	}
}
