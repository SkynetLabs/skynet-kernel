var addContextToErr = function(err: Error, context: string): Error {
	return new Error(context + ": " + err.message);
}
