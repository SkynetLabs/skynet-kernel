// Set the distribution and version of this kernel. There may be other versions
// of the kernel in the world produced by other development teams, so openly
// declaring the version number and development team allows other pieces of
// software to determine what features are or are not supported.
//
// At some point we may want something like a capabilities array, but the
// ecosystem isn't mature enough to need that.
const KERNEL_DISTRO = "SkynetLabs";
const KERNEL_VERSION = "0.9.0";

export { KERNEL_DISTRO, KERNEL_VERSION };
