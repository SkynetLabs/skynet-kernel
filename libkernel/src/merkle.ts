import { blake2b } from "./blake2b.js"
import { addContextToErr } from "./err.js"

// proofStack is an abstraction for an in-progress Merkle tree. You need at
// most one object in memory per height of the tree, otherwise objects can be
// combined.
//
// The elements of the proofStack are both arrays, these arrays need to stay
// the same length. We could enforce this more formally by making another
// interface, but at least for now we've chosen to minimize the total number of
// types instead.
interface proofStack {
	subtreeRoots: Uint8Array[]
	subtreeHeights: bigint[]
}

// Helper values for cleanly returning errors.
const nu8 = new Uint8Array(0)

// blake2bAddSubtreeToProofStack will add a subtree to a proof stack.
function blake2bAddSubtreeToProofStack(ps: proofStack, subtreeRoot: Uint8Array, subtreeHeight: bigint): string | null {
	// Input checking.
	if (subtreeRoot.length !== 32) {
		return "cannot add subtree because root is wrong length"
	}

	// If the proofStack has no elements in it yet, add the subtree
	// with no further checks.
	if (ps.subtreeRoots.length === 0) {
		ps.subtreeRoots.push(subtreeRoot)
		ps.subtreeHeights.push(subtreeHeight)
		return null
	}

	// Check the height of the new subtree against the height of the smallest
	// subtree in the proofStack. If the new subtree is larger, the subtree
	// cannot be added.
	let maxHeight = ps.subtreeHeights[ps.subtreeHeights.length - 1]
	if (subtreeHeight > maxHeight) {
		return `cannot add a subtree that is taller ${subtreeHeight} than the smallest ${maxHeight} subtree in the stack`
	}

	// If the new subtreeHeight is smaller than the max height, we can just
	// append the subtree height without doing anything more.
	if (subtreeHeight < maxHeight) {
		ps.subtreeRoots.push(subtreeRoot)
		ps.subtreeHeights.push(subtreeHeight)
		return null
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
	return blake2bAddSubtreeToProofStack(ps, newSubtreeRoot, subtreeHeight + 1n)
}

// blake2bAddLeafBytesToProofStack will add a leaf to a proof stack.
function blake2bAddLeafBytesToProofStack(ps: proofStack, leafBytes: Uint8Array): string | null {
	if (leafBytes.length !== 64) {
		return "proofStack expects leafByte objects to be exactly 64 bytes"
	}
	let taggedBytes = new Uint8Array(65)
	taggedBytes.set(leafBytes, 1)
	let subtreeRoot = blake2b(taggedBytes)
	return blake2bAddSubtreeToProofStack(ps, subtreeRoot, 1n)
}

// blake2bProofStackRoot returns the final Merkle root of the data in the
// current proof stack.
function blake2bProofStackRoot(ps: proofStack): [Uint8Array, string | null] {
	// Input checking.
	if (ps.subtreeRoots.length === 0) {
		return [nu8, "cannot compute the Merkle root of an empty data set"]
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
	return [baseSubtreeRoot, null]
}

// nextSubtreeHeight returns the height of the largest subtree that contains
// 'start', contains no elements prior to 'start', and also does not contain
// 'end'.
function nextSubtreeHeight(start: bigint, end: bigint): [bigint, bigint, string | null] {
	// Input checking.
	if (end <= start) {
		return [0n, 0n, `end (${end}) must be strictly larger than start (${start})`]
	}

	// Merkle trees have a nice mathematical property that the largest tree
	// which contains a particular node and no nodes prior to it will have
	// a height that is equal to the number of trailing zeroes in the base
	// 2 representation of the index of that node.
	//
	// We are exploiting that property to compute the 'idealTreeHeight'. If
	// 'start' is zero, the ideal tree height will just keep counting up
	// forever, so we cut it off at 53.
	let idealTreeHeight = 1n
	let idealTreeSize = 1n
	// The conditional inside the loop tests if the next ideal tree size is
	// acceptable. If it is, we increment the height and double the size.
	while (start % (idealTreeSize * 2n) === 0n) {
		idealTreeHeight++
		idealTreeSize = idealTreeSize * 2n
	}
	// To compute the max tree height, we essentially just find the largest
	// power of 2 that is smaller than or equal to the gap between start
	// and end.
	let maxTreeHeight = 1n
	let maxTreeSize = 1n
	let range = end - start + 1n
	while (maxTreeSize * 2n < range) {
		maxTreeHeight++
		maxTreeSize = maxTreeSize * 2n
	}

	// Return the smaller of the ideal height and the max height, as each
	// of them is an upper bound on how large things are allowed to be.
	if (idealTreeHeight < maxTreeHeight) {
		return [idealTreeHeight, idealTreeSize, null]
	}
	return [maxTreeHeight, maxTreeSize, null]
}

// blake2bMerkleRoot computes the merkle root of the provided data using a leaf
// size of 64 bytes and blake2b as the hashing function.
function blake2bMerkleRoot(data: Uint8Array): [Uint8Array, string | null] {
	// Check that the input is an acceptable length.
	if (data.length % 64 !== 0) {
		return [nu8, "cannot take the merkle root of data that is not a multiple of 64 bytes"]
	}

	// Compute the Merkle root.
	let ps = {
		subtreeRoots: <Uint8Array[]>[],
		subtreeHeights: <bigint[]>[],
	}
	for (let i = 0; i < data.length; i += 64) {
		blake2bAddLeafBytesToProofStack(ps, data.slice(i, i + 64))
	}
	return blake2bProofStackRoot(ps)
}

// blake2bVerifySectorRangeProof will verify a merkle proof that the provided
// data exists within the provided sector at the provided range.
//
// NOTE: This implementation only handles a single range, but the transition to
// doing mulit-range proofs is not very large. The main reason I didn't extend
// this function was because it made the inputs a lot messier. The Sia merkle
// tree repo uses the same techniques and has the full implementation, use that
// as a reference if you need to extend this function to support multi-range
// proofs.
function blake2bVerifySectorRangeProof(
	root: Uint8Array,
	data: Uint8Array,
	rangeStart: bigint,
	rangeEnd: bigint,
	proof: Uint8Array
): string | null {
	// Verify the inputs.
	if (root.length !== 32) {
		return "provided root is not a blake2b sector root"
	}
	if (rangeEnd <= rangeStart) {
		return "provided has no data"
	}
	if (rangeStart < 0n) {
		return "cannot use negative ranges"
	}
	if (rangeEnd > 4194304n) {
		return "range is out of bounds"
	}
	if (proof.length % 32 !== 0) {
		return "merkle proof has invalid length"
	}
	if (data.length !== Number(rangeEnd - rangeStart)) {
		return "data length does not match provided range"
	}
	if (data.length % 64 !== 0) {
		return "data must have a multiple of 64 bytes"
	}

	// We will consume proof elements until we get to the rangeStart of the
	// data.
	let ps = {
		subtreeRoots: <Uint8Array[]>[],
		subtreeHeights: <bigint[]>[],
	}
	let currentOffset = 0n
	let proofOffset = 0
	while (currentOffset < rangeStart) {
		if (proof.length < proofOffset + 32) {
			return "merkle proof has insufficient data"
		}
		let [height, size, errNST] = nextSubtreeHeight(currentOffset / 64n, rangeStart / 64n)
		if (errNST !== null) {
			return addContextToErr(errNST, "error computing subtree height of initial proof stack")
		}
		let newSubtreeRoot = new Uint8Array(32)
		newSubtreeRoot.set(proof.slice(proofOffset, proofOffset + 32), 0)
		proofOffset += 32
		let errSPS = blake2bAddSubtreeToProofStack(ps, newSubtreeRoot, height)
		if (errSPS !== null) {
			return addContextToErr(errSPS, "error adding subtree to initial proof stack")
		}
		currentOffset += size * 64n
	}

	// We will consume data elements until we get to the end of the data.
	let dataOffset = 0
	while (data.length > dataOffset) {
		let errLBPS = blake2bAddLeafBytesToProofStack(ps, data.slice(dataOffset, dataOffset + 64))
		if (errLBPS !== null) {
			return addContextToErr(errLBPS, "error adding leaves to proof stack")
		}
		dataOffset += 64
		currentOffset += 64n
	}

	// Consume proof elements until the entire sector is proven.
	let sectorEnd = 4194304n
	while (currentOffset < sectorEnd) {
		if (proof.length < proofOffset + 32) {
			return "merkle proof has insufficient data"
		}
		let [height, size, errNST] = nextSubtreeHeight(currentOffset / 64n, sectorEnd / 64n)
		if (errNST !== null) {
			return addContextToErr(errNST, "error computing subtree height of trailing proof stack")
		}
		let newSubtreeRoot = new Uint8Array(32)
		newSubtreeRoot.set(proof.slice(proofOffset, proofOffset + 32), 0)
		proofOffset += 32
		let errSPS = blake2bAddSubtreeToProofStack(ps, newSubtreeRoot, height)
		if (errSPS !== null) {
			return addContextToErr(errSPS, "error adding subtree to trailing proof stack")
		}
		currentOffset += size * 64n
	}
	return null
}

export { blake2bAddLeafBytesToProofStack, blake2bMerkleRoot, blake2bProofStackRoot, blake2bVerifySectorRangeProof }
