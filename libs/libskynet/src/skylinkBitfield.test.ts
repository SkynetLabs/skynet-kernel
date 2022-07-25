import { skylinkV1Bitfield, parseSkylinkBitfield } from "../src/skylinkBitfield.js";

test.each([
  { dataSize: 0n, expectedFetchSize: 4096n },
  { dataSize: 1n, expectedFetchSize: 4096n },
  { dataSize: 100n, expectedFetchSize: 4096n },
  { dataSize: 200n, expectedFetchSize: 4096n },
  { dataSize: 4095n, expectedFetchSize: 4096n },
  { dataSize: 4096n, expectedFetchSize: 4096n },
  { dataSize: 4097n, expectedFetchSize: 8192n },
  { dataSize: 8191n, expectedFetchSize: 8192n },
  { dataSize: 8192n, expectedFetchSize: 8192n },
  { dataSize: 8193n, expectedFetchSize: 12288n },
  { dataSize: 12287n, expectedFetchSize: 12288n },
  { dataSize: 12288n, expectedFetchSize: 12288n },
  { dataSize: 12289n, expectedFetchSize: 16384n },
  { dataSize: 16384n, expectedFetchSize: 16384n },
  { dataSize: 32767n, expectedFetchSize: 32768n },
  { dataSize: 32768n, expectedFetchSize: 32768n },
  { dataSize: 32769n, expectedFetchSize: 36864n },
  { dataSize: 36863n, expectedFetchSize: 36864n },
  { dataSize: 36864n, expectedFetchSize: 36864n },
  { dataSize: 36865n, expectedFetchSize: 40960n },
  { dataSize: 45056n, expectedFetchSize: 45056n },
  { dataSize: 45057n, expectedFetchSize: 49152n },
  { dataSize: 65536n, expectedFetchSize: 65536n },
  { dataSize: 65537n, expectedFetchSize: 73728n },
  { dataSize: 106496n, expectedFetchSize: 106496n },
  { dataSize: 106497n, expectedFetchSize: 114688n },
  { dataSize: 163840n, expectedFetchSize: 163840n },
  { dataSize: 163841n, expectedFetchSize: 180224n },
  { dataSize: 491520n, expectedFetchSize: 491520n },
  { dataSize: 491521n, expectedFetchSize: 524288n },
  { dataSize: 720896n, expectedFetchSize: 720896n },
  { dataSize: 720897n, expectedFetchSize: 786432n },
  { dataSize: 1572864n, expectedFetchSize: 1572864n },
  { dataSize: 1572865n, expectedFetchSize: 1703936n },
  { dataSize: 3407872n, expectedFetchSize: 3407872n },
  { dataSize: 3407873n, expectedFetchSize: 3670016n },
])("skylinkV1Bitfield with data size $dataSize", ({ dataSize, expectedFetchSize }) => {
  const skylink = new Uint8Array(34);
  const [bitfield, errSVB] = skylinkV1Bitfield(dataSize);
  expect(errSVB).toBe(null);
  skylink.set(bitfield, 0);
  const [version, offset, fetchSize, errPSB] = parseSkylinkBitfield(skylink);
  expect(errPSB).toBe(null);
  expect(version).toBe(1n);
  expect(offset).toBe(0n);
  expect(fetchSize).toBe(expectedFetchSize);
});
