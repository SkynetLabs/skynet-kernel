import { addContextToErr } from "./err.js"
import { Err } from "./types.js"

const MAX_UINT_64 = 18446744073709551615n

// b64ToBuf will take an untrusted base64 string and convert it into a
// Uin8Array, returning an error if the input is not valid base64.
const b64regex = /^[0-9a-zA-Z-_/+=]*$/
function b64ToBuf(b64: string): [Uint8Array, Err] {
	// Check that the final string is valid base64.
	if (!b64regex.test(b64)) {
		return [new Uint8Array(0), "provided string is not valid base64"]
	}

	// Swap any '-' characters for '+', and swap any '_' characters for '/'
	// for use in the atob function.
	b64 = b64.replaceAll("-", "+").replaceAll("_", "/")

	// Perform the conversion.
	const binStr = atob(b64)
	const len = binStr.length
	const buf = new Uint8Array(len)
	for (let i = 0; i < len; i++) {
		buf[i] = binStr.charCodeAt(i)
	}
	return [buf, null]
}

// bufToHex takes a Uint8Array as input and returns the hex encoding of those
// bytes as a string.
function bufToHex(buf: Uint8Array): string {
	return [...buf].map((x) => x.toString(16).padStart(2, "0")).join("")
}

// bufToB64 will convert a Uint8Array to a base64 string with URL encoding and
// no padding characters.
function bufToB64(buf: Uint8Array): string {
	const b64Str = btoa(String.fromCharCode(...buf))
	return b64Str.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

// bufToStr takes an ArrayBuffer as input and returns a text string. bufToStr
// will check for invalid characters.
function bufToStr(buf: ArrayBuffer): [string, Err] {
	try {
		const text = new TextDecoder("utf-8", { fatal: true }).decode(buf)
		return [text, null]
	} catch (err: any) {
		return ["", addContextToErr(err.toString(), "unable to decode ArrayBuffer to string")]
	}
}

// decodeU64 is the opposite of encodeU64, it takes a uint64 encoded as 8 bytes
// and decodes them into a BigInt.
function decodeU64(u8: Uint8Array): [bigint, Err] {
	// Check the input.
	if (u8.length !== 8) {
		return [0n, "input should be 8 bytes"]
	}

	// Process the input.
	let num = 0n
	for (let i = u8.length - 1; i >= 0; i--) {
		num *= 256n
		num += BigInt(u8[i])
	}
	return [num, null]
}

// encodePrefixedBytes takes a Uint8Array as input and returns a Uint8Array
// that has the length prefixed as an 8 byte prefix.
function encodePrefixedBytes(bytes: Uint8Array): [Uint8Array, Err] {
	const [encodedLen, err] = encodeU64(BigInt(bytes.length))
	if (err !== null) {
		return [new Uint8Array(0), addContextToErr(err, "unable to encode array length")]
	}
	const prefixedArray = new Uint8Array(8 + bytes.length)
	prefixedArray.set(encodedLen, 0)
	prefixedArray.set(bytes, 8)
	return [prefixedArray, null]
}

// encodeU64 will encode a bigint in the range of a uint64 to an 8 byte
// Uint8Array.
function encodeU64(num: bigint): [Uint8Array, Err] {
	// Check the bounds on the bigint.
	if (num < 0) {
		return [new Uint8Array(0), "expected a positive integer"]
	}
	if (num > MAX_UINT_64) {
		return [new Uint8Array(0), "expected a number no larger than a uint64"]
	}

	// Encode the bigint into a Uint8Array.
	const encoded = new Uint8Array(8)
	for (let i = 0; i < encoded.length; i++) {
		const byte = Number(num & 0xffn)
		encoded[i] = byte
		num = num >> 8n
	}
	return [encoded, null]
}

// hexToBuf takes an untrusted string as input, verifies that the string is
// valid hex, and then converts the string to a Uint8Array.
const allHex = /^[0-9a-f]+$/i
function hexToBuf(hex: string): [Uint8Array, Err] {
	// The rest of the code doesn't handle zero length input well, so we handle
	// that separately. It's not an error, we just return an empty array.
	if (hex.length === 0) {
		return [new Uint8Array(0), null]
	}

	// Check that the length makes sense.
	if (hex.length % 2 !== 0) {
		return [new Uint8Array(0), "input has incorrect length"]
	}

	// Check that all of the characters are legal.
	if (!allHex.test(hex)) {
		return [new Uint8Array(0), "input has invalid character"]
	}

	// Create the buffer and fill it.
	const matches = hex.match(/.{2}/g)
	if (matches === null) {
		return [new Uint8Array(0), "input is incomplete"]
	}
	const u8 = new Uint8Array(matches.map((byte) => parseInt(byte, 16)))
	return [u8, null]
}

export { b64ToBuf, bufToHex, bufToB64, bufToStr, decodeU64, encodePrefixedBytes, encodeU64, hexToBuf }
