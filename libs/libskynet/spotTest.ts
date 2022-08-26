import { bufToHex } from "./src/encoding.js";
import { otpEncrypt } from "./src/encrypt.js";
import { deriveRegistryEntryID, entryIDToSkylink, taggedRegistryEntryKeys } from "./src/registry.js";
import { sha512 } from "./src/sha512.js";

// Establish a global set of functions and objects for testing flow control.
let failed = false
function fail(errStr: string, ...inputs: any) {
	if (!t.failed) {
		console.error(t.testName, "has failed")
	}
	failed = true
	t.failed = true
	console.log("\t", errStr, ...inputs)
}
function log(...inputs: any) {
	console.log("\t", ...inputs)
}
let t = {
	failed: false,
	testName: "",
	fail,
	log,
}
function runTest(test: any) {
	t.failed = false
	t.testName = test.name
	console.log(t.testName, "is running")
	test(t)
}


// LogRegistryEntryIDAndResolverLink will produce a log containing a registry
// entry ID and its corresponding resolver link, allowing visual verification
// that the links look okay.
function LogRegistryEntryIDAndResolverLink(t: any) {
  // The fake seed needs to be 16 bytes so that taggedRegistryEntryKeys will
  // accept it as a real seed.
  const fakeSeed = new TextEncoder().encode("1234567890123456");
  const [keypair, datakey, errREK1] = taggedRegistryEntryKeys(fakeSeed, "", "");
  if (errREK1 !== null) {
    t.fail(errREK1)
    return
  }

  // Check that we can derive a registry entry id.
  const [entryID, errDREID] = deriveRegistryEntryID(keypair.publicKey, datakey);
  if (errDREID !== null) {
    t.fail(errDREID)
    return
  }
  t.log("example entry id:     ", bufToHex(entryID));
  const rl = entryIDToSkylink(entryID);
  t.log("example resolver link:", rl);
}

// LogDataEncryption will log the result of taking a plaintext and encrypting
// it with different seeds, allowing visual inspection that the data appears to
// be random. It's not a robust guarantee that the encryption is correct, but
// it can help the developer to find certain classes of common mistakes.
function LogDataEncryption(t: any) {
  // Perform a basic encryption and print the resulting data.
  const initialData1 = new TextEncoder().encode("this is a test string to encrypt");
  const initialData2 = new TextEncoder().encode("this is a test string to encrypt");
  const key1 = sha512(new TextEncoder().encode("this is a key preimage"));
  const key2 = sha512(new TextEncoder().encode("this is a different key preimage"));
  t.log("before encrypt:", bufToHex(initialData2));
  otpEncrypt(key1, initialData2);
  t.log("after encrypt: ", bufToHex(initialData2));

  // Check programatically that the lengths are the same.
  if (initialData1.length !== initialData2.length) {
    t.fail("encrypt added length")
    return
  }

  // Check programatically that the final string is materially different from
  // the input string.
	let matches1 = 0
	for (let i = 0; i < initialData1.length; i++) {
		if (initialData1[i] === initialData2[i]) {
			matches1 += 1
		}
	}
  if (matches1 > 10) {
    t.fail("string after encryption is too similar to string before encryption")
    return
  }

  // Check that decryption works.
  otpEncrypt(key1, initialData2);
  for (let i = 0; i < initialData1.length; i++) {
    if (initialData1[i] !== initialData2[i]) {
      t.fail("decrypted result does not match original")
      return
    }
  }

  // Check that encrypting with a different key will give a different data.
  otpEncrypt(key1, initialData1);
  otpEncrypt(key2, initialData2);
  t.log("different key: ", bufToHex(initialData2));
	let matches2 = 0
	for (let i = 0; i < initialData1.length; i++) {
		if (initialData1[i] === initialData2[i]) {
			matches2 += 1
		}
	}
  if (matches2 > 10) {
    t.fail("string after encryption is too similar to string before encryption")
    return
  }
}

runTest(LogRegistryEntryIDAndResolverLink)
runTest(LogDataEncryption)

if (failed) {
  console.log()
	console.log("tests had errors")
	process.exit(1)
}
