// addContextToErr is a helper function that standardizes the formatting of
// adding context to an error. Within the world of go we discovered that being
// persistent about layering context onto errors is helpful when debugging,
// even though it often creates rather verbose error messages.
//
// addContextToErr will return null if the input err is null.
function addContextToErr(err: string | null, context: string): string | null {
	if (err === null) {
		return null
	}
	return context + ": " + err
}

export { addContextToErr }
