// skylinkBitfield returns the 2 byte bitfield given the fetchSize. The offset
// is assumed to be zero, the version is assumed to be 1.
export function skylinkBitfield(fetchSize: number): Uint8Array {
  // Determine the mode and step of the skylink.
  let mode = 7;
  let step = 256;
  let base = 2048;
  if (fetchSize <= 2048 * 1024) {
    mode = 6;
    step = 128;
    base = 1024;
  }
  if (fetchSize <= 1024 * 1024) {
    mode = 5;
    step = 64;
    base = 512;
  }
  if (fetchSize <= 512 * 1024) {
    mode = 4;
    step = 32;
    base = 256;
  }
  if (fetchSize <= 256 * 1024) {
    mode = 3;
    step = 16;
    base = 128;
  }
  if (fetchSize <= 128 * 1024) {
    mode = 2;
    step = 8;
    base = 64;
  }
  if (fetchSize <= 64 * 1024) {
    mode = 1;
    step = 4;
    base = 32;
  }
  if (fetchSize <= 32 * 1024) {
    mode = 0;
    step = 4; // Special case, step does not halve
    base = 0; // Special case, base is 0
  }
  step = step * 1024;
  base = base * 1024;

  // Determine the fetchSize bits.
  let fsb = 0;
  for (let i = 1; i <= 8; i++) {
    if (base + i * step > fetchSize) {
      break;
    }
    fsb++;
  }

  // Build the final Uint8Array. First we slip in the 3 fsb bits, then we
  // slip in a '1' per mode, finally we slip in the 2 version bits.
  let num = fsb;
  for (let i = 0; i < mode; i++) {
    num = num << 1;
    num++;
  }
  // Version 1 corresponds to 2 empty bits in the bottom of the bitfield.
  num = num << 2;
  // Convert the num to a Uint8Array.
  const encoded = new Uint8Array(2);
  for (let i = 0; i < 2; i++) {
    const byte = num & 0xff;
    encoded[i] = byte;
    num = num >> 8;
  }
  return encoded;
}
