// encodeNumber is a helper function to turn a number into an 8 byte
// Uint8Array.
//
// TODO: Probably need this to be able to cover all 8 byte numbers with full
// precision, meaning we should be using BigInt instead of number.
export function encodeNumber(num: number): Uint8Array {
	let encoded = new Uint8Array(8)
	for (let i = 0; i < encoded.length; i++) {
		let byte = num & 0xff
		encoded[i] = byte
		num = num >> 8
	}
	return encoded
}

// bufToB64 will convert a Uint8Array to a base64 string with URL encoding and
// no padding characters.
export function bufToB64(buf: Uint8Array): string {
	let b64Str = btoa(String.fromCharCode.apply(null, <any>buf))
	return b64Str.replace(/\+/g, "-").replace(/\//g, "_").replace(/\=/g, "")
}
