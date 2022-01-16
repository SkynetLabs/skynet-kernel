// buf2hex takes a Uint8Array as input (or any ArrayBuffer) and returns the hex
// encoding of those bytes. The return value is a string.
var buf2hex = function(buffer: ArrayBuffer) {
	return [...new Uint8Array(buffer)]
		.map(x => x.toString(16).padStart(2, '0'))
		.join('');
}

// hex2buf takes an untrusted string as input, verifies that the string is
// valid hex, and then converts the string to a Uint8Array.
var hex2buf = function(hex: string): [Uint8Array, Error] {
	// Check that the length makes sense.
	if (hex.length%2 != 0) {
		return [null, new Error("input has incorrect length")];
	}

	// Check that all of the characters are legal.
	let match = /[0-9A-Fa-f]*/g;
	if (!match.test(hex)) {
		return [null, new Error("input has invalid character")];
	}

	// Create the buffer and fill it.
	let matches = hex.match(/.{1,2}/g);
	if (matches === null) {
		return [null, new Error("input is incomplete")];
	}
	let u8 = new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
	return [u8, null];
}

// b64ToBuf will take an untrusted base64 string and convert it into a
// Uin8Array, returning an error if the input is not valid base64.
var b64ToBuf = function(b64: string): [Uint8Array, Error] {
	// Check that the final string is valid base64.
	let b64regex = /^[0-9a-zA-Z-_/+=]*$/;
	if (!b64regex.test(b64)) {
		log("lifecycle", "not valid b64", b64);
		return [null, new Error("provided string is not valid base64")];
	}

	// Swap any '-' characters for '+', and swap any '_' characters for '/'
	// for use in the atob function.
	b64 = b64.replace(/-/g, "+").replace(/_/g, "/");

	// Perform the conversion.
	let binStr = atob(b64);
	let len = binStr.length;
	let buf = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		buf[i] = binStr.charCodeAt(i);
	}
	return [buf, null];
}

// bufToB64 will convert a Uint8Array to a base64 string with URL encoding and
// no padding characters.
var bufToB64 = function(buf: Uint8Array): string {
	let b64Str = btoa(String.fromCharCode.apply(null, buf));
	return b64Str.replace(/\+/g, "-").replace(/\//g, "_").replace(/\=/g, "");
}

// encodeNumber will take a number as input and return a corresponding
// Uint8Array.
var encodeNumber = function(num: number): Uint8Array {
	let encoded = new Uint8Array(8);
	for (let index = 0; index < encoded.length; index++) {
		let byte = num & 0xff;
		encoded[index] = byte
		num = num >> 8;
	}
	return encoded
}

// encodePrefixedBytes takes a Uint8Array as input and returns a Uint8Array
// that has the length prefixed as an 8 byte prefix. Inside the function we use
// 'setUint32', which means that the input needs to be less than 4 GiB. For all
// known use cases, this is fine.
var encodePrefixedBytes = function(bytes: Uint8Array): [Uint8Array, Error] {
	let len = bytes.length;
	if (len > 4294968295) {
		return [null, new Error("input is too large to be encoded")]
	}
	let buf = new ArrayBuffer(8 + len);
	let view = new DataView(buf);
	view.setUint32(0, len, true);
	let uint8Bytes = new Uint8Array(buf);
	uint8Bytes.set(bytes, 8);
	return [uint8Bytes, null];
}
