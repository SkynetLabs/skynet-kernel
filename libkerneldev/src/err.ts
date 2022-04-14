// addContextToErr is a helper function that standardizes the formatting of
// adding context to an error. Within the world of go we discovered that being
// very persistent about layering context onto errors is incredibly helpful
// when debugging, even though it often creates comically verbose error
// messages. Trust me, it's well worth the tradeoff.
var addContextToErr = function(err: string | null, context: string): string | null {
	if (err === null) {
		return null
	}
	return context + ": " + err
}

export { addContextToErr }
