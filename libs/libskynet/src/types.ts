// dataFn can take any object as input and has no return value. The input is
// allowed to be undefined.
type dataFn = (data?: any) => void

// error is an error type that is either a string or a null. If the value is
// null, that indicates that there was no error. If the value is a string, it
// indicates that there was an error and the string contains the error message.
//
// The skynet libraries prefer this error type to the standard Error type
// because many times skynet libraries need to pass errors over postMessage,
// and the 'Error' type is not able to be sent over postMessage.
type error = string | null

// errFn must take an error message as input. The input is not allowed to be
// undefined or null, there must be an error.
type errFn = (errMsg: string) => void

// errTuple is a type that pairs a 'data' field with an 'err' field. Skynet
// libraries typically prefer returning errTuples to throwing or rejecting,
// because it allows upstream code to avoid the try/catch/throw pattern. Though
// the pattern is much celebrated in javascript, it encourages relaxed error
// handling, and often makes error handling much more difficult because the try
// and the catch are in different scopes.
//
// Most of the Skynet core libraries do not have any `throws` anywhere in their
// API.
//
// Typically, an errTuple will have only one field filled out. If data is
// returned, the err should be 'null'. If an error is returned, the data field
// should generally be empty. Callers are expected to check the error before
// they access any part of the data field.
type errTuple = [data: any, err: error]

// kernelAuthStatus is the structure of a message that gets sent by the kernel
// containing its auth status. Auth occurs in 5 stages.
//
// Stage 0; no auth updates
// Stage 1: bootloader is loaded, user is not yet logged in
// Stage 2: bootloader is loaded, user is logged in
// Stage 3: kernel is loaded, user is logged in
// Stage 4: kernel is loaded, user is logging out (refresh iminent)
//
// 'kernelLoaded' is initially set to "not yet" and will be updated when the
// kernel has loaded. If it is set to "success", it means the kernel loaded
// without issues. If it is set to anything else, it means that there was an
// error, and the new value is the error.
//
// 'kernelLoaded' will not be changed until 'loginComplete' has been set to
// true. 'loginComplete' can be set to true immediately if the user is already
// logged in.
//
// 'logoutComplete' can be set to 'true' at any point, which indicates that the
// auth cycle needs to reset.
interface kernelAuthStatus {
	loginComplete: boolean
	kernelLoaded: string
	logoutComplete: boolean
}

// requestOverrideResponse defines the type that the kernel returns as a
// response to a requestOverride call.
interface requestOverrideResponse {
	override: boolean
	headers?: any // TODO: I don't know how to do an array of types.
	body?: Uint8Array
}

export { dataFn, errFn, error, errTuple, kernelAuthStatus, requestOverrideResponse }
