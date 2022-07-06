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
		let str = JSON.stringify(obj, (_, v) => {
			if (typeof v === "bigint") {
				return Number(v)
			}
			return v
		})
		return [str, null]
	} catch (err) {
		return ["", addContextToErr(tryStringify(err), "unable to stringify object")]
	}
}

export { jsonStringify }
