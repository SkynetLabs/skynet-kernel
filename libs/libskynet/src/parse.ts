// @ts-nocheck

import { objAsString } from "./objAsString.js"
import { error } from "./types.js"

// json_parse extracted from the json-bigint npm library
// regexpxs extracted from
// (c) BSD-3-Clause
// https://github.com/fastify/secure-json-parse/graphs/contributors and https://github.com/hapijs/bourne/graphs/contributors
const suspectProtoRx =
	/(?:_|\\u005[Ff])(?:_|\\u005[Ff])(?:p|\\u0070)(?:r|\\u0072)(?:o|\\u006[Ff])(?:t|\\u0074)(?:o|\\u006[Ff])(?:_|\\u005[Ff])(?:_|\\u005[Ff])/
const suspectConstructorRx =
	/(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)/
let json_parse = function (options) {
	"use strict"

	// This is a function that can parse a JSON text, producing a JavaScript
	// data structure. It is a simple, recursive descent parser. It does not use
	// eval or regular expressions, so it can be used as a model for implementing
	// a JSON parser in other languages.

	// We are defining the function inside of another function to avoid creating
	// global variables.

	// Default options one can override by passing options to the parse()
	let _options = {
		strict: false, // not being strict means do not generate syntax errors for "duplicate key"
		storeAsString: false, // toggles whether the values should be stored as BigNumber (default) or a string
		alwaysParseAsBig: false, // toggles whether all numbers should be Big
		protoAction: "error",
		constructorAction: "error",
	}

	// If there are options, then use them to override the default _options
	if (options !== undefined && options !== null) {
		if (options.strict === true) {
			_options.strict = true
		}
		if (options.storeAsString === true) {
			_options.storeAsString = true
		}
		_options.alwaysParseAsBig = options.alwaysParseAsBig === true ? options.alwaysParseAsBig : false

		if (typeof options.constructorAction !== "undefined") {
			if (
				options.constructorAction === "error" ||
				options.constructorAction === "ignore" ||
				options.constructorAction === "preserve"
			) {
				_options.constructorAction = options.constructorAction
			} else {
				throw new Error(
					`Incorrect value for constructorAction option, must be "error", "ignore" or undefined but passed ${options.constructorAction}`
				)
			}
		}

		if (typeof options.protoAction !== "undefined") {
			if (options.protoAction === "error" || options.protoAction === "ignore" || options.protoAction === "preserve") {
				_options.protoAction = options.protoAction
			} else {
				throw new Error(
					`Incorrect value for protoAction option, must be "error", "ignore" or undefined but passed ${options.protoAction}`
				)
			}
		}
	}

	let at, // The index of the current character
		ch, // The current character
		escapee = {
			'"': '"',
			"\\": "\\",
			"/": "/",
			b: "\b",
			f: "\f",
			n: "\n",
			r: "\r",
			t: "\t",
		},
		text,
		error = function (m) {
			// Call error when something is wrong.

			throw {
				name: "SyntaxError",
				message: m,
				at: at,
				text: text,
			}
		},
		next = function (c) {
			// If a c parameter is provided, verify that it matches the current character.

			if (c && c !== ch) {
				error("Expected '" + c + "' instead of '" + ch + "'")
			}

			// Get the next character. When there are no more characters,
			// return the empty string.

			ch = text.charAt(at)
			at += 1
			return ch
		},
		number = function () {
			// Parse a number value.

			let number,
				string = ""

			if (ch === "-") {
				string = "-"
				next("-")
			}
			while (ch >= "0" && ch <= "9") {
				string += ch
				next()
			}
			if (ch === ".") {
				string += "."
				while (next() && ch >= "0" && ch <= "9") {
					string += ch
				}
			}
			if (ch === "e" || ch === "E") {
				string += ch
				next()
				if (ch === "-" || ch === "+") {
					string += ch
					next()
				}
				while (ch >= "0" && ch <= "9") {
					string += ch
					next()
				}
			}
			number = +string
			if (!isFinite(number)) {
				error("Bad number")
			} else {
				if (Number.isSafeInteger(number)) return !_options.alwaysParseAsBig ? number : BigInt(number)
				// Number with fractional part should be treated as number(double) including big integers in scientific notation, i.e 1.79e+308
				else return _options.storeAsString ? string : /[.eE]/.test(string) ? number : BigInt(string)
			}
		},
		string = function () {
			// Parse a string value.

			let hex,
				i,
				string = "",
				uffff

			// When parsing for string values, we must look for " and \ characters.

			if (ch === '"') {
				let startAt = at
				while (next()) {
					if (ch === '"') {
						if (at - 1 > startAt) string += text.substring(startAt, at - 1)
						next()
						return string
					}
					if (ch === "\\") {
						if (at - 1 > startAt) string += text.substring(startAt, at - 1)
						next()
						if (ch === "u") {
							uffff = 0
							for (i = 0; i < 4; i += 1) {
								hex = parseInt(next(), 16)
								if (!isFinite(hex)) {
									break
								}
								uffff = uffff * 16 + hex
							}
							string += String.fromCharCode(uffff)
						} else if (typeof escapee[ch] === "string") {
							string += escapee[ch]
						} else {
							break
						}
						startAt = at
					}
				}
			}
			error("Bad string")
		},
		white = function () {
			// Skip whitespace.

			while (ch && ch <= " ") {
				next()
			}
		},
		word = function () {
			// true, false, or null.

			switch (ch) {
				case "t":
					next("t")
					next("r")
					next("u")
					next("e")
					return true
				case "f":
					next("f")
					next("a")
					next("l")
					next("s")
					next("e")
					return false
				case "n":
					next("n")
					next("u")
					next("l")
					next("l")
					return null
			}
			error("Unexpected '" + ch + "'")
		},
		value, // Place holder for the value function.
		array = function () {
			// Parse an array value.

			let array = []

			if (ch === "[") {
				next("[")
				white()
				if (ch === "]") {
					next("]")
					return array // empty array
				}
				while (ch) {
					array.push(value())
					white()
					if (ch === "]") {
						next("]")
						return array
					}
					next(",")
					white()
				}
			}
			error("Bad array")
		},
		object = function () {
			// Parse an object value.

			let key,
				object = Object.create(null)

			if (ch === "{") {
				next("{")
				white()
				if (ch === "}") {
					next("}")
					return object // empty object
				}
				while (ch) {
					key = string()
					white()
					next(":")
					if (_options.strict === true && Object.hasOwnProperty.call(object, key)) {
						error('Duplicate key "' + key + '"')
					}

					if (suspectProtoRx.test(key) === true) {
						if (_options.protoAction === "error") {
							error("Object contains forbidden prototype property")
						} else if (_options.protoAction === "ignore") {
							value()
						} else {
							object[key] = value()
						}
					} else if (suspectConstructorRx.test(key) === true) {
						if (_options.constructorAction === "error") {
							error("Object contains forbidden constructor property")
						} else if (_options.constructorAction === "ignore") {
							value()
						} else {
							object[key] = value()
						}
					} else {
						object[key] = value()
					}

					white()
					if (ch === "}") {
						next("}")
						return object
					}
					next(",")
					white()
				}
			}
			error("Bad object")
		}

	value = function () {
		// Parse a JSON value. It could be an object, an array, a string, a number,
		// or a word.

		white()
		switch (ch) {
			case "{":
				return object()
			case "[":
				return array()
			case '"':
				return string()
			case "-":
				return number()
			default:
				return ch >= "0" && ch <= "9" ? number() : word()
		}
	}

	// Return the json_parse function. It will have access to all of the above
	// functions and variables.

	return function (source, reviver) {
		let result

		text = source + ""
		at = 0
		ch = " "
		result = value()
		white()
		if (ch) {
			error("Syntax error")
		}

		// If there is a reviver function, we recursively walk the new structure,
		// passing each name/value pair to the reviver function for possible
		// transformation, starting with a temporary root object that holds the result
		// in an empty key. If there is not a reviver function, we simply return the
		// result.

		return typeof reviver === "function"
			? (function walk(holder, key) {
					let v,
						value = holder[key]
					if (value && typeof value === "object") {
						Object.keys(value).forEach(function (k) {
							v = walk(value, k)
							if (v !== undefined) {
								value[k] = v
							} else {
								delete value[k]
							}
						})
					}
					return reviver.call(holder, key, value)
			  })({ "": result }, "")
			: result
	}
}

// parseJSON is a wrapper for JSONbig.parse that returns an error rather than
// throwing an error. JSONbig is an alternative to JSON.parse that decodes
// every number as a bigint. This is required when working with the skyd API
// because the skyd API uses 64 bit precision for all of its numbers, and
// therefore cannot be parsed losslessly by javascript. The skyd API is
// cryptographic, therefore full precision is required.
function parseJSON(json: string): [any, error] {
	try {
		let obj = json_parse({ alwaysParseAsBig: true })(json)
		return [obj, null]
	} catch (err: any) {
		return [{}, objAsString(err)]
	}
}

export { parseJSON }
