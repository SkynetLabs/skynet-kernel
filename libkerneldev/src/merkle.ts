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

// Helper values for cleanly returning errors.
const nu8 = new Uint8Array(0)

// addSubtreeToBlake2bProofStack will add a subtree to a proof stack.
function addSubtreeToBake2bProofStack(ps: blake2bProofStack, subtreeRoot: Uint8Array, subtreeHeight: number): Error {
	// Input checking.
	if (subtreeRoot.length !== 32) {
		return new Error("cannot add subtree because root is wrong length")
	}

	// If the blake2bProofStack has no elements in it yet, add the subtree
	// with no further checks.
	if (ps.subtreeRoots.length === 0) {
		ps.subtreeRoots.push(subtreeRoot)
		ps.subtreeHeights.push(subtreeHeight)
		return null
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
		return null
	}

	// If the new subtree is the same height as the smallest subtree, we
	// have to pull the smallest subtree out, combine it with the new
	// subtree, and push the result.
	let oldSTR = ps.subtreeRoots.pop()
	ps.subtreeHeights.pop() // We already have the height.
	let combinedRoot = new Uint8Array(65)
	combinedRoot[0] = 1
	combinedRoot.set(oldSTR, 1)
	combinedRoot.set(subtreeRoot, 33)
	let newSubtreeRoot = blake2b(combinedRoot)
	return addSubtreeToBlake2bProofStack(ps, newSubtreeRoot, subtreeHeight+1)
}

// addLeafBytesToBlake2bProofStack will add a leaf to a proof stack.
function addLeafBytesToBlake2bProofStack(ps: blake2bProofStack, leafBytes: Uint8Array): string | null {
	if (leafBytes.length !== 64) {
		return new Error("blake2bProofStack expects leafByte objects to be exactly 64 bytes")
	}
	let taggedBytes = new Uint8Array(65)
	taggedBytes.set(leafBytes, 1)
	let subtreeRoot = blake2b(taggedBytes)
	return addSubtreeToBlake2bProofStack(ps, subtreeRoot, 1)
}

// blake2bProofStackRoot returns the final Merkle root of the data in the
// current proof stack.
function blake2bProofStackRoot(ps: blake2bProofStack): [Uint8Array, string | null] {
	// Input checking.
	if (ps.subtreeRoots.length === 0) {
		return [nu8, "cannot compute the Merkle root of an empty data set"]
	}

	// Algorithm is pretty basic, start with the final tree, and then add
	// it to the previous tree. Repeat until there are no more trees.
	let baseSubtreeRoot = ps.subtreeRoots.pop()
	while (ps.subtreeRoots.length !== 0) {
		let nextSubtreeRoot = ps.subtreeRoots.pop()
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
function nextSubtreeHeight(start: number, end: number): [number, number, Error] {
	// Input checking. We don't want start or end to be larger than 2^52
	// because they start to lose precision.
	let largestAllowed = 4500000000000000
	if (start > largestAllowed || end > largestAllowed) {
		return [0, 0, new Error(`this library cannot work with Merkle trees that large (expected ${largestAllowed}, got ${start} and ${end}`)]
	}
	if (end <= start) {
		return [0, 0, new Error(`end (${end}) must be strictly larger than start (${start})`)]
	}

	// Merkle trees have a nice mathematical property that the largest tree
	// which contains a particular node and no nodes prior to it will have
	// a height that is equal to the number of trailing zeroes in the base
	// 2 representation of the index of that node.
	//
	// We are exploiting that property to compute the 'idealTreeHeight'. If
	// 'start' is zero, the ideal tree height will just keep counting up
	// forever, so we cut it off at 53.
	let idealTreeHeight = 1
	let idealTreeSize = 1
	// The conditional inside the loop tests if the next ideal tree size is
	// acceptable. If it is, we increment the height and double the size.
	while (start % (idealTreeSize*2) === 0 && idealTreeHeight < 53) {
		idealTreeHeight++
		idealTreeSize = idealTreeSize * 2
	}
	// To compute the max tree height, we essentially just find the largest
	// power of 2 that is smaller than or equal to the gap between start
	// and end.
	let maxTreeHeight = 1
	let maxTreeSize = 1
	let range = (end-start) + 1
	while (maxTreeSize*2 < range) {
		maxTreeHeight++
		maxTreeSize = maxTreeSize * 2
	}

	// Return the smaller of the ideal height and the max height, as each
	// of them is an upper bound on how large things are allowed to be.
	if (idealTreeHeight < maxTreeHeight) {
		return [idealTreeHeight, idealTreeSize, null]
	}
	return [maxTreeHeight, maxTreeSize, null]
}

// verifyBlake2bSectorRangeProof will verify a merkle proof that the provided
// data exists within the provided sector at the provided range.
//
// NOTE: This implementation only handles a single range, but the transition to
// doing mulit-range proofs is not very large. The main reason I didn't extend
// this function was because it made the inputs a lot messier. The Sia merkle
// tree repo uses the same techniques and has the full implementation, use that
// as a reference if you need to extend this function to support multi-range
// proofs.
function verifyBlake2bSectorRangeProof(root: Uint8Array, data: Uint8Array, rangeStart: number, rangeEnd: number, proof: Uint8Array): Error {
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
	if (data.length % 64 !== 0) {
		return new Error("data must have a multiple of 64 bytes")
	}

	// We will consume proof elements until we get to the rangeStart of the
	// data.
	let ps = {
		subtreeRoots: <Uint8Array[]>[],
		subtreeHeights: <number[]>[],
	}
	let currentOffset = 0
	let proofOffset = 0
	while (currentOffset < rangeStart) {
		if (proof.length < proofOffset+32) {
			return new Error("merkle proof has insufficient data")
		}
		let [height, size, errNST] = nextSubtreeHeight(currentOffset/64, rangeStart/64)
		if (errNST !== null) {
			return addContextToErr(errNST, "error computing subtree height of initial proof stack")
		}
		let newSubtreeRoot = new Uint8Array(32)
		newSubtreeRoot.set(proof.slice(proofOffset, proofOffset+32), 0)
		proofOffset += 32
		let errSPS = addSubtreeToBlake2bProofStack(ps, newSubtreeRoot, height)
		if (errSPS !== null) {
			return addContextToErr(errSPS, "error adding subtree to initial proof stack")
		}
		currentOffset += (size*64)
	}

	// We will consume data elements until we get to the end of the data.
	let dataOffset = 0
	while (data.length > dataOffset) {
		let errLBPS = addLeafBytesToBlake2bProofStack(ps, data.slice(dataOffset, dataOffset+64))
		if (errLBPS !== null) {
			return addContextToErr(errLBPS, "error adding leaves to proof stack")
		}
		dataOffset += 64
		currentOffset += 64
	}

	// Consume proof elements until the entire sector is proven.
	let sectorEnd = 4194304
	while (currentOffset < sectorEnd) {
		if (proof.length < proofOffset+32) {
			return new Error("merkle proof has insufficient data")
		}
		let [height, size, errNST] = nextSubtreeHeight(currentOffset/64, sectorEnd/64)
		if (errNST !== null) {
			return addContextToErr(errNST, "error computing subtree height of trailing proof stack")
		}
		let newSubtreeRoot = new Uint8Array(32)
		newSubtreeRoot.set(proof.slice(proofOffset, proofOffset+32), 0)
		proofOffset += 32
		let errSPS = addSubtreeToBlake2bProofStack(ps, newSubtreeRoot, height)
		if (errSPS !== null) {
			return addContextToErr(errSPS, "error adding subtree to trailing proof stack")
		}
		currentOffset += (size*64)
	}
	return null
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
		subtreeHeights: <number[]>[],
	}
	for (let i = 0; i < data.length; i += 64) {
		addLeafBytesToBlake2bProofStack(ps, data.slice(i, i+64))
	}
	return blake2bProofStackRoot(ps)
}
