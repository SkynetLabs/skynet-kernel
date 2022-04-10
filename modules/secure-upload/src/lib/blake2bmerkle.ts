import { blake2b } from "./blake2b"

// blake2bProofStack is an abstraction for an in-progress Merkle tree. You need
// at most one object in memory per height of the tree, otherwise objects can
// be combined.
//
// The elements of the blake2bProofStack are both arrays, these arrays need to
// stay the same length. We could enforce this more formally by making another
// interface, but at least for now we've chosen to minimize the total number of
// types instead.
interface blake2bProofStack {
	subtreeRoots: Uint8Array[]
	subtreeHeights: number[]
}

// addLeafBytesToBlake2bProofStack will add a leaf to a proof stack.
export function addLeafBytesToBlake2bProofStack(ps: blake2bProofStack, leafBytes: Uint8Array): Error {
	if (leafBytes.length !== 64) {
		let strBytes = leafBytes.length.toString()
		return new Error("blake2bProofStack expects leafByte objects to be exactly 64 bytes: " + strBytes)
	}
	let taggedBytes = new Uint8Array(65)
	taggedBytes.set(leafBytes, 1)
	let subtreeRoot = blake2b(taggedBytes)
	return addSubtreeToBlake2bProofStack(ps, subtreeRoot, 1)
}

// blake2bProofStackRoot returns the final Merkle root of the data in the
// current proof stack.
export function blake2bProofStackRoot(ps: blake2bProofStack): [Uint8Array, Error] {
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

// addSubtreeToBlake2bProofStack will add a subtree to a proof stack.
function addSubtreeToBlake2bProofStack(ps: blake2bProofStack, subtreeRoot: Uint8Array, subtreeHeight: number): Error {
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
	let maxHeight = ps.subtreeHeights[ps.subtreeHeights.length - 1]
	if (subtreeHeight > maxHeight) {
		return new Error(
			`cannot add a subtree that is taller ${subtreeHeight} than the smallest ${maxHeight} subtree in the stack`
		)
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
	return addSubtreeToBlake2bProofStack(ps, newSubtreeRoot, subtreeHeight + 1)
}
