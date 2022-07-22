// This is the standard build script for a kernel module.

import * as fs from "fs"
import {
	addContextToErr,
	b64ToBuf,
	bufToHex,
	deriveRegistryEntryID,
	entryIDToSkylink,
	generateSeedPhraseDeterministic,
	seedPhraseToSeed,
	sha512,
	taggedRegistryEntryKeys,
} from "libskynet"
import { generateSeedPhraseRandom, overwriteRegistryEntry, upload } from "libskynetnode"
import read from "read"

// Helper variables to make it easier to return empty values alongside errors.
const nu8 = new Uint8Array(0)
const nkp = {
	publicKey: nu8,
	secretKey: nu8,
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

// readFileBinary is a wrapper for fs.readFileSync that handles the try-catch
// for the caller.
function readFileBinary(fileName: string): [Uint8Array, string | null] {
	try {
		let data = fs.readFileSync(fileName, null)
		return [data, null]
	} catch (err) {
		return [nu8, "unable to read file: " + JSON.stringify(err)]
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

// hardenedSeedPhrase will take a password, harden it with 100,000 iterations
// of hashing, and then turn it into a seed phrase.
function hardenedSeedPhrase(password: string): [string, string | null] {
	let pw = password
	// Add some hashing iterations to the password to make it stronger.
	for (let i = 0; i < 1000000; i++) {
		let passU8 = new TextEncoder().encode(password)
		let hashIter = sha512(passU8)
		password = bufToHex(hashIter)
	}
	return generateSeedPhraseDeterministic(password)
}

// seedPhraseToRegistryKeys will convert a seed phrase to the set of registry
// keys that govern the registry entry where the module is published.
function seedPhraseToRegistryKeys(seedPhrase: string): [any, Uint8Array, string | null] {
	let [seed, errVSP] = seedPhraseToSeed(seedPhrase)
	if (errVSP !== null) {
		return [nkp, nu8, addContextToErr(errVSP, "unable to compute seed phrase")]
	}
	let [keypair, datakey, errTREK] = taggedRegistryEntryKeys(seed, "module-build", "module-key")
	if (errTREK !== null) {
		return [nkp, nu8, addContextToErr(errTREK, "unable to compute registry entry keys")]
	}
	return [keypair, datakey, null]
}

// seedPhraseToRegistryLink will take a seedPhrase as input and convert it to
// the registry link for the module.
function seedPhraseToRegistryLink(seedPhrase: string): [string, string | null] {
	let [keypair, datakey, errSPTRK] = seedPhraseToRegistryKeys(seedPhrase)
	if (errSPTRK !== null) {
		return ["", addContextToErr(errSPTRK, "unable to compute registry keys")]
	}
	let [entryID, errDREID] = deriveRegistryEntryID(keypair.publicKey, datakey)
	if (errDREID !== null) {
		return ["", addContextToErr(errDREID, "unable to compute registry entry id")]
	}
	let registryLink = entryIDToSkylink(entryID)
	return [registryLink, null]
}

// handlePass handles all portions of the script that occur after the password
// has been requested. If no password needs to be requested, handlePass will be
// called with a null input. We need to structure the code this way because the
// password reader is async and we can only access the password when using a
// callback.
function handlePass(password: string) {
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
				password = password + moduleSalt
				handlePassConfirm(password)
			})
		} else {
			// If the seed file does exist, or if we are using dev,
			// there's no need to confirm the password but we do
			// need to pass the logic off to the handlePassConfirm
			// callback.
			password = password + moduleSalt
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
function handlePassConfirm(password: string) {
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
		let [seedPhrase, errGSP] = generateSeedPhraseRandom()
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
		let [seedPhrase, errGSP] = hardenedSeedPhrase(password)
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
	let seedPhrase: string
	let registryLink: string
	if (process.argv[2] === "prod") {
		// Generate the seed phrase from the password.
		let [sp, errGSP] = hardenedSeedPhrase(password)
		if (errGSP !== null) {
			console.error("Unable to generate seed phrase: ", errGSP)
			process.exit(1)
		}
		let [rl, errSPTRL] = seedPhraseToRegistryLink(sp)
		registryLink = rl
		if (errSPTRL !== null) {
			console.error("Unable to generate registry link:", errSPTRL)
			process.exit(1)
		}
		let [registryLinkVerify, errRF] = readFile(seedFile)
		if (errRF !== null) {
			console.error("unable to read seedFile")
			process.exit(1)
		}
		registryLinkVerify = registryLinkVerify.replace(/\n$/, "")
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
		let [rl, errSPTRL] = seedPhraseToRegistryLink(sp)
		registryLink = rl
		if (errSPTRL !== null) {
			console.error("Unable to generate registry link:", errSPTRL)
			process.exit(1)
		}
		// Write the registry link to the module skylink dev file.
		let errWF = writeFile("build/module-skylink-dev", registryLink)
		if (errWF !== null) {
			console.error("unable to write registry link file:", errWF)
			process.exit(1)
		}
		seedPhrase = sp
	}

	// Upload the module to Skynet.
	let [distFile, errRF] = readFileBinary("dist/index.js")
	if (errRF !== null) {
		console.error("unable to read dist file for module")
		process.exit(1)
	}
	let metadata = {
		Filename: "index.js",
	}
	console.log("Uploading module...")
	upload(distFile, metadata)
		.then((result) => {
			console.log("Updating module's registry entry...")
			// Update the v2 skylink.
			let [keypair, datakey, errSPTRK] = seedPhraseToRegistryKeys(seedPhrase)
			if (errSPTRK !== null) {
				return ["", addContextToErr(errSPTRK, "unable to compute registry keys")]
			}
			let [bufLink, errBTB] = b64ToBuf(result)
			if (errBTB !== null) {
				return ["", addContextToErr(errBTB, "unable to decode skylink")]
			}
			overwriteRegistryEntry(keypair, datakey, bufLink)
				.then(() => {
					console.log("registry entry is updated")
					console.log("Immutable Link for Module:", result)
					console.log("Resolver Link for Module:", registryLink)
				})
				.catch((err: any) => {
					console.log("unable to update registry entry:", err)
				})
		})
		.catch((err) => {
			console.error("unable to upload file", err)
			process.exit(1)
		})
}

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
	seedFile = "module-skylink"
} else if (process.argv[2] === "dev") {
	seedFile = "build/dev-seed"
} else {
	console.error("need to provide either 'dev' or 'prod' as an input")
	process.exit(1)
}

// If doing a prod deployment, check whether the salt file exists. If it does
// not, create it.
let moduleSalt: string
if (!fs.existsSync(".module-salt")) {
	let [ms, errGSPR] = generateSeedPhraseRandom()
	if (errGSPR !== null) {
		console.error("unable to generate module salt:", errGSPR)
		process.exit(1)
	}
	moduleSalt = ms
	let errWF = writeFile(".module-salt", moduleSalt)
	if (errWF !== null) {
		console.error("unable to write module salt file:", errWF)
		process.exit(1)
	}
} else {
	let [ms, errRF] = readFile(".module-salt")
	if (errRF !== null) {
		console.error("unable to read moduleSalt")
		process.exit(1)
	}
	ms = ms.replace(/\n$/, "")
	moduleSalt = ms
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
	handlePass("")
}
