import { addContextToErr } from "./err.js"
import { error } from "./types.js"

// Helper consts to make it easy to return empty values alongside errors.
const nu8 = new Uint8Array(0)

// b64ToBuf will take an untrusted base64 string and convert it into a
// Uin8Array, returning an error if the input is not valid base64.
function b64ToBuf(b64: string): [Uint8Array, error] {
	// Check that the final string is valid base64.
	let b64regex = /^[0-9a-zA-Z-_/+=]*$/
	if (!b64regex.test(b64)) {
		return [nu8, "provided string is not valid base64"]
	}

	// Swap any '-' characters for '+', and swap any '_' characters for '/'
	// for use in the atob function.
	b64 = b64.replace(/-/g, "+").replace(/_/g, "/")

	// Perform the conversion.
	let binStr = atob(b64)
	let len = binStr.length
	let buf = new Uint8Array(len)
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
	let b64Str = btoa(String.fromCharCode.apply(null, <number[]>(<unknown>buf)))
	return b64Str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

// bufToStr takes an ArrayBuffer as input and returns a text string. bufToStr
// will check for invalid characters.
function bufToStr(buf: ArrayBuffer): [string, error] {
	try {
		let text = new TextDecoder("utf-8", { fatal: true }).decode(buf)
		return [text, null]
	} catch (err: any) {
		return ["", addContextToErr(err.toString(), "unable to decode ArrayBuffer to string")]
	}
}

// decodeBigint will take an 8 byte Uint8Array and decode it as a bigint.
function decodeBigint(buf: Uint8Array): [bigint, error] {
	if (buf.length !== 8) {
		return [0n, "a number is expected to be 8 bytes"]
	}
	let num = 0n
	for (let i = 7; i >= 0; i--) {
		num *= 256n
		num += BigInt(buf[i])
	}
	return [num, null]
}

// decodeU64 is the opposite of encodeU64, it takes a uint64 encoded as 8 bytes
// and decodes them into a BigInt.
function decodeU64(u8: Uint8Array): [bigint, error] {
	// Check the input.
	if (u8.length !== 8) {
		return [0n, "input should be 8 bytes"]
	}

	// Process the input.
	let num = 0n
	for (let i = u8.length-1; i >= 0; i--) {
		num *= 256n
		num += BigInt(u8[i])
	}
	return [num, null]
}

// encodePrefixedBytes takes a Uint8Array as input and returns a Uint8Array
// that has the length prefixed as an 8 byte prefix. The input can be at most 4
// GiB.
function encodePrefixedBytes(bytes: Uint8Array): [Uint8Array, error] {
	let len = bytes.length
	if (len > 4294968295) {
		return [nu8, "input is too large to be encoded"]
	}
	let buf = new ArrayBuffer(8 + len)
	let view = new DataView(buf)
	view.setUint32(0, len, true)
	let uint8Bytes = new Uint8Array(buf)
	uint8Bytes.set(bytes, 8)
	return [uint8Bytes, null]
}

// encodeU64 will encode a bigint in the range of a uint64 to an 8 byte
// Uint8Array.
function encodeU64(num: bigint): [Uint8Array, error] {
	// Check the bounds on the bigint.
	if (num < 0) {
		return [nu8, "expected a positive integer"]
	}
	if (num > 18446744073709551615n) {
		return [nu8, "expected a number no larger than a uint64"]
	}

	// Encode the bigint into a Uint8Array.
	let encoded = new Uint8Array(8)
	for (let i = 0; i < encoded.length; i++) {
		let byte = Number(num & 0xffn)
		encoded[i] = byte
		num = num >> 8n
	}
	return [encoded, null]
}

// hexToBuf takes an untrusted string as input, verifies that the string is
// valid hex, and then converts the string to a Uint8Array.
function hexToBuf(hex: string): [Uint8Array, error] {
	// Check that the length makes sense.
	if (hex.length % 2 != 0) {
		return [nu8, "input has incorrect length"]
	}

	// Check that all of the characters are legal.
	let match = /[0-9A-Fa-f]*/g
	if (!match.test(hex)) {
		return [nu8, "input has invalid character"]
	}

	// Create the buffer and fill it.
	let matches = hex.match(/.{1,2}/g)
	if (matches === null) {
		return [nu8, "input is incomplete"]
	}
	let u8 = new Uint8Array(matches.map((byte) => parseInt(byte, 16)))
	return [u8, null]
}

export { b64ToBuf, bufToHex, bufToB64, bufToStr, decodeBigint, decodeU64, encodePrefixedBytes, encodeU64, hexToBuf }
