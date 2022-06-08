import { init, kernelAuth } from "./queries.js"

// openAuthWindow is intended to be used as an onclick target when the user
// clicks the 'login' button on a skynet application. It will block until the
// auth location is known, and then it will pop open the correct auth window
// for the user.
//
// NOTE: When using this function, you probably want to have your login button
// faded out or presenting the user with a spinner until init() resolves. In
// the worst case (user has no browser extension, and is on a slow internet
// connection) this could take multiple seconds.
function openAuthWindow(): void {
	// openAuthWindow doesn't care what the auth status is, it's just trying to
	// open the right window.
	init().then(() => {
		window.open(kernelAuth, "_blank")
	})
}

export { openAuthWindow }
