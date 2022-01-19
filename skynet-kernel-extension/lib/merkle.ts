// verifyBlake2bSectorRangeProof will verify a merkle proof that the provided
// data exists within the provided sector at the provided range.
var verifyBlake2bSectorRangeProof = function(root: Uint8Array, data: Uint8Array, rangeStart: number, rangeEnd: number, proof: Uint8Array): Error {
	// Verify the inputs.
	if (root.length !== 32) {
		return new Error("provided root is not a blake2b sector root")
	}
	if (rangeEnd <= rangeStart) {
		return new Error("provided has no data")
	}
	if (rangeStart < 0) {
		return new Error("cannot use negative ranges")
	}
	if (rangeEnd > 4194304) {
		return new Error("range is out of bounds")
	}
	if (proof.length % 32 !== 0) {
		return new Error("merkle proof has invalid length")
	}
	if (data.length !== rangeEnd - rangeStart) {
		return new Error("data length does not match provided range")
	}

	// TODO: Finish the verification.

	return null
}
