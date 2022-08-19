import * as React from "react";
import * as kernel from "libkernel";
import * as skynet from "libskynet";

// Define a set of functions which facilitate executing the tests sequentially.
// Each test is assigned a 'turn' and then will wait to begin execution until
// all tests before it have completed.
var turns = [];
var next = 0;
function getTurn() {
  let turn = new Promise((resolve) => {
    turns.push(resolve);
    if (next === 0) {
      next++;
      resolve();
    }
  });
  return turn;
}
function nextTest() {
  if (next < turns.length) {
    let resolve = turns[next];
    next++;
    resolve();
  }
}

// Real modules that we use during testing.
const kernelTestSuite = "AQCPJ9WRzMpKQHIsPo8no3XJpUydcDCjw7VJy8lG1MCZ3g";
const helperModule = "AQCoaLP6JexdZshDDZRQaIwN3B7DqFjlY7byMikR7u1IEA";
const myskyModule = "IABOv7_dkJwtuaFBeB6eTR32mSvtLsBRVffEY9yYL0v0rA";
const portalModule = "AQCBPFvXNvdtnLbWCRhC5WKhLxxXlel-EDwNM7-GQ-XV3Q";

// Fake modules to check error conditions.
const moduleDoesNotExist = "AQCPJ9WRzMpKQHIsPo9no3XJpUydcDCjw7VJy8lG1MCZ3g";
const moduleMalformed = "AQCPJ9WRzMpKQHIsPo8no3XJpUydcDCjw7VJy8lG1MCZ3";

// TestLibkernelInit will check the init function of libkernel. This tests that
// the bridge script was loaded. If this fails, it either means the browser
// extension is missing entirely or it means that something fundamental broke.
function TestLibkernelInit() {
  return new Promise((resolve, reject) => {
    // Wait for kernel init to complete.
    kernel.init().then((err) => {
      // Check if the user is already logged in.
      if (err !== null) {
        kernel.loginComplete().then(() => {
          resolve("kernel loaded successfully");
        });
        return;
      }
      resolve("kernel loaded successfully");
    });
  });
}

// TestGetKernelVersion will send a test message to the kernel and check for the
// result. If this fails it probably means the kernel failed to load for some
// reason, though it could also mean that the page->bridge->background->kernel
// communication path is broken in some way.
function TestGetKernelVersion() {
  return new Promise((resolve, reject) => {
    kernel.kernelVersion().then(([version, distribution, err]) => {
      if (err !== null) {
        reject(err);
        return;
      }
      resolve(version + "-" + distribution);
    });
  });
}

// TestModuleLoadingRace will load the tester module multiple times to see if
// there's a race condition where loading the same module multiple times all in
// a row causes a race.
//
// NOTE: This method needs to run first, before anything else runs.
function TestModuleLoadingRace() {
	return new Promise((resolve, reject) => {
		let promises = []
		for (let i = 0; i < 10; i++) {
			let p = kernel.callModule(kernelTestSuite, "viewSeed", {})
			promises.push(p)
		}
		Promise.all(promises).then((results) => {
			for (let i = 0; i < results.length; i++) {
				let err = results[i][1]
				if (err !== null) {
					reject(err)
					return
				}
			}

			// Run the query again to make sure cleanup is working.
			promises = []
			for (let i = 0; i < 10; i++) {
				let p = kernel.callModule(kernelTestSuite, "viewSeed", {})
				promises.push(p)
			}
			Promise.all(promises).then((results) => {
				for (let i = 0; i < results.length; i++) {
					let err = results[i][1]
					if (err !== null) {
						reject(err)
						return
					}
				}
				resolve("race conditions initially okay, need to check checkErrs on the kernel")
			})
		})
	})
}

// TestModuleHasSeed checks that the test module was given a seed by the
// kernel. This is one of the fundamental priveledges of being a kernel module:
// receiving a secure and unique seed for module-specific user data.
//
// The full message flow here is:
// 	webpage => bridge => background =>
// 		kernel => test module ->
// 		kernel ->
// 	background -> bridge -> webpage
function TestModuleHasSeed() {
  return new Promise((resolve, reject) => {
    kernel.callModule(kernelTestSuite, "viewSeed", {}).then(([data, err]) => {
      if (err !== null) {
        reject("viewSeed returned an error: ", err);
        return;
      }
      if (!("seed" in data)) {
        reject("viewSeed in test module did not return a data.seed");
        return;
      }
      if (data.seed.length !== 16) {
        reject(
          "viewSeed in test module returned a seed with a non-standard length"
        );
        return;
      }
      resolve("viewSeed appears to have returned a standard seed");
    });
  });
}

// TestModuleLogging checks that the test suite module is capable of logging.
// This test requires looking in the console of the kernel to see that the log
// was printed correctly.
function TestModuleLogging() {
  return new Promise((resolve, reject) => {
    kernel
      .callModule(kernelTestSuite, "testLogging", {})
      .then(([data, err]) => {
        if (err !== null) {
          reject(err);
          return;
        }
        resolve("test module has produced logs");
      });
  });
}

// TestMissingModule checks that the kernel correctly handles a call to a
// module that doesn't exist. For the module, we use the test module but with
// the final character modified so that the hash doesn't actually point to
// anything.
function TestMissingModule() {
  return new Promise((resolve, reject) => {
    kernel
      .callModule(moduleDoesNotExist, "viewSeed", {})
      .then(([data, err]) => {
        if (err !== null) {
          resolve(err);
          return;
        }
        reject("kernel is supposed to return an error:" + JSON.stringify(data));
      });
  });
}

// TestMalformedModule checks that the kernel correctly handles a call to a
// module that is using a malformed skylink.
function TestMalformedModule() {
  return new Promise((resolve, reject) => {
    kernel.callModule(moduleMalformed, "viewSeed", {}).then(([data, err]) => {
      if (err !== null) {
        resolve(err);
        return;
      }
      reject("kernel is supposed to return an error");
    });
  });
}

// TestModulePresentSeed attempts to send a 'presentSeed' method to the test
// module. This is expected to fail because the kernel is not supposed to allow
// external callers to use the 'presentSeed' method. If it succeeds, the test
// module will log an error that TestModuleHasErrors will catch.
function TestModulePresentSeed() {
  return new Promise((resolve, reject) => {
    let fakeSeed = new Uint8Array(16);
    kernel
      .callModule(kernelTestSuite, "presentSeed", {
        seed: fakeSeed,
      })
      .then(([data, err]) => {
        if (err !== null) {
          resolve("received expected error: " + err);
          return;
        }
        reject("expecting an error for using a forbidden method");
      });
  });
}

// TestModuleMyskySeed messages a special module designed to receive the mysky
// kepair and verify that it's a valid keypair.
function TestModuleMyskySeed() {
	return new Promise((resolve, reject) => {
		kernel.callModule(myskyModule, "confirmMyskyRoot", {}).then(([data, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			resolve(data)
		})
	})
}

// TestModuleQueryKernel opens a query with the test module that has the test
// module send a test query to the kernel, and then the test module reports the
// kernel version back to us. This test confirms that modules are able to talk
// to the kernel.
//
// The full message flow here is:
// 	webpage => bridge => background =>
// 		kernel => test module =>
// 			kernel -> test module ->
// 		kernel ->
// 	background -> bridge -> webpage
function TestModuleQueryKernel() {
  return new Promise((resolve, reject) => {
    kernel
      .callModule(kernelTestSuite, "sendTestToKernel", {})
      .then(([data, err]) => {
        if (err !== null) {
          reject(err);
          return;
        }
        if (!("kernelVersion" in data)) {
          reject("expecting response to have a kernelVersion");
          return;
        }
        resolve(data.kernelVersion);
      });
  });
}

// TestModuleCheckHelperSeed opens a query with the test module to have the
// test module check the seed of the helper module.
//
// The full message flow here is:
// 	webpage => bridge => background =>
// 		kernel => test module =>
// 			kernel => helper module ->
// 		kernel -> test module ->
// 	kernel -> background -> bridge -> webpage
function TestModuleCheckHelperSeed() {
  return new Promise((resolve, reject) => {
    kernel
      .callModule(kernelTestSuite, "viewHelperSeed", {})
      .then(([data, err]) => {
        if (err !== null) {
          reject(err);
          return;
        }
        if (!("message" in data)) {
          reject("expecting response to have a kernelVersion");
          return;
        }
        resolve(data.message);
      });
  });
}

// TestViewTesterSeedByHelper has the test module as the helper module to fetch
// the seed of the test module. This test ensures that multi-hop module
// communication works.
//
// The full message flow here is:
// 	webpage => bridge => background =>
// 		kernel => test module =>
// 			kernel => helper module =>
// 				kernel => test module ->
// 			kernel -> helper module ->
// 		kernel -> test module ->
// 	kernel -> background -> bridge -> webpage
function TestViewTesterSeedByHelper() {
  return new Promise((resolve, reject) => {
    kernel
      .callModule(kernelTestSuite, "viewOwnSeedThroughHelper", {})
      .then(([data, err]) => {
        if (err !== null) {
          reject(err);
          return;
        }
        if (!("message" in data)) {
          reject("expecting response to have a kernelVersion");
          return;
        }
        resolve(data.message);
      });
  });
}

// Check that the kernel is assigning the correct domain to the webpage.
function TestMirrorDomain() {
  return new Promise((resolve, reject) => {
    kernel
      .callModule(kernelTestSuite, "mirrorDomain", {})
      .then(([data, err]) => {
        if (err !== null) {
          reject(err);
          return;
        }
        if (!("domain" in data)) {
          reject("mirrorDomain did not return a domain");
          return;
        }
        if (typeof data.domain !== "string") {
          reject("mirrorDomain returned wrong type: " + typeof data.domain);
          return;
        }
        if (data.domain !== window.location.hostname) {
          reject(
            "wrong domain\nexpected: " +
              window.location.hostname +
              "\ngot: " +
              data.domain
          );
          return;
        }
        resolve("got expected domain: " + data.domain);
      });
  });
}

// Check that the kernel is assigning the correct domain to other modules.
function TestTesterMirrorDomain() {
  return new Promise((resolve, reject) => {
    kernel
      .callModule(kernelTestSuite, "testerMirrorDomain", {})
      .then(([data, err]) => {
        if (err !== null) {
          reject(err);
          return;
        }
        if (!("domain" in data)) {
          reject("testerMirrorDomain did not return a domain");
          return;
        }
        if (typeof data.domain !== "string") {
          reject(
            "testerMirrorDomain returned wrong type: " + typeof data.domain
          );
          return;
        }
        if (data.domain !== kernelTestSuite) {
          reject(
            "wrong domain\nexpected: " +
              kernelTestSuite +
              "\ngot: " +
              data.domain
          );
          return;
        }
        resolve("got expected domain: " + data.domain);
      });
  });
}

// Check that the kernel is rejecting moduleCall messages that don't include a
// method field.
function TestMethodFieldRequired() {
  return new Promise((resolve, reject) => {
    kernel.callModule(kernelTestSuite, null, {}).then(([data, err]) => {
      if (err !== null) {
        resolve("kernel failed when there was a call with no method: " + err);
        return;
      }
      reject("expecting a call to the kernel with no method to fail");
    });
  });
}

// TestResponseUpdates checks that modules can successfully send responseUpdate
// messages.
function TestResponseUpdates() {
  return new Promise((resolve, reject) => {
    let progress = 0;
    let receiveUpdate = function (data) {
      if (!("eventProgress" in data)) {
        reject("eventProgress not provided in response");
        return;
      }
      if (data.eventProgress !== progress + 25) {
        // NOTE: event ordering is not actually guaranteed by the spec, but
        // this is a situation where parallelism is low enough that the
        // ordering should be okay.
        reject("progress messages appear to be arriving out of order");
        return;
      }
      progress += 25;
    };
    let [, query] = kernel.connectModule(
      kernelTestSuite,
      "testResponseUpdate",
      {},
      receiveUpdate
    );
    query.then(([data, err]) => {
      if (err !== null) {
        reject(err);
        return;
      }
      if (progress !== 75) {
        reject("response was received before responseUpdates were completed");
        console.log("progress is:", progress);
        return;
      }
      if (!("eventProgress" in data)) {
        reject("expecting response to contain eventProgress");
        return;
      }
      if (data.eventProgress !== 100) {
        reject("expecting response eventProgress to be 100");
        return;
      }
      resolve(
        "received all messages in order and final message was a response"
      );
    });
  });
}

// TestModuleUpdateQuery checks that modules can successfully send queryUpdate
// and responseUpdate messages.
function TestModuleUpdateQuery() {
  return new Promise((resolve, reject) => {
    kernel.callModule(kernelTestSuite, "updateTest", {}).then(([data, err]) => {
      if (err !== null) {
        reject(err);
        return;
      }
      resolve(data);
    });
  });
}

// TestIgnoreResponseUpdates checks that you can safely use callModule on a
// module method that provides response updates.
function TestIgnoreResponseUpdates() {
  return new Promise((resolve, reject) => {
    kernel
      .callModule(kernelTestSuite, "testResponseUpdate", {})
      .then(([data, err]) => {
        if (err !== null) {
          reject(err);
          return;
        }
        if (!("eventProgress" in data)) {
          reject("expecting response to contain eventProgress");
          return;
        }
        if (data.eventProgress !== 100) {
          reject("expecting response eventProgress to be 100");
          return;
        }
        resolve(
          "received final message when calling testResponseUpdate using callModule"
        );
      });
  });
}

// TestLibkernelQueryUpdates is a test to check that queryUpdates are working
// when using libkernel. It uses the same method on the helper module that the
// tester module uses to verify connectModule in libkmodule, which gives us
// confidence that the libraries are equivalent.
function TestLibkernelQueryUpdates() {
  // Track whether or not we've called accept/reject.
  let resolved = false;

  // Return a promise that resolves with the result of the test.
  return new Promise((resolve, reject) => {
    // Define a function to receive updates.
    let sendUpdate;
    let expectedProgress = 1;
    let receiveUpdate = function (data) {
      // Don't handle an update if the query is already
      // complete.
      if (resolved === true) {
        console.error("received an update after query resolution");
        return;
      }

      if (!("progress" in data)) {
        reject("expecting progress field in data");
        resolved = true;
        return;
      }
      if (typeof data.progress !== "number") {
        reject("expecting progress to be a number");
        resolved = true;
        return;
      }
      if (expectedProgress !== data.progress) {
        reject("progress has wrong value");
        resolved = true;
        return;
      }
      if (data.progress > 7) {
        reject("progress is larger than 7");
        resolved = true;
        return;
      }

      // Send the helper module an update with increased progress.
      sendUpdate({ progress: data.progress + 1 });
      expectedProgress += 2;
    };

    // Create the query and set 'sendUpdate' so that the
    // receiveUpdate function can properly send updates.
    //
    // NOTE: Cannot use async here because that might cause a race
    // condition where receiveUpdate is called before sendUpdate
    // has been set properly. Could resolve this with some promise
    // magic, but it's also not needed if you aren't using async.
    let [sendUpdateFn, responsePromise] = kernel.connectModule(
      helperModule,
      "updateTest",
      { progress: 0 },
      receiveUpdate
    );
    sendUpdate = sendUpdateFn;

    // Block for the final response, where progress should equal 9.
    responsePromise.then(([resp, err]) => {
      if (resolved === true) {
        console.error("received response after query was closed");
        return;
      }
      if (err !== null) {
        reject(err);
        resolved = true;
        return;
      }
      if (resp.progress !== 9) {
        reject("expected final progress to be 9");
        resolved = true;
        return;
      }
      resolve("query update test has passed");
      resolved = true;
    });
  });
}

// TestBasicCORS has the test module make a fetch request to a couple of
// websites to check that CORS is not preventing workers from talking to the
// network.
function TestBasicCORS() {
  return new Promise((resolve, reject) => {
    kernel.callModule(kernelTestSuite, "testCORS", {}).then(([data, err]) => {
      if (err !== null) {
        reject(err);
        return;
      }
      if (!("url" in data)) {
        reject("testCORS did not return a url");
        return;
      }
      if (typeof data.url !== "string") {
        reject("testCORS returned wrong type: " + typeof data.domain);
        return;
      }
      resolve("CORS test passed for url: " + data.url);
    });
  });
}

// TestPortalConnection will send a message to the portal module to check that
// the portal module was able to from a connection with the remote portal.
function TestPortalConnection() {
  return new Promise((resolve, reject) => {
    kernel.callModule(portalModule, "checkSkynetConnection", {})
    .then(([data, err]) => {
      if (err !== null) {
        reject(err)
        return
       }
      resolve(kernel.objAsString(data))
    })
  })
}

// TestPortalAuth will ask the skynet-portal module to try a download to verify
// that the auth is working.
function TestPortalAuth() {
  return new Promise((resolve, reject) => {
    kernel.callModule(portalModule, "testLoggedIn", {})
    .then(([data, err]) => {
      if (err !== null) {
        reject(err)
        return
       }
      resolve(kernel.objAsString(data))
    })
  })
}

// TestSecureRegistry will check that the sercure-registry module is working.
function TestSecureRegistry() {
	return new Promise(async (resolve, reject) => {
		let start = performance.now()
		// Start by retrieving a seed from the test suite, this way we can
		// create a registry entry that is unique to the current user.
		let [seedResp, errVS] = await kernel.callModule(kernelTestSuite, "viewSeed", {})
		console.log("TestSecureRegistry: viewSeed completed after", performance.now()-start)
		if (errVS !== null) {
			reject(kernel.addContextToErr(errVS, "unable to retrieve seed"))
			return
		}
		let seed = seedResp.seed

		// Create the keypair that we will use for this registry entry.
		let [keypair, dataKey, errTREK] = skynet.taggedRegistryEntryKeys(seed, "TSR", "TSR")
		if (errTREK !== null) {
			reject(skynet.addContextToErr(errTREK, "unable to generate tagged registry keys"))
			return
		}

		// Read from the registry entry.
		let [readData, errRR] = await kernel.registryRead(keypair.publicKey, dataKey)
		console.log("TestSecureRegistry: registryRead completed after", performance.now()-start)
		if (errRR !== null) {
			reject(skynet.addContextToErr(errRR, "unable to read from registry entry"))
			return
		}

		// If the registry entry doesn't exist yet (which it won't if this is
		// the first time that the test suite has been run by this seed),
		// perform a write to create the registry entry.
		let entryData = new TextEncoder().encode("sample registry data")
		if (readData.exists !== true) {
			// Perform the write.
			let [, errRW] = await kernel.registryWrite(keypair, dataKey, entryData, 0n)
			console.log("TestSecureRegistry: registryWrite404 completed after", performance.now()-start)
			if (errRW !== null) {
				reject(skynet.addContextToErr(errRW, "error when calling registry module"))
				return
			}

			// Redo the read so that the test can proceed as though the first
			// read succeeded.
			[readData, errRR] = await kernel.registryRead(keypair.publicKey, dataKey)
			console.log("TestSecureRegistry: registryRead404 completed after", performance.now()-start)
			if (errRR !== null) {
				reject(skynet.addContextToErr(errRR, "unable to read from registry entry"))
				return
			}
			if (readData.exists !== true) {
				reject(skynet.addContextToErr(errRR, "got a 404 after writing to a registry entry"))
				return
			}
		}

		// Check the entry data.
		if (!("entryData" in readData)) {
			reject("response should contain entryData")
			return
		}
		if (!(readData.entryData instanceof Uint8Array)) {
			console.error(readData.entryData)
			reject("entryData response should be a Uint8Array")
			return
		}
		if (entryData.length !== readData.entryData.length) {
			reject("entryData mismatch")
			return
		}
		for (let i = 0; i < entryData.length; i++) {
			if (entryData[i] !== readData.entryData[i]) {
				reject("entryData mismatch")
				return
			}
		}
		if (!("revision" in readData)) {
			reject("revision not provided by readData")
			return
		}
		if (typeof readData.revision !== "bigint") {
			reject("revision should be a bigint")
			return
		}

		// Write to the registry entry and check that no errors are returned.
		let [entryID, errRW] = await kernel.registryWrite(keypair, dataKey, entryData, readData.revision+1n)
		console.log("TestSecureRegistry: registryWrite completed after", performance.now()-start)
		if (errRW !== null) {
			reject(skynet.addContextToErr(errRW, "error when calling registry module"))
			return
		}
		let resolverLink = skynet.entryIDToSkylink(entryID)
		resolve(resolverLink)
	})
}

// TestSecureUploadAndDownload will upload a very basic file to Skynet using
// libkernel. It will then download that skylink using libkernel.
function TestSecureUploadAndDownload() {
	return new Promise(async (resolve, reject) => {
		// Try to upload a sample file.
		let start = performance.now()
		let fileDataUp = new TextEncoder().encode("test data")
		let [skylink, errU] = await kernel.upload("testUpload.txt", fileDataUp)
		console.log("TestSecureUploadAndDownload: initial upload completed after", performance.now()-start)
		if (errU !== null) {
			reject(kernel.addContextToErr(errU, "upload failed"))
			return
		}

		// Try to download the file we just uploaded.
		let [fileDataDown, errD] = await kernel.download(skylink)
		console.log("TestSecureUploadAndDownload: initial download completed after", performance.now()-start)
		if (errD !== null) {
			reject(kernel.addContextToErr(errD, "content link download failed"))
			return
		}
		if (fileDataUp.length !== fileDataDown.length) {
			reject("uploaded data and downloaded data do not match: "+JSON.stringify({uploaded: fileDataUp, downloaded: fileDataDown}))
			return
		}
		for (let i = 0; i < fileDataUp.length; i++) {
			if (fileDataUp[i] !== fileDataDown[i]) {
				reject("uploaded data and downloaded data do not match: "+JSON.stringify({uploaded: fileDataUp, downloaded: fileDataDown}))
				return
			}
		}

		// Create a resolver link for the file and publish that resolver link
		// to the registry.
		let [seedResp, errVS] = await kernel.callModule(kernelTestSuite, "viewSeed", {})
		console.log("TestSecureUploadAndDownload: viewSeed completed after", performance.now()-start)
		if (errVS !== null) {
			reject(kernel.addContextToErr(errVS, "unable to retrieve seed"))
			return
		}
		let seed = seedResp.seed
		// Create the keypair that we will use for this registry entry.
		let [keypair, dataKey, errTREK] = skynet.taggedRegistryEntryKeys(seed, "TSUAD", "TSUAD")
		if (errTREK !== null) {
			reject(skynet.addContextToErr(errTREK, "unable to generate tagged registry keys"))
			return
		}
		// Create the data field for the resolver link.
		let [bufLink, errBTB] = skynet.b64ToBuf(skylink)
		if (errBTB !== null) {
			reject(skynet.addContextToErr(errBTB, "unable to convert skylink to buf"))
			return
		}

		// Perform a registry read to get the revision number that we need.
		let [regRead, errRR] = await kernel.registryRead(keypair.publicKey, dataKey)
		console.log("TestSecureUploadAndDownload: regread completed after", performance.now()-start)
		if (errRR !== null) {
			reject(skynet.addContextToErr(errRR, "unable to read from registry entry"))
			return
		}
		let revisionNumber = 0n
		if (regRead.exists) {
			revisionNumber = regRead.revision + 1n
		}

		// Perform the registry write.
		let [entryID, errRW] = await kernel.registryWrite(keypair, dataKey, bufLink, revisionNumber)
		console.log("TestSecureUploadAndDownload: regwrite completed after", performance.now()-start)
		if (errRW !== null) {
			return
		}

		// Perform a skylink download using the resolver link.
		let resolverLink = skynet.entryIDToSkylink(entryID)
		let [resolverData, errD2] = await kernel.download(resolverLink)
		console.log("TestSecureUploadAndDownload: download completed after", performance.now()-start)
		if (errD2 !== null) {
			reject(kernel.addContextToErr(errD2, "content link download failed"))
			return
		}
		if (fileDataUp.length !== resolverData.length) {
			reject("uploaded data and resolver downloaded data do not match: "+skynet.objAsString({uploaded: fileDataUp, downloaded: resolverData}))
			return
		}
		for (let i = 0; i < fileDataUp.length; i++) {
			if (fileDataUp[i] !== resolverData[i]) {
				reject("uploaded data and downloaded data do not match: "+skynet.objAsString({uploaded: fileDataUp, downloaded: resolverData}))
				return
			}
		}

		// Test is complete.
		resolve("upload works, download works, resolver download works")
	})
}

// TestIndependentFileSmall checks that the general functions of the
// independentFileSmall object in libkmodule are working correctly.
function TestIndependentFileSmall() {
  return new Promise((resolve, reject) => {
    kernel.callModule(kernelTestSuite, "testIndependentFileSmall", {}).then(([data, err]) => {
      if (err !== null) {
        reject(err);
        return;
      }
      resolve("testIndpendentFileSmall appears to have passed")
    });
  });
}

// TestChildWorkersDie tests that when a module spins up a child worker, that
// worker gets terminated along with the parent.
function TestChildWorkersDie() {
	return new Promise(async (resolve, reject) => {
		let [resp, err] = await kernel.callModule(kernelTestSuite, "testChildWorkersDie", {})
		if (err !== null) {
			reject(kernel.addContextToErr(err, "error from testChildWorkersDie"))
			return
		}
		resolve(resp)
	})
}

// TestMsgSpeedSequential5k will send ten thousand messages to the kernel
// sequentially.
function TestMsgSpeedSequential5k() {
  // sendSequentialMessages is a helper function that will send a
  // message, wait for the message to resolve, then call itself again
  // with a lower 'remaining' value, exiting out when 'remaining' hits
  // zero.
  let sendSequentialMessages = function (remaining, resolve, reject) {
    if (remaining === 0) {
      resolve("all messages resolved");
      return;
    }

    kernel.kernelVersion().then(([, , err]) => {
      if (err !== null) {
        reject(err);
        return;
      }
      sendSequentialMessages(remaining - 1, resolve, reject);
    });
  };
  return new Promise((resolve, reject) => {
    sendSequentialMessages(5000, resolve, reject);
  });
}

// TestModuleSpeedSequential5k will have the tester module perform five
// thousand sequential messages on the helper module.
function TestModuleSpeedSequential20k() {
  return new Promise((resolve, reject) => {
    kernel
      .callModule(kernelTestSuite, "callModulePerformanceSequential", {
        iterations: 20000,
      })
      .then(([data, err]) => {
        if (err !== null) {
          reject(err);
          return;
        }
        resolve("sequential messages succeeded");
      });
  });
}

// TestMsgSpeedParallel5k will send ten thousand messages to the kernel in
// parallel.
function TestMsgSpeedParallel5k() {
  return new Promise((resolve, reject) => {
    let promises = [];
    for (let i = 0; i < 5000; i++) {
      promises.push(kernel.kernelVersion());
    }
    Promise.all(promises)
      .then((x) => {
        for (let i = 0; i < x.length; i++) {
          let err = x[i][2];
          if (err !== null) {
            reject(err);
            return;
          }
        }
        resolve("all messages reseolved");
      })
      .catch((x) => {
        // I don't believe there's any way for the above call
        // to reject but we check anyway.
        reject(x);
      });
  });
}

// TestModuleSpeedParallel5k will have the tester module perform five
// thousand sequential messages on the helper module.
function TestModuleSpeedParallel20k() {
  return new Promise((resolve, reject) => {
    kernel
      .callModule(kernelTestSuite, "callModulePerformanceParallel", {
        iterations: 20000,
      })
      .then(([data, err]) => {
        if (err !== null) {
          reject(err);
          return;
        }
        resolve("sequential messages succeeded");
      });
  });
}

// TestModuleHasErrors asks the test module whether it has encountered any
// errors during the test cycle.
function TestModuleHasErrors() {
  return new Promise((resolve, reject) => {
    kernel.callModule(kernelTestSuite, "viewErrors", {}).then(([data, err]) => {
      if (err !== null) {
        reject(err);
        return;
      }
      if (!("errors" in data)) {
        reject("viewErrors in test module did not return a data.errors");
        return;
      }
      if (data.errors.length !== 0) {
        reject(
          "test module has acculumated errors: " + JSON.stringify(data.errors)
        );
        return;
      }
      resolve("test module did not accumulate any errors");
    });
  });
}

// Check whether any errors showed up in the helper module.
function TestHelperModuleHasErrors() {
  return new Promise((resolve, reject) => {
    kernel.callModule(helperModule, "viewErrors", {}).then(([data, err]) => {
      if (err !== null) {
        reject(err);
        return;
      }
      if (!("errors" in data)) {
        reject("viewErrors in helper module did not return a data.errors");
        return;
      }
      if (data.errors.length !== 0) {
        reject(
          "helper module has acculumated errors: " + JSON.stringify(data.errors)
        );
        return;
      }
      resolve("helper module did not accumulate any errors");
    });
  });
}

// Check whether any errors showed up in the mysky module.
function TestMyskyModuleHasErrors() {
  return new Promise((resolve, reject) => {
    kernel.callModule(myskyModule, "viewErrors", {}).then(([data, err]) => {
      if (err !== null) {
        reject(err);
        return;
      }
      if (!("errors" in data)) {
        reject("viewErrors in mysky module did not return a data.errors");
        return;
      }
      if (data.errors.length !== 0) {
        reject(
          "mysky module has acculumated errors: " + JSON.stringify(data.errors)
        );
        return;
      }
      resolve("mysky module did not accumulate any errors");
    });
  });
}

// Check whether any errors showed up in the kernel.
function TestKernelHasErrors() {
	return new Promise((resolve, reject) => {
		let [, query] = kernel.newKernelQuery("version", {}, false)
		query.then(([result, err]) => {
			if (err !== null) {
				reject(err)
				return
			}
			if (!("errs" in result)) {
				reject(result)
				return
			}
			if (result.errs.length !== 0) {
				reject(result.errs)
			}
			return
		})
		resolve("no errors in kernel")
	})
}

// TestCard is a react component that runs a test and reports the result.
function TestCard(props) {
  const [testStatus, setTestStatus] = React.useState("test is waiting");
  const [statusColor, setStatusColor] = React.useState("rgba(60, 60, 60, 0.6)");
  const [duration, setDuration] = React.useState(0);

  // Define the events that will run a the test.
  React.useEffect(() => {
    async function manageTest() {
      // Wait for the user to be logged in.
      let authStatus = await kernel.init();
      if (authStatus !== null) {
        setTestStatus("cannot run test if user is not logged in");
        setStatusColor("rgba(35, 35, 35, 0.7)");
        await kernel.loginComplete();
      }

      // Wait until it's this test's turn to run.
      await props.turn;
      setTestStatus("test is running");
      setStatusColor("rgba(255, 165, 0, 0.6)");
      let start = performance.now();

      // Run the test.
      props
        .test()
        .then((result) => {
          setTestStatus("test success: " + result);
          setStatusColor("rgba(0, 80, 0, 0.6)");
          setDuration(performance.now() - start);
          nextTest();
        })
        .catch((err) => {
          console.error(err);
          setTestStatus(err);
          setStatusColor("rgba(255, 0, 0, 0.6)");
          let end = performance.now();
          setDuration(end - start);
          nextTest();
        });
    }
    manageTest(props);
  }, [props]);

  return (
    <div
      style={{
        border: "1px solid black",
        backgroundColor: statusColor,
        margin: "12px",
        padding: "6px",
      }}
    >
      <p>{props.name}</p>
      <p>{testStatus}</p>
      <p>{duration}ms</p>
    </div>
  );
}

// LoginButton is a react component that allows the user to log into the
// kernel.
function LoginButton(props) {
  const [buttonText, setButtonText] = React.useState("Loading Kernel...");
  const [maybeDisabled, setMaybeDisabled] = React.useState(true);

  // Define the events that will run a the test.
  React.useEffect(() => {
    async function manageLoginButton() {
      // Wait for the user to be logged in.
      await kernel.init();
	  setButtonText("Login to Skynet");
      setMaybeDisabled(false);
      await kernel.loginComplete();

      // Login complete, change the button and wait for logout.
      setButtonText("Logout of Skynet");
      setMaybeDisabled("");
      await kernel.logoutComplete();

      // User has logged out, reload the skapp.
      window.location.reload();
    }
    manageLoginButton(props);
  }, [props]);

  return (
    <div>
      <button
        text="login"
        style={{ margin: "12px" }}
        onClick={kernel.openAuthWindow}
        disabled={maybeDisabled}
      >
        {buttonText}
      </button>
    </div>
  );
}

// Establish the index page.
const IndexPage = () => {
  return (
    <main>
      <title>Libkernel Test Suite</title>
      <h1>Running Tests</h1>
      <LoginButton />
      <TestCard
        name="TestLibkernelInit"
        test={TestLibkernelInit}
        turn={getTurn()}
      />
      <TestCard
        name="TestGetKernelVersion"
        test={TestGetKernelVersion}
        turn={getTurn()}
      />
      <TestCard
        name="TestModuleLoadingRace"
        test={TestModuleLoadingRace}
        turn={getTurn()}
      />
      <TestCard
        name="TestModuleHasSeed"
        test={TestModuleHasSeed}
        turn={getTurn()}
      />
      <TestCard
        name="TestModuleLogging"
        test={TestModuleLogging}
        turn={getTurn()}
      />
      <TestCard
        name="TestModuleMissingModule"
        test={TestMissingModule}
        turn={getTurn()}
      />
      <TestCard
        name="TestModuleMalformedModule"
        test={TestMalformedModule}
        turn={getTurn()}
      />
      <TestCard
        name="TestModulePresentSeed"
        test={TestModulePresentSeed}
        turn={getTurn()}
      />
      <TestCard
        name="TestModuleMyskySeed"
        test={TestModuleMyskySeed}
        turn={getTurn()}
      />
      <TestCard
        name="TestModuleQueryKernel"
        test={TestModuleQueryKernel}
        turn={getTurn()}
      />
      <TestCard
        name="TestModuleCheckHelperSeed"
        test={TestModuleCheckHelperSeed}
        turn={getTurn()}
      />
      <TestCard
        name="TestViewTesterSeedByHelper"
        test={TestViewTesterSeedByHelper}
        turn={getTurn()}
      />
      <TestCard
        name="TestMirrorDomain"
        test={TestMirrorDomain}
        turn={getTurn()}
      />
      <TestCard
        name="TestTesterMirrorDomain"
        test={TestTesterMirrorDomain}
        turn={getTurn()}
      />
      <TestCard
        name="TestMethodFieldRequired"
        test={TestMethodFieldRequired}
        turn={getTurn()}
      />
      <TestCard
        name="TestResponseUpdates"
        test={TestResponseUpdates}
        turn={getTurn()}
      />
      <TestCard
        name="TestIgnoreResponseUpdates"
        test={TestIgnoreResponseUpdates}
        turn={getTurn()}
      />
      <TestCard
        name="TestModuleUpdateQuery"
        test={TestModuleUpdateQuery}
        turn={getTurn()}
      />
      <TestCard
        name="TestLibkernelQueryUpdates"
        test={TestLibkernelQueryUpdates}
        turn={getTurn()}
      />
      <TestCard name="TestBasicCORS" test={TestBasicCORS} turn={getTurn()} />
      <TestCard name="TestPortalConnection" test={TestPortalConnection} turn={getTurn()} />
      <TestCard name="TestPortalAuth" test={TestPortalAuth} turn={getTurn()} />
      <TestCard
        name="TestSecureRegistry"
        test={TestSecureRegistry}
        turn={getTurn()}
      />
      <TestCard
        name="TestSecureUploadAndDownload"
        test={TestSecureUploadAndDownload}
        turn={getTurn()}
      />
      <TestCard
        name="TestIndependentFileSmall"
        test={TestIndependentFileSmall}
        turn={getTurn()}
      />
      <TestCard name="TestChildWorkersDie" test={TestChildWorkersDie} turn={getTurn()} />
      <TestCard
        name="TestMsgSpeedSequential5k"
        test={TestMsgSpeedSequential5k}
        turn={getTurn()}
      />
      <TestCard
        name="TestModuleSpeedSeq20k"
        test={TestModuleSpeedSequential20k}
        turn={getTurn()}
      />
      <TestCard
        name="TestMsgSpeedParallel5k"
        test={TestMsgSpeedParallel5k}
        turn={getTurn()}
      />
      <TestCard
        name="TestModuleSpeedParallel20k"
        test={TestModuleSpeedParallel20k}
        turn={getTurn()}
      />
      <TestCard
        name="TestModuleHasErrors"
        test={TestModuleHasErrors}
        turn={getTurn()}
      />
      <TestCard
        name="TestHelperModuleHasErrors"
        test={TestHelperModuleHasErrors}
        turn={getTurn()}
      />
      <TestCard
        name="TestMyskyModuleHasErrors"
        test={TestMyskyModuleHasErrors}
        turn={getTurn()}
      />
      <TestCard
        name="TestKernelHasErrors"
        test={TestKernelHasErrors}
        turn={getTurn()}
      />
    </main>
  );
};

export default IndexPage;
