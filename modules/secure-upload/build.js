// This is the standard build script for a kernel module.

fs = require('fs')
seed = require('./src/build-lib/seed')
read = require('read')

// Add a newline for readability.
console.log()

// Check for a 'dev' or 'prod' input to the script.
if (process.argv.length !== 3) {
	console.error("need to provide either 'dev' or 'prod' as an input")
	process.exit(1)
}

// Create the build folder if it does not exist.
if (!fs.existsSync('build')) {
	fs.mkdirSync('build')
}

// Determine the seed file.
let seedFile
if (process.argv[2] === 'prod') {
	seedFile = "module-skylink"
} else if (process.argv[2] === 'dev') {
	seedFile = "build/dev-seed"
} else {
	console.error("need to provide either 'dev' or 'prod' as an input")
	process.exit(1)
}

// Need to get a password if this is a prod build.
if (process.argv[2] === 'prod') {
	read({prompt: 'Password: ', silent: true }, function(err, password) {
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
function handlePass(password) {
	// Create the seed file if it does not exist.
	try {
		if (!(fs.existsSync(seedFile)) && process.argv[2] === 'prod') {
			// The file does not exist, we need to confirm the
			// password.
			console.log()
			console.log("No production entry found for module. Creating new production module...")
			console.log("If someone can guess the password, they can push arbitrary changes to your module.")
			console.log("Please use a secure password.")
			console.log()
			read({prompt: 'Confirm Password: ', silent: true }, function(err, confirmPassword) {
				if (err) {
					console.error("unable to fetch password: ", err)
					process.exit(1)
				}
				if (password !== confirmPassword) {
					console.error("passwords do not match")
					process.exit(1)
				}
				handlePassConfirm(password)
			})
		} else {
			handlePassConfirm(password)
		}
	} catch(err) {
		console.error("Unable to read seedFile:", err)
		process.exit(1)
	}
}

// handlePassConfirm handles the full script after the confirmation password
// has been provided. If not confirmation password is needed, this function
// will be called anyway using the unconfirmed password as input.
function handlePassConfirm(password) {
	// Create the seedFile if it does not exist.
	if (!(fs.existsSync(seedFile)) && process.argv[2] !== 'prod') {
		// Generate the seed phrase and write it to the file.
		let [seedPhrase, errGSP] = seed.generateSeedPhrase(null)
		if (errGSP !== null) {
			console.error("Unable to generate seed phrase: ", errGSP)
			process.exit(1)
		}
		console.log("writing out dev seed phrase:", seedPhrase)
		fs.writeFileSync(seedFile, seedPhrase, err => {
			console.error(err)
			process.exit(1)
		})
	} else if (!(fs.existsSync(seedFile)) && process.argv[2] === 'prod') {
		// Generate the true seed phrase.
		let [seedPhrase, errGSP] = seed.generateSeedPhrase(password)
		if (errGSP !== null) {
			console.error("Unable to generate seed phrase: ", errGSP)
			process.exit(1)
		}

		// Get a new seed phrase using the true seed phrase as the
		// password and write that to disk so that we can publish the
		// prod seed phrase to the repo without giving anyone the
		// ability to update the module.
		//
		// TODO: Actually we should just compare this against the
		// prod-module.txt
		let [seedPhraseShield, errGSP2] = seed.generateSeedPhrase(password)
		if (errGSP !== null) {
			console.error("Unable to generate shielded seed phrase: ", errGSP2)
			process.exit(1)
		}
		fs.writeFile(seedFile, seedPhraseShield, err => {
			console.error(err)
			process.exit(1)
		})
	}

	// Load or verify the seed. If this is prod, the password is used to
	// create and verify the seed. If this is dev, we just load the seed
	// with no password.
	let seedPhrase
	if (process.argv[2] === 'prod') {
		let [sp, errGSP] = seed.generateSeedPhrase(password)
		if (errGSP !== null) {
			console.error("Unable to generate seed phrase: ", errGSP)
			process.exit(1)
		}
		seedPhrase = sp
	} else {
		seedPhrase = fs.readFileSync(seedFile, 'utf8')
	}
}
