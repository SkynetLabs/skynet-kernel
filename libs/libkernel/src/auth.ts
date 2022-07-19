import { init, kernelAuthLocation, kernelLoadedPromise, loginPromise, logoutPromise } from "./queries.js"
import { Err } from "libskynet"

// There are 5 stages of auth.
//
// Stage 0: Bootloader is not loaded.
// Stage 1: Bootloader is loaded, user is not logged in.
// Stage 2: Bootloader is loaded, user is logged in.
// Stage 3: Kernel is loaded, user is logged in.
// Stage 4: Kernel is loaded, user is logged out.
//
// init() will block until auth has reached stage 1. If the user is already
// logged in from a previous session, auth will immediately progress to stage
// 2.
//
// loginComplete() will block until auth has reached stage 2. The kernel is not
// ready to receive messages yet, but apps do not need to present users with a
// login dialog.
//
// kernelLoaded() will block until auth has reached stage 3. kernelLoaded()
// returns a promise that can resolve with an error. If there was an error, it
// means the kernel could not be loaded and cannot be used.
//
// logoutComplete() will block until auth has reached stage 4. libkernel does
// not support resetting the auth stages, once stage 4 has been reached the app
// needs to refresh.

// loginComplete will resolve when the user has successfully logged in.
function loginComplete(): Promise<void> {
	return loginPromise
}

// kernelLoaded will resolve when the user has successfully loaded the kernel.
// If there was an error in loading the kernel, the error will be returned.
//
// NOTE: kernelLoaded will not resolve until after loginComplete has resolved.
function kernelLoaded(): Promise<Err> {
	return kernelLoadedPromise
}

// logoutComplete will resolve when the user has logged out. Note that
// logoutComplete will only resolve if the user logged in first - if the user
// was not logged in to begin with, this promise will not resolve.
function logoutComplete(): Promise<void> {
	return logoutPromise
}

// openAuthWindow is intended to be used as an onclick target when the user
// clicks the 'login' button on a skynet application. It will block until the
// auth location is known, and then it will pop open the correct auth window
// for the user.
//
// NOTE: openAuthWindow will only open a window if the user is not already
// logged in. If the user is already logged in, this function is a no-op.
//
// NOTE: When using this function, you probably want to have your login button
// faded out or presenting the user with a spinner until init() resolves. In
// the worst case (user has no browser extension, and is on a slow internet
// connection) this could take multiple seconds.
function openAuthWindow(): void {
	// openAuthWindow doesn't care what the auth status is, it's just trying to
	// open the right window.
	init().then(() => {
		window.open(kernelAuthLocation, "_blank")
	})
}

export { loginComplete, kernelLoaded, logoutComplete, openAuthWindow }
