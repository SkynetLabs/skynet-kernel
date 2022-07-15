import { objAsString } from "./objAsString"

// addContextToErr is a helper function that standardizes the formatting of
// adding context to an error.
//
// NOTE: To protect against accidental situations where an Error type or some
// other type is provided instead of a string, we wrap both of the inputs with
// objAsString before returning them. This prevents runtime failures.
function addContextToErr(err: any, context: string): string {
	if (err === null || err === undefined) {
		err = "[no error provided]"
	}
	return objAsString(context) + ": " + objAsString(err)
}

export { addContextToErr }
