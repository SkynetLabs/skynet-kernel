import { deriveMyskyRootKeypair, sha512 } from "libskynet";

// DEFAULT_MYSKY_ROOT_MODULES lists out the set of modules that are allowed to
// receive the user's MySky root seed by default.
const DEFAULT_MYSKY_ROOT_MODULES = [
  "AQBmFdF14nfEQrERIknEBvZoTXxyxG8nejSjH6ebCqcFkQ", // Resolver link for Redsolver's Mysky Module
  "IABOv7_dkJwtuaFBeB6eTR32mSvtLsBRVffEY9yYL0v0rA", // Immutable link for the mysky test module
];

// This variable is the seed that got loaded into memory by the bootloader, and
// is the user seed. We keep this seed in memory, because if the user ever logs
// out the kernel is expected to refresh, which will clear the seed.
declare var userSeed: Uint8Array;

// Derive the active seed for this session. We define an active seed so that
// the user has control over changing accounts later, they can "change
// accounts" by switching up their active seed and then reloading all modules.
//
// NOTE: If we ever add functionality to change the active seed (which would be
// equivalent to the user switching accounts), we need to make sure that the
// myskyRootKeypair is no longer being derived from the userSeed, but rather
// changes its derivation to the new activeSeed. We only want to use the
// userSeed as the root for the myskyRootKeypair if the active seed is the
// "defaultUserActiveSeed".
let activeSeedSalt = new TextEncoder().encode("defaultUserActiveSeed");
let activeSeedPreimage = new Uint8Array(userSeed.length + activeSeedSalt.length);
activeSeedPreimage.set(userSeed, 0);
activeSeedPreimage.set(activeSeedSalt, userSeed.length);
let activeSeed = sha512(activeSeedPreimage).slice(0, 16);
let myskyRootKeypair = deriveMyskyRootKeypair(userSeed);

export { DEFAULT_MYSKY_ROOT_MODULES, activeSeed, myskyRootKeypair };
