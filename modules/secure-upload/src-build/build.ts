// This is the standard build script for a kernel module.

import * as fs from "fs"
import * as read from "read"
import * as lkd from "libkerneldev"

// Add a newline for readability.
console.log()

// Check for a 'dev' or 'prod' input to the script.
if (process.argv.length !== 3) {
	console.error("need to provide either 'dev' or 'prod' as an input")
	process.exit(1)
}

// Create the build folder if it does not exist.
if (!fs.existsSync("build")) {
	fs.mkdirSync("build")
}

// Determine the seed file.
let seedFile
if (process.argv[2] === "prod") {
	seedFile = "build/module-double-seed"
} else if (process.argv[2] === "dev") {
	seedFile = "build/dev-seed"
} else {
	console.error("need to provide either 'dev' or 'prod' as an input")
	process.exit(1)
}

// Need to get a password if this is a prod build.
if (process.argv[2] === "prod") {
	read({ prompt: "Password: ", silent: true }, function (err: any, password: string) {
		if (err) {
			console.error("unable to fetch password: ", err)
			process.exit(1)
		}
		handlePass(password)
	})
} else {
	handlePass(null)
}

// handlePass handles all portions of the script that occur after the password
// has been requested. If no password needs to be requested, handlePass will be
// called with a null input. We need to structure the code this way because the
// password reader is async and we can only access the password when using a
// callback.
function handlePass(password: string | null) {
	if (password === null) {
		console.error("did not get a password")
		process.exit(1)
	}
	let u8pw = new TextEncoder().encode(password)
	console.log(lkd.sha512(u8pw))
}
