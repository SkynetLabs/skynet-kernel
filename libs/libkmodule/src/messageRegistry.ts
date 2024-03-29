import { callModule } from "./queries.js";
import { Ed25519Keypair, Err, addContextToErr } from "libskynet";

// RegistryReadResult establishes the return type for a registry read performed
// on the registry module.
interface RegistryReadResult {
  exists: boolean;
  deleted?: boolean;
  entryData?: Uint8Array;
  revision?: bigint;
}

// registryRead will perform a registry read on a portal. readEntry does not
// guarantee that the latest revision has been provided, however it does
// guarantee that the provided data has a matching signature.
function registryRead(publicKey: Uint8Array, dataKey: Uint8Array): Promise<[RegistryReadResult, Err]> {
  return new Promise((resolve) => {
    // Build the module call.
    const registryModule = "AQCovesg1AXUzKXLeRzQFILbjYMKr_rvNLsNhdq5GbYb2Q";
    const data = {
      publicKey,
      dataKey,
    };

    // Perform the module call and extract the data from the result.
    callModule(registryModule, "readEntry", data).then(([result, err]) => {
      if (err !== null) {
        resolve([{} as any, addContextToErr(err, "readEntry module call failed")]);
        return;
      }
      resolve([
        {
          exists: result.exists,
          entryData: result.entryData,
          revision: result.revision,
        },
        null,
      ]);
    });
  });
}

// registryWrite will perform a registry write on a portal.
//
// registryWrite is not considered a safe function, there are easy ways to
// misuse registryWrite such that user data will be lost. We recommend using a
// safe set of functions for writing to the registry such as getsetjson.
function registryWrite(
  keypair: Ed25519Keypair,
  dataKey: Uint8Array,
  entryData: Uint8Array,
  revision: BigInt
): Promise<[entryID: Uint8Array, err: Err]> {
  return new Promise((resolve) => {
    // Build the module call.
    const registryModule = "AQCovesg1AXUzKXLeRzQFILbjYMKr_rvNLsNhdq5GbYb2Q";
    const callData = {
      publicKey: keypair.publicKey,
      secretKey: keypair.secretKey,
      dataKey,
      entryData,
      revision,
    };

    // Call the module and extract the entryID.
    callModule(registryModule, "writeEntry", callData).then(([result, err]) => {
      if (err !== null) {
        resolve([new Uint8Array(0), addContextToErr(err, "writeEntry module call failed")]);
        return;
      }
      resolve([result.entryID, null]);
    });
  });
}

export { registryRead, registryWrite, RegistryReadResult };
