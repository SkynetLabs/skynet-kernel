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

export { dataFn, errFn, error, errTuple }
