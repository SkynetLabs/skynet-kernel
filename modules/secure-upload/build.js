// This is the standard build script for a kernel module. All of the
// dependencies are at the top, scroll to the bottom for the real script.

fs = require('fs')

seed = require('./src/build-lib/seed')

//////////////////////////////
// Build Script Starts Here //
//////////////////////////////

// Check for a 'dev' or 'prod' input to the script.
if (process.argv.length !== 3) {
	console.error("need to provide either 'dev' or 'prod' as an input")
	process.exit(1)
}

// Determine the seed file.
let seedFile
if (process.argv[2] === 'prod') {
	seedFile = "build/seed.jsso"
} else if (process.argv[2] === 'dev') {
	seedFile = "build/seed-dev.jsso"
} else {
	console.error("need to provide either 'dev' or 'prod' as an input")
	process.exit(1)
}

// Create the seed file if it does not exist.
try {
	if (!(fs.existsSync(seedFile))) {
		// Generate the seed phrase and write it to the file.
		let [seedPhrase, errGSP] = seed.generateSeedPhrase()
		if (errGSP !== null) {
			console.error("Unable to generate seed phrase: ", errGSP)
			process.exit(1)
		}
		fs.writeFile(seedFile, seedPhrase, err => {
			console.error(err)
			process.exit(1)
		})
	}
} catch(err) {
	console.error("Unable to read seedFile:", err)
	process.exit(1)
}

// TODO: Adjust prod flow so that instead of using a local seed we actually
// generate a seed from a password, and then we store the hash of the password
// so that we can verify if it is correct.
