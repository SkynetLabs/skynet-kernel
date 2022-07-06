import { addContextToErr } from "./err.js"
import { tryStringify } from "./stringifytry.js"
import { error } from "./types.js"

// stringifyjson.ts is split into a separate file to avoid a circular
// dependency. If you merge it with stringifytry.ts you have a circular import
// where err.js is importing stringify.js and stringify.js is importing err.js.
// Splitting the functions out resolves this issue.

// jsonStringify is a replacement for JSON.stringify that returns an error
// rather than throwing.
function jsonStringify(obj: any): [string, error] {
	try {
		let hasNumber = false
		let str = JSON.stringify(obj, (_, v) => {
			if (typeof v === "bigint") {
				return v.toString()
			}
			if (typeof v === "number") {
				hasNumber = true
			}
			return v
		})
		if ((hasNumber as any) === true) { // typescript parser doesn't seem to see the 'hasNumber = true' above
			return ["", "cannot encode type 'number', only bigints are supported"]
		}
		return [str, null]
	} catch (err) {
		return ["", addContextToErr(tryStringify(err), "unable to stringify object")]
	}
}

export { jsonStringify }
