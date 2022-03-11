// secure-upload is a module which will upload a file to Skynet. The skylink is
// computed locally before uploading to ensure that the portal cannot modify
// the data in the middle of the upload.
//
// secure-upload will use portal-dac to determine the user's portals.

// reportErr will send a postMessage back to the kernel reporting the error.
function reportErr(err: string) {
	postMessage({
		kernelMethod: "moduleResponseErr",
		err,
	})
}

// onmessage receives messages from the kernel.
onmessage = function(event) {
	// Check that the general fields are recognized.
	if (event.data.kernelMethod === "moduleCall") {
		handleModuleCall(event)
		return
	}
	/*
	if (event.data.kernelMethod === "moduleResponse") {
		handleModuleResponse(event)
		return
	}
       */

	// The kernelMethod was not recognized.
	reportErr("unrecognized kernelMethod: "+event.data.kernelMethod)
	return
}

// handleModuleCall will handle any moduleCalls sent to the module.
function handleModuleCall(event: MessageEvent) {
	// Check for the secureUpload call.
	if (event.data.moduleMethod === "secureUpload") {
		handleSecureUpload(event)
		return
	}

	// Unrecognized moduleMethod.
	reportErr("unrecognized moduleMethod "+event.data.moduleMethod)
	return
}

// TODO: handleModuleResponse - need this for portal lookup, and for blake2b
// merkle rooting, I think

// encodeNumber is a helper function to turn a number into an 8 byte
// Uint8Array.
//
// TODO: Probably need this to be able to cover all 8 byte numbers with full
// precision, meaning we should be using BigInt instead of number.
function encodeNumber(num: number): Uint8Array {
	let encoded = new Uint8Array(8)
	for (let i = 0; i < encoded.length; i++) {
		let byte = num & 0xff
		encoded[i] = byte
		num = num >> 8
	}
	return encoded
}

// blake2bProofStack is an abstraction for an in-progress Merkle tree. You need
// at most one object in memory per height of the tree, otherwise objects can
// be combined.
//
// The elements of the blake2bProofStack are both arrays, these arrays need to
// stay the same length. We could enforce this more formally by making another
// interface, but at least for now we've chosen to minimize the total number of
// types instead.
interface blake2bProofStack {
	subtreeRoots: Uint8Array[];
	subtreeHeights: number[];
}

// addSubtreeToBlake2bProofStack will add a subtree to a proof stack.
var addSubtreeToBlake2bProofStack = function(ps: blake2bProofStack, subtreeRoot: Uint8Array, subtreeHeight: number): Error {
	// Input checking.
	if (subtreeRoot.length !== 32) {
		return new Error("cannot add subtree because root is wrong length")
	}

	// If the blake2bProofStack has no elements in it yet, add the subtree
	// with no further checks.
	if (ps.subtreeRoots.length === 0) {
		ps.subtreeRoots.push(subtreeRoot)
		ps.subtreeHeights.push(subtreeHeight)
		return null!
	}

	// Check the height of the new subtree against the height of the
	// smallest subtree in the blake2bProofStack. If the new subtree is
	// larger, the subtree cannot be added.
	let maxHeight = ps.subtreeHeights[ps.subtreeHeights.length-1]
	if (subtreeHeight > maxHeight) {
		return new Error(`cannot add a subtree that is taller ${subtreeHeight} than the smallest ${maxHeight} subtree in the stack`)
	}

	// If the new subtreeHeight is smaller than the max height, we can just
	// append the subtree height without doing anything more.
	if (subtreeHeight < maxHeight) {
		ps.subtreeRoots.push(subtreeRoot)
		ps.subtreeHeights.push(subtreeHeight)
		return null!
	}

	// If the new subtree is the same height as the smallest subtree, we
	// have to pull the smallest subtree out, combine it with the new
	// subtree, and push the result.
	let oldSTR = <Uint8Array>ps.subtreeRoots.pop()
	ps.subtreeHeights.pop() // We already have the height.
	let combinedRoot = new Uint8Array(65)
	combinedRoot[0] = 1
	combinedRoot.set(oldSTR, 1)
	combinedRoot.set(subtreeRoot, 33)
	let newSubtreeRoot = blake2b(combinedRoot)
	return addSubtreeToBlake2bProofStack(ps, newSubtreeRoot, subtreeHeight+1)
}

// addLeafBytesToBlake2bProofStack will add a leaf to a proof stack.
var addLeafBytesToBlake2bProofStack = function(ps: blake2bProofStack, leafBytes: Uint8Array): Error {
	if (leafBytes.length !== 64) {
		let strBytes = leafBytes.length.toString()
		return new Error("blake2bProofStack expects leafByte objects to be exactly 64 bytes: "+strBytes)
	}
	let taggedBytes = new Uint8Array(65)
	taggedBytes.set(leafBytes, 1)
	let subtreeRoot = blake2b(taggedBytes)
	return addSubtreeToBlake2bProofStack(ps, subtreeRoot, 1)
}

// blake2bProofStackRoot returns the final Merkle root of the data in the
// current proof stack.
var blake2bProofStackRoot = function(ps: blake2bProofStack): [Uint8Array, Error] {
	// Input checking.
	if (ps.subtreeRoots.length === 0) {
		return [null!, new Error("cannot compute the Merkle root of an empty data set")]
	}

	// Algorithm is pretty basic, start with the final tree, and then add
	// it to the previous tree. Repeat until there are no more trees.
	let baseSubtreeRoot = <Uint8Array>ps.subtreeRoots.pop()
	while (ps.subtreeRoots.length !== 0) {
		let nextSubtreeRoot = <Uint8Array>ps.subtreeRoots.pop()
		let combinedRoot = new Uint8Array(65)
		combinedRoot[0] = 1
		combinedRoot.set(baseSubtreeRoot, 1)
		combinedRoot.set(nextSubtreeRoot, 33)
		baseSubtreeRoot = blake2b(combinedRoot)
	}
	return [baseSubtreeRoot, null!]
}

// handleSecureUpload will handle a call to secureUpload.
function handleSecureUpload(event: MessageEvent) {
	// Check for the two required fields: filename and fileData.
	if (!("filename" in event.data.moduleInput)) {
		reportErr("missing filename from moduleInput")
		return
	}
	if (!("fileData" in event.data.moduleInput)) {
		reportErr("missing fileData from moduleInput")
		return
	}

	// TODO: Need to validate the filename.

	// Compute the binary version of the metadata.
	//
	// TODO: We may need to include the mode here. If things aren't
	// working, try adding the mode.
	let metadataString = JSON.stringify({
		Filename: event.data.moduleInput.filename,
		Length: event.data.moduleInput.fileData.length,
	})
	let metadataBytes  = new TextEncoder().encode(metadataString)

	// Compute the binary
	let layoutBytes = new Uint8Array(99)
	// Set the version.
	let offset = 0
	layoutBytes[offset] = 1
	offset++
	// Set the filesize.
	let filesizeBytes = encodeNumber(event.data.moduleInput.fileData.length)
	layoutBytes.set(filesizeBytes, offset)
	offset += 8
	// Set the metadata size.
	let mdSizeBytes = encodeNumber(metadataBytes.length)
	layoutBytes.set(mdSizeBytes, offset)
	offset += 8
	// Skip the fanout size and fanout data+parity pieces.
	offset += 10
	// Set the cipher type.
	offset += 7
	layoutBytes[offset] = 1
	offset++
	// The rest is key data, which is deprecated.

	// Build the base sector.
	let totalSize = event.data.moduleInput.fileData.length + layoutBytes.length + metadataBytes.length
	if (totalSize > 4194304) {
		reportErr("file is too large for secure-upload, only small files supported for now")
		return
	}
	let baseSector = new Uint8Array(4194304+92)
	offset = 92
	baseSector.set(layoutBytes, offset)
	offset += layoutBytes.length
	baseSector.set(metadataBytes, offset)
	offset += metadataBytes.length
	baseSector.set(event.data.moduleInput.fileData, offset)

	// Compute the merkle root of the base sector
	let ps = {
		subtreeRoots: <Uint8Array[]>[],
		subtreeHeights: <number[]>[],
	}
	for (let i = 92; i < baseSector.length; i+=64) {
		let errALB = addLeafBytesToBlake2bProofStack(ps, baseSector.slice(i, i+64))
		if (errALB !== null) {
			reportErr("unable to build merkle root of file: " + errALB)
			return
		}
	}
	let [merkleRoot, errPSR] = blake2bProofStackRoot(ps)
	if (errPSR !== null) {
		reportErr("unable to finalize merkle root of file: " + errPSR)
		return
	}

	// Compute the bitfield, given that version is 1, the offset is zero,
	// and the fetch size is at least totalSize.
	let bitfield = skylinkBitfield(totalSize)

	// Compute the skylink.
	let bLink = new Uint8Array(34)
	bLink.set(bitfield, 0)
	bLink.set(merkleRoot, 2)
	let skylink = bufToB64(bLink)

	// Create the metadata header.
	let lenPrefix1 = encodeNumber(15)
	let str1 = new TextEncoder().encode("Skyfile Backup\n")
	let lenPrefix2 = encodeNumber(7)
	let str2 = new TextEncoder().encode("v1.5.5\n")
	let lenPrefix3 = encodeNumber(46)
	let str3 = new TextEncoder().encode(skylink)
	let backupHeader = new Uint8Array(92)
	offset = 0
	backupHeader.set(lenPrefix1, offset)
	offset += 8
	backupHeader.set(str1, offset)
	offset += 15
	backupHeader.set(lenPrefix2, offset)
	offset += 8
	backupHeader.set(str2, offset)
	offset += 7
	backupHeader.set(lenPrefix3, offset)
	offset += 8
	backupHeader.set(str3, offset)

	// Set the first 92 bytes of the base sector to the backup header.
	baseSector.set(backupHeader, 0)

	// Do the POST request to /skynet/restore
	let fetchOpts = {
		method: "post",
		body: baseSector,
	}
	let endpoint = "/skynet/restore"
	progressiveFetch(endpoint, fetchOpts, ["siasky.net", "eu-ger-12.siasky.net", "dev1.siasky.dev"], null!)
	.then(output => {
		// TODO: Fix this, can't provide the output naively need to
		// instead inject the skylink.
		postMessage({
			kernelMethod: "moduleResponse",
			moduleResponse: skylink,
		})
	})
	.catch(err => {
		reportErr("progressiveFetch failed: "+err)
	})
}

// skylinkBitfield returns the 2 byte bitfield given the fetchSize. The offset
// is assumed to be zero, the version is assumed to be 1.
function skylinkBitfield(fetchSize: number): Uint8Array {
	// Determine the mode and step of the skylink.
	let mode = 7
	let step = 256
	let base = 2048
	if (fetchSize <= 2048*1024) {
		mode = 6
		step = 128
		base = 1024
	}
	if (fetchSize <= 1024*1024) {
		mode = 5
		step = 64
		base = 512
	}
	if (fetchSize <= 512*1024) {
		mode = 4
		step = 32
		base = 256
	}
	if (fetchSize <= 256*1024) {
		mode = 3
		step = 16
		base = 128
	}
	if (fetchSize <= 128*1024) {
		mode = 2
		step = 8
		base = 64
	}
	if (fetchSize <= 64*1024) {
		mode = 1
		step = 4
		base = 32
	}
	if (fetchSize <= 32*1024) {
		mode = 0
		step = 4 // Special case, step does not halve
		base = 0 // Special case, base is 0
	}
	step = step * 1024
	base = base * 1024

	// Determine the fetchSize bits.
	let fsb = 0
	for (let i = 1; i <= 8; i++) {
		if (base+(i*step) > fetchSize) {
			break
		}
		fsb++
	}

	// Build the final Uint8Array. First we slip in the 3 fsb bits, then we
	// slip in a '1' per mode, finally we slip in the 2 version bits.
	let num = fsb
	for (let i = 0; i < mode; i++) {
		num = num << 1
		num++
	}
	// Version 1 corresponds to 2 empty bits in the bottom of the bitfield.
	num = num << 2
	// Convert the num to a Uint8Array.
	let encoded = new Uint8Array(2)
	for (let i = 0; i < 2; i++) {
		let byte = num & 0xff
		encoded[i] = byte
		num = num >> 8
	}
	return encoded
}

// bufToB64 will convert a Uint8Array to a base64 string with URL encoding and
// no padding characters.
var bufToB64 = function(buf: Uint8Array): string {
	let b64Str = btoa(String.fromCharCode.apply(null, <any>buf));
	return b64Str.replace(/\+/g, "-").replace(/\//g, "_").replace(/\=/g, "");
}

// Blake2B in pure Javascript
// Adapted from the reference implementation in RFC7693
// Ported to Javascript by DC - https://github.com/dcposch
// Adapted again for the Skynet Kernel browser extension

// 64-bit unsigned addition
// Sets v[a,a+1] += v[b,b+1]
// v should be a Uint32Array
function ADD64AA (v: any, a: any, b: any) {
	const o0 = v[a] + v[b]
	let o1 = v[a + 1] + v[b + 1]
	if (o0 >= 0x100000000) {
		o1++
	}
	v[a] = o0
	v[a + 1] = o1
}

// 64-bit unsigned addition
// Sets v[a,a+1] += b
// b0 is the low 32 bits of b, b1 represents the high 32 bits
function ADD64AC (v: any, a: any, b0: any, b1: any) {
	let o0 = v[a] + b0
	if (b0 < 0) {
		o0 += 0x100000000
	}
	let o1 = v[a + 1] + b1
	if (o0 >= 0x100000000) {
		o1++
	}
	v[a] = o0
	v[a + 1] = o1
}

// Little-endian byte access
function B2B_GET32 (arr: any, i: any) {
	return arr[i] ^ (arr[i + 1] << 8) ^ (arr[i + 2] << 16) ^ (arr[i + 3] << 24)
}

// G Mixing function
// The ROTRs are inlined for speed
function B2B_G (a: any, b: any, c: any, d: any, ix: any, iy: any, m: any, v: any) {
	const x0 = m[ix]
	const x1 = m[ix + 1]
	const y0 = m[iy]
	const y1 = m[iy + 1]

	ADD64AA(v, a, b) // v[a,a+1] += v[b,b+1] ... in JS we must store a uint64 as two uint32s
	ADD64AC(v, a, x0, x1) // v[a, a+1] += x ... x0 is the low 32 bits of x, x1 is the high 32 bits

	// v[d,d+1] = (v[d,d+1] xor v[a,a+1]) rotated to the right by 32 bits
	let xor0 = v[d] ^ v[a]
	let xor1 = v[d + 1] ^ v[a + 1]
	v[d] = xor1
	v[d + 1] = xor0

	ADD64AA(v, c, d)

	// v[b,b+1] = (v[b,b+1] xor v[c,c+1]) rotated right by 24 bits
	xor0 = v[b] ^ v[c]
	xor1 = v[b + 1] ^ v[c + 1]
	v[b] = (xor0 >>> 24) ^ (xor1 << 8)
	v[b + 1] = (xor1 >>> 24) ^ (xor0 << 8)

	ADD64AA(v, a, b)
	ADD64AC(v, a, y0, y1)

	// v[d,d+1] = (v[d,d+1] xor v[a,a+1]) rotated right by 16 bits
	xor0 = v[d] ^ v[a]
	xor1 = v[d + 1] ^ v[a + 1]
	v[d] = (xor0 >>> 16) ^ (xor1 << 16)
	v[d + 1] = (xor1 >>> 16) ^ (xor0 << 16)

	ADD64AA(v, c, d)

	// v[b,b+1] = (v[b,b+1] xor v[c,c+1]) rotated right by 63 bits
	xor0 = v[b] ^ v[c]
	xor1 = v[b + 1] ^ v[c + 1]
	v[b] = (xor1 >>> 31) ^ (xor0 << 1)
	v[b + 1] = (xor0 >>> 31) ^ (xor1 << 1)
}

// Initialization Vector
const BLAKE2B_IV32 = new Uint32Array([
	0xf3bcc908,
	0x6a09e667,
	0x84caa73b,
	0xbb67ae85,
	0xfe94f82b,
	0x3c6ef372,
	0x5f1d36f1,
	0xa54ff53a,
	0xade682d1,
	0x510e527f,
	0x2b3e6c1f,
	0x9b05688c,
	0xfb41bd6b,
	0x1f83d9ab,
	0x137e2179,
	0x5be0cd19
])

const SIGMA8 = [
	0,
	1,
	2,
	3,
	4,
	5,
	6,
	7,
	8,
	9,
	10,
	11,
	12,
	13,
	14,
	15,
	14,
	10,
	4,
	8,
	9,
	15,
	13,
	6,
	1,
	12,
	0,
	2,
	11,
	7,
	5,
	3,
	11,
	8,
	12,
	0,
	5,
	2,
	15,
	13,
	10,
	14,
	3,
	6,
	7,
	1,
	9,
	4,
	7,
	9,
	3,
	1,
	13,
	12,
	11,
	14,
	2,
	6,
	5,
	10,
	4,
	0,
	15,
	8,
	9,
	0,
	5,
	7,
	2,
	4,
	10,
	15,
	14,
	1,
	11,
	12,
	6,
	8,
	3,
	13,
	2,
	12,
	6,
	10,
	0,
	11,
	8,
	3,
	4,
	13,
	7,
	5,
	15,
	14,
	1,
	9,
	12,
	5,
	1,
	15,
	14,
	13,
	4,
	10,
	0,
	7,
	6,
	3,
	9,
	2,
	8,
	11,
	13,
	11,
	7,
	14,
	12,
	1,
	3,
	9,
	5,
	0,
	15,
	4,
	8,
	6,
	2,
	10,
	6,
	15,
	14,
	9,
	11,
	3,
	0,
	8,
	12,
	2,
	13,
	7,
	1,
	4,
	10,
	5,
	10,
	2,
	8,
	4,
	7,
	6,
	1,
	5,
	15,
	11,
	9,
	14,
	3,
	12,
	13,
	0,
	0,
	1,
	2,
	3,
	4,
	5,
	6,
	7,
	8,
	9,
	10,
	11,
	12,
	13,
	14,
	15,
	14,
	10,
	4,
	8,
	9,
	15,
	13,
	6,
	1,
	12,
	0,
	2,
	11,
	7,
	5,
	3
]

// These are offsets into a uint64 buffer.
// Multiply them all by 2 to make them offsets into a uint32 buffer,
// because this is Javascript and we don't have uint64s
const SIGMA82 = new Uint8Array(
	SIGMA8.map(function (x) {
		return x * 2
	})
)

// Compression function. 'last' flag indicates last block.
// Note we're representing 16 uint64s as 32 uint32s
function blake2bCompress (ctx: any, last: any) {
	const v = new Uint32Array(32)
	const m = new Uint32Array(32)
	let i = 0

	// init work variables
	for (i = 0; i < 16; i++) {
		v[i] = ctx.h[i]
		v[i + 16] = BLAKE2B_IV32[i]
	}

	// low 64 bits of offset
	v[24] = v[24] ^ ctx.t
	v[25] = v[25] ^ (ctx.t / 0x100000000)
	// high 64 bits not supported, offset may not be higher than 2**53-1

	// last block flag set ?
	if (last) {
		v[28] = ~v[28]
		v[29] = ~v[29]
	}

	// get little-endian words
	for (i = 0; i < 32; i++) {
		m[i] = B2B_GET32(ctx.b, 4 * i)
	}

	// twelve rounds of mixing
	// uncomment the DebugPrint calls to log the computation
	// and match the RFC sample documentation
	for (i = 0; i < 12; i++) {
		B2B_G(0, 8, 16, 24, SIGMA82[i * 16 + 0], SIGMA82[i * 16 + 1], m, v)
		B2B_G(2, 10, 18, 26, SIGMA82[i * 16 + 2], SIGMA82[i * 16 + 3], m, v)
		B2B_G(4, 12, 20, 28, SIGMA82[i * 16 + 4], SIGMA82[i * 16 + 5], m, v)
		B2B_G(6, 14, 22, 30, SIGMA82[i * 16 + 6], SIGMA82[i * 16 + 7], m, v)
		B2B_G(0, 10, 20, 30, SIGMA82[i * 16 + 8], SIGMA82[i * 16 + 9], m, v)
		B2B_G(2, 12, 22, 24, SIGMA82[i * 16 + 10], SIGMA82[i * 16 + 11], m, v)
		B2B_G(4, 14, 16, 26, SIGMA82[i * 16 + 12], SIGMA82[i * 16 + 13], m, v)
		B2B_G(6, 8, 18, 28, SIGMA82[i * 16 + 14], SIGMA82[i * 16 + 15], m, v)
	}

	for (i = 0; i < 16; i++) {
		ctx.h[i] = ctx.h[i] ^ v[i] ^ v[i + 16]
	}
}

// Creates a BLAKE2b hashing context
// Requires an output length between 1 and 64 bytes
function blake2bInit () {
	// state, 'param block'
	const ctx = {
		b: new Uint8Array(128),
		h: new Uint32Array(16),
		t: 0, // input count
		c: 0, // pointer within buffer
		outlen: 32 // output length in bytes
	}

	// initialize hash state
	for (let i = 0; i < 16; i++) {
		ctx.h[i] = BLAKE2B_IV32[i]
	}
	ctx.h[0] ^= 0x01010000 ^ 32
	return ctx
}

// Updates a BLAKE2b streaming hash
// Requires hash context and Uint8Array (byte array)
function blake2bUpdate (ctx: any, input: any) {
	for (let i = 0; i < input.length; i++) {
		if (ctx.c === 128) {
			// buffer full ?
			ctx.t += ctx.c // add counters
			blake2bCompress(ctx, false) // compress (not last)
			ctx.c = 0 // counter to zero
		}
		ctx.b[ctx.c++] = input[i]
	}
}

// Completes a BLAKE2b streaming hash
// Returns a Uint8Array containing the message digest
function blake2bFinal (ctx: any) {
	ctx.t += ctx.c // mark last block offset

	while (ctx.c < 128) {
		// fill up with zeros
		ctx.b[ctx.c++] = 0
	}
	blake2bCompress(ctx, true) // final block flag = 1

	// little endian convert and store
	const out = new Uint8Array(ctx.outlen)
	for (let i = 0; i < ctx.outlen; i++) {
		out[i] = ctx.h[i >> 2] >> (8 * (i & 3))
	}
	return out
}

// Computes the blake2b hash of the input. Returns 32 bytes.
var blake2b = function(input: Uint8Array): Uint8Array {
	const ctx = blake2bInit()
	blake2bUpdate(ctx, input)
	return blake2bFinal(ctx)
}
// progressiveFetchResult defines the type returned by progressiveFetch.
//
// TODO: Do something more intelligent with the repsonse
interface progressiveFetchResult {
	portal: string;
	response: string; // TODO: Should be 'Response' but thats not cloneable.
	remainingPortals: string[];
	first4XX: progressiveFetchResult;
}

// progressiveFetch will query multiple portals until one returns with a
// non-error response. In the event of a 4XX response, progressiveFetch will
// keep querying additional portals to try and find a working 2XX response. In
// the event that no working 2XX response is found, the first 4XX response will
// be returned.
//
// This introduces significant latency overheads, especially for 404 responses.
// Future updates to this function could handle 404 responses by looking at a
// bunch of host signatures to be confident in the portal's response rather
// than going on and asking a bunch more portals.
//
// The reason that we don't blindly accept a 4XX response from a portal is that
// we have no way of verifying that the 4XX is legitimate. We don't trust the
// portal, and we can't give a rogue portal the opportunity to interrupt our
// user experience simply by returning a dishonest 404. So we need to keep
// querying more portals and gain confidence that the 404 a truthful response.
var progressiveFetch = function(endpoint: string, fetchOpts: any, remainingPortals: string[], first4XX: progressiveFetchResult): Promise<progressiveFetchResult> {
	return new Promise((resolve, reject) => {
		// If we run out of portals and there's no 4XX response, return
		// an error.
		if (!remainingPortals.length && first4XX == null) {
			reject("no portals remaining")
			return
		}
		// If we run out of portals but there is a first 4XX response,
		// return the 4XX response.
		if (!remainingPortals.length) {
			resolve(first4XX)
			return
		}

		// Grab the portal and query.
		let portal = <any>remainingPortals.shift()
		let query = "https://" + portal + endpoint

		// Define a helper function to try the next portal in the event
		// of an error, then perform the fetch.
		let nextPortal = function() {
			progressiveFetch(endpoint, fetchOpts, remainingPortals, first4XX)
			.then(output => resolve(output))
			.catch(err => reject(err))
		}
		fetch(query, fetchOpts)
		.then(response => {
			// Check for a 5XX error.
			if (!("status" in response) || typeof(response.status) !== "number") {
				nextPortal()
				return
			}
			if (response.status >= 500 && response.status < 600) {
				nextPortal()
				return
			}
			// Special handling for 4XX. If we already have a
			// 'first4XX', we treat this call similarly to the 5XX
			// calls. If we don't yet have a 4XX, we need to create
			// a progressiveFetchResult object that serves as our
			// first 4XX and pass that to our next call to
			// progressiveFetch.
			if (response.status >= 400 && response.status < 500) {
				if (first4XX !== null) {
					nextPortal()
					return
				}

				// Define 'new4XX' as our first4XX response can
				// call progressiveFetch.
				// 
				let new4XX = {
					portal,
					response: "4xx",
					remainingPortals,
					first4XX: null,
				}
				progressiveFetch(endpoint, fetchOpts, remainingPortals, <any>new4XX)
				.then(output => resolve(output))
				.catch(err => reject(err))
			}

			// Success! Resolve the response.
			resolve({
				portal,
				response: "success",
				remainingPortals,
				first4XX,
			})
		})
		.catch((err) => {
			// This portal failed, try again with the next portal.
			nextPortal()
		})
	})
}
