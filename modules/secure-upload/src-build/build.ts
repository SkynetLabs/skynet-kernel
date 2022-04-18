// This is the standard build script for a kernel module.

import * as fs from "fs"
import {
	generateSeedPhrase,
	sha512,
	addContextToErr,
	validSeedPhrase,
	taggedRegistryEntryKeys,
	deriveRegistryEntryID,
	resolverLink,
} from "libkerneldev"
import read from "read"

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
let seedFile: string
if (process.argv[2] === "prod") {
	seedFile = "build/module-skylink"
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
			console.error("unable to fetch password:", err)
			process.exit(1)
		}
		handlePass(password)
	})
} else {
	handlePass(null)
}

// readFile is a wrapper for fs.readFileSync that handles the try-catch for the
// caller.
function readFile(fileName: string): [string, string | null] {
	try {
		let data = fs.readFileSync(fileName, "utf8")
		return [data, null]
	} catch (err) {
		return ["", "unable to read file: " + JSON.stringify(err)]
	}
}

// writeFile is a wrapper for fs.writeFileSync which handles the try-catch in a
// non-exception way.
function writeFile(fileName: string, fileData: string): string | null {
	try {
		fs.writeFileSync(fileName, fileData)
		return null
	} catch (err) {
		return "unable to write file: " + JSON.stringify(err)
	}
}

// seedPhraseToRegistryLink will take a seedPhrase as input and convert it to
// the registry link for the module.
function seedPhraseToRegistryLink(seedPhrase: string): [string, string | null] {
	let [seed, errVSP] = validSeedPhrase(seedPhrase)
	if (errVSP !== null) {
		return ["", addContextToErr(errVSP, "unable to compute seed phrase")]
	}
	let [keypair, datakey, errTREK] = taggedRegistryEntryKeys(seed, "module-build", "module-key")
	if (errTREK !== null) {
		return ["", addContextToErr(errTREK, "unable to compute registry entry keys")]
	}
	let [entryID, errDREID] = deriveRegistryEntryID(keypair.publicKey, datakey)
	if (errDREID !== null) {
		return ["", addContextToErr(errDREID, "unable to compute registry entry id")]
	}
	let [registryLink, errRL] = resolverLink(entryID)
	if (errRL !== null) {
		return ["", addContextToErr(errRL, "unable to compute registry link")]
	}
	return [registryLink, null]
}

// handlePass handles all portions of the script that occur after the password
// has been requested. If no password needs to be requested, handlePass will be
// called with a null input. We need to structure the code this way because the
// password reader is async and we can only access the password when using a
// callback.
function handlePass(password: string | null) {
	try {
		// If we are running prod and the seed file does not exist, we
		// need to confirm the password and also warn the user to use a
		// secure password.
		if (!fs.existsSync(seedFile) && process.argv[2] === "prod") {
			// The file does not exist, we need to confirm the
			// password.
			console.log()
			console.log("No production entry found for module. Creating new production module...")
			console.log("If someone can guess the password, they can push arbitrary changes to your module.")
			console.log("Please use a secure password.")
			console.log()
			read({ prompt: "Confirm Password: ", silent: true }, function (err: any, confirmPassword: string) {
				if (err) {
					console.error("unable to fetch password:", err)
					process.exit(1)
				}
				if (password !== confirmPassword) {
					console.error("passwords do not match")
					process.exit(1)
				}
				handlePassConfirm(password)
			})
		} else {
			// If the seed file does exist, or if we are using dev,
			// there's no need to confirm the password but we do
			// need to pass the logic off to the handlePassConfirm
			// callback.
			handlePassConfirm(password)
		}
	} catch (err) {
		console.error("Unable to read seedFile:", err)
		process.exit(1)
	}
}

// handlePassConfirm handles the full script after the confirmation password
// has been provided. If not confirmation password is needed, this function
// will be called anyway using the unconfirmed password as input.
function handlePassConfirm(password: string | null) {
	// Create the seedFile if it does not exist. For dev we just save the
	// seed to disk outright, because this is a dev build and therefore not
	// security sensitive. Also the dev seed does not get pushed to the
	// github repo.
	//
	// For prod, we use the seed to create a new seed (called the shield)
	// which allows us to verify that the developer has provided the right
	// password when deploying the module. The shield does get pushed to
	// the github repo so that the production module is the same on all
	// devices.
	if (!fs.existsSync(seedFile) && process.argv[2] !== "prod") {
		// Generate the seed phrase and write it to the file.
		let [seedPhrase, errGSP] = generateSeedPhrase(null)
		if (errGSP !== null) {
			console.error("Unable to generate seed phrase:", errGSP)
			process.exit(1)
		}
		let errWF = writeFile(seedFile, seedPhrase)
		if (errWF !== null) {
			console.error("unable to write file:", errWF)
			process.exit(1)
		}
	} else if (!fs.existsSync(seedFile) && process.argv[2] === "prod") {
		// Generate the seed phrase.
		let [seedPhrase, errGSP] = generateSeedPhrase(password)
		if (errGSP !== null) {
			console.error("Unable to generate seed phrase:", errGSP)
			process.exit(1)
		}
		let [registryLink, errSPTRL] = seedPhraseToRegistryLink(seedPhrase)
		if (errSPTRL !== null) {
			console.error("Unable to generate registry link:", errSPTRL)
			process.exit(1)
		}

		// Write the registry link to the file.
		let errWF = writeFile(seedFile, registryLink)
		if (errWF !== null) {
			console.error("unable to write registry link file:", errWF)
			process.exit(1)
		}
	}

	// Load or verify the seed. If this is prod, the password is used to
	// create and verify the seed. If this is dev, we just load the seed
	// with no password.
	let seedPhrase
	if (process.argv[2] === "prod") {
		// Generate the seed phrase from the password.
		let [sp, errGSP] = generateSeedPhrase(password)
		if (errGSP !== null) {
			console.error("Unable to generate seed phrase: ", errGSP)
			process.exit(1)
		}
		let [registryLink, errSPTRL] = seedPhraseToRegistryLink(sp)
		if (errSPTRL !== null) {
			console.error("Unable to generate registry link:", errSPTRL)
			process.exit(1)
		}
		let [registryLinkVerify, errRF] = readFile(seedFile)
		if (errRF !== null) {
			console.error("unable to read seedFile")
			process.exit(1)
		}
		if (registryLink !== registryLinkVerify) {
			console.error("Incorrect password")
			process.exit(1)
		}
		seedPhrase = sp
	} else {
		let [sp, errRF] = readFile(seedFile)
		if (errRF !== null) {
			console.error("unable to read seed phrase for dev command from disk")
			process.exit(1)
		}
		let [registryLink, errSPTRL] = seedPhraseToRegistryLink(sp)
		if (errSPTRL !== null) {
			console.error("Unable to generate registry link:", errSPTRL)
			process.exit(1)
		}
		// Write the registry link to the module skylinkd dev file.
		let errWF = writeFile("build/module-skylink-dev", registryLink)
		if (errWF !== null) {
			console.error("unable to write registry link file:", errWF)
			process.exit(1)
		}
	}

	// TODO: Upload the dist file

	// TODO: Update the v2 skylink
}
