import { skylinkV1Bitfield, parseSkylinkBitfield } from "../src/skylinkbitfield.js";

test("skylinkV1Bitfield", () => {
  let tests = [
    { trial: 0n, result: 4096n },
    { trial: 1n, result: 4096n },
    { trial: 100n, result: 4096n },
    { trial: 200n, result: 4096n },
    { trial: 4095n, result: 4096n },
    { trial: 4096n, result: 4096n },
    { trial: 4097n, result: 8192n },
    { trial: 8191n, result: 8192n },
    { trial: 8192n, result: 8192n },
    { trial: 8193n, result: 12288n },
    { trial: 12287n, result: 12288n },
    { trial: 12288n, result: 12288n },
    { trial: 12289n, result: 16384n },
    { trial: 16384n, result: 16384n },
    { trial: 32767n, result: 32768n },
    { trial: 32768n, result: 32768n },
    { trial: 32769n, result: 36864n },
    { trial: 36863n, result: 36864n },
    { trial: 36864n, result: 36864n },
    { trial: 36865n, result: 40960n },
    { trial: 45056n, result: 45056n },
    { trial: 45057n, result: 49152n },
    { trial: 65536n, result: 65536n },
    { trial: 65537n, result: 73728n },
    { trial: 106496n, result: 106496n },
    { trial: 106497n, result: 114688n },
    { trial: 163840n, result: 163840n },
    { trial: 163841n, result: 180224n },
    { trial: 491520n, result: 491520n },
    { trial: 491521n, result: 524288n },
    { trial: 720896n, result: 720896n },
    { trial: 720897n, result: 786432n },
    { trial: 1572864n, result: 1572864n },
    { trial: 1572865n, result: 1703936n },
    { trial: 3407872n, result: 3407872n },
    { trial: 3407873n, result: 3670016n },
  ];

  let skylink = new Uint8Array(34);
  for (let i = 0; i < tests.length; i++) {
    let [bitfield, errSVB] = skylinkV1Bitfield(tests[i].trial);
    expect(errSVB).toBe(null);
    skylink.set(bitfield, 0);
    let [version, offset, fetchSize, errPSB] = parseSkylinkBitfield(skylink);
    expect(errPSB).toBe(null);
    expect(version).toBe(1n);
    expect(offset).toBe(0n);
    expect(fetchSize).toBe(tests[i].result);
  }
});
