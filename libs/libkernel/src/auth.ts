import { init, kernelAuthLocation, loginPromise, logoutPromise } from "./queries.js"
import { error } from "libskynet"

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
	init().then((err: error) => {
		if (err !== null) {
			window.open(kernelAuthLocation, "_blank")
		}
	})
}

// loginSuccess will resolve when the user has successfully logged in.
function loginSuccess(): Promise<void> {
	return loginPromise
}

// logoutComplete will resolve when the user has logged out. Note that
// logoutComplete will only resolve if the user logged in first - if the user
// was not logged in to begin with, this promise will not resolve.
function logoutComplete(): Promise<void> {
	return logoutPromise
}

export { openAuthWindow, loginSuccess, logoutComplete }
