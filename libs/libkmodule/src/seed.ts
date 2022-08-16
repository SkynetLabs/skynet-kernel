import { ActiveQuery, DataFn } from "./messages.js";

// Define a set of helper variables that track whether the seed has been
// received by the kernel yet.
let resolveSeed: DataFn;
const seedPromise: Promise<Uint8Array> = new Promise((resolve) => {
  resolveSeed = resolve;
});

// dataFromKernel will hold any data that is sent by the kernel in the
// 'presentSeed' call that happens at startup.
//
// dataFromKernel should not be accessed until 'seedPromise' has been resolved.
let dataFromKernel: any;

// getSeed will return a promise that resolves when the seed is available.
function getSeed(): Promise<Uint8Array> {
  return seedPromise;
}

// getDataFromKernel will resolve with the data that was provided by the kernel
// in 'presentSeed' once that data is available.
function getDataFromKernel(): Promise<any> {
  return new Promise((resolve) => {
    seedPromise.then(() => {
      resolve(dataFromKernel);
    });
  });
}

// handlePresentSeed will accept a seed from the kernel and unblock any method
// that is waiting for the seed.
function handlePresentSeed(aq: ActiveQuery) {
  dataFromKernel = aq.callerInput;
  resolveSeed(aq.callerInput.seed);
}

export { getDataFromKernel, getSeed, handlePresentSeed };
