// Helper consts that make it easier to return empty values when returning an
// error inside of a function.
const nu8 = new Uint8Array(0)

// parseSkylinkBitfield parses a skylink bitfield and returns the corresponding
// version, offset, and fetchSize.
function parseSkylinkBitfield(skylink: Uint8Array): [bigint, bigint, bigint, string | null] {
	// Validate the input.
	if (skylink.length !== 34) {
		return [0n, 0n, 0n, "provided skylink has incorrect length"]
	}

	// Extract the bitfield.
	let bitfield = new DataView(skylink.buffer).getUint16(0, true)

	// Extract the version.
	let version = (bitfield & 3) + 1
	// Only versions 1 and 2 are recognized.
	if (version !== 1 && version !== 2) {
		return [0n, 0n, 0n, "provided skylink has unrecognized version"]
	}

	// If the skylink is set to version 2, we only recognize the link if
	// the rest of the bits in the bitfield are empty.
	if (version === 2) {
		if ((bitfield & 3) !== bitfield) {
			return [0n, 0n, 0n, "provided skylink has unrecognized version"]
		}
		return [BigInt(version), 0n, 0n, null]
	}

	// Verify that the mode is valid, then fetch the mode.
	bitfield = bitfield >> 2
	if ((bitfield & 255) === 255) {
		return [0n, 0n, 0n, "provided skylink has an unrecognized version"]
	}
	let mode = 0
	for (let i = 0; i < 8; i++) {
		if ((bitfield & 1) === 0) {
			bitfield = bitfield >> 1
			break
		}
		bitfield = bitfield >> 1
		mode++
	}
	// If the mode is greater than 7, this is not a valid v1 skylink.
	if (mode > 7) {
		return [0n, 0n, 0n, "provided skylink has an invalid v1 bitfield"]
	}

	// Determine the offset and fetchSize increment.
	let offsetIncrement = 4096 << mode
	let fetchSizeIncrement = 4096
	let fetchSizeStart = 0
	if (mode > 0) {
		fetchSizeIncrement = fetchSizeIncrement << (mode - 1)
		fetchSizeStart = (1 << 15) << (mode - 1)
	}

	// The next three bits decide the fetchSize.
	let fetchSizeBits = bitfield & 7
	fetchSizeBits++ // semantic upstep, range should be [1,8] not [0,8).
	let fetchSize = fetchSizeBits * fetchSizeIncrement + fetchSizeStart
	bitfield = bitfield >> 3

	// The remaining bits determine the offset.
	let offset = bitfield * offsetIncrement
	if (offset + fetchSize > 1 << 22) {
		return [0n, 0n, 0n, "provided skylink has an invalid v1 bitfield"]
	}

	// Return what we learned.
	return [BigInt(version), BigInt(offset), BigInt(fetchSize), null]
}

// skylinkV1Bitfield sets the bitfield of a V1 skylink. It assumes the version
// is 1 and the offset is 0. It will determine the appropriate fetchSize from
// the provided dataSize.
function skylinkV1Bitfield(dataSizeBI: bigint): [Uint8Array, string | null] {
	// Check that the dataSize is not too large.
	if (dataSizeBI > 1 << 22) {
		return [nu8, "dataSize must be less than the sector size"]
	}
	let dataSize = Number(dataSizeBI)

	// Determine the mode for the file. The mode is determined by the
	// dataSize.
	let mode = 0
	for (let i = 1 << 15; i < dataSize; i *= 2) {
		mode += 1
	}
	// Determine the download number.
	let downloadNumber = 0
	if (mode === 0) {
		if (dataSize !== 0) {
			downloadNumber = Math.floor((dataSize - 1) / (1 << 12))
		}
	} else {
		let step = 1 << (11 + mode)
		let target = dataSize - (1 << (14 + mode))
		if (target !== 0) {
			downloadNumber = Math.floor((target - 1) / step)
		}
	}

	// Create the Uint8Array and fill it out. The main reason I switch over
	// the 7 modes like this is because I wasn't sure how to make a uint16
	// in javascript. If we could treat the uint8array as a uint16 and then
	// later convert it over, we could use basic bitshifiting and really
	// simplify the code here.
	let bitfield = new Uint8Array(2)
	if (mode === 7) {
		// 0 0 0 X X X 0 1|1 1 1 1 1 1 0 0
		bitfield[0] = downloadNumber
		bitfield[0] *= 4
		bitfield[0] += 1
		bitfield[1] = 4 + 8 + 16 + 32 + 64 + 128
	}
	if (mode === 6) {
		// 0 0 0 0 X X X 0|1 1 1 1 1 1 0 0
		bitfield[0] = downloadNumber
		bitfield[0] *= 2
		bitfield[1] = 4 + 8 + 16 + 32 + 64 + 128
	}
	if (mode === 5) {
		// 0 0 0 0 0 X X X|0 1 1 1 1 1 0 0
		bitfield[0] = downloadNumber
		bitfield[1] = 4 + 8 + 16 + 32 + 64
	}
	if (mode === 4) {
		// 0 0 0 0 0 0 X X|X 0 1 1 1 1 0 0
		bitfield[0] = downloadNumber
		bitfield[0] /= 2
		bitfield[1] = (downloadNumber & 1) * 128
		bitfield[1] += 4 + 8 + 16 + 32
	}
	if (mode === 3) {
		// 0 0 0 0 0 0 0 X|X X 0 1 1 1 0 0
		bitfield[0] = downloadNumber
		bitfield[0] /= 4
		bitfield[1] = (downloadNumber & 3) * 64
		bitfield[1] += 4 + 8 + 16
	}
	if (mode === 2) {
		// 0 0 0 0 0 0 0 0|X X X 0 1 1 0 0
		bitfield[0] = 0
		bitfield[1] = downloadNumber * 32
		bitfield[1] += 4 + 8
	}
	if (mode === 1) {
		// 0 0 0 0 0 0 0 0|0 X X X 0 1 0 0
		bitfield[0] = 0
		bitfield[1] = downloadNumber * 16
		bitfield[1] += 4
	}
	if (mode === 0) {
		// 0 0 0 0 0 0 0 0|0 0 X X X 0 0 0
		bitfield[0] = 0
		bitfield[1] = downloadNumber * 8
	}

	// Swap the byte order.
	let zero = bitfield[0]
	bitfield[0] = bitfield[1]
	bitfield[1] = zero

	return [bitfield, null]
}

export { parseSkylinkBitfield, skylinkV1Bitfield }
