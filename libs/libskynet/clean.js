import * as fs from "fs";
fs.rmSync("dist", { recursive: true, force: true });
fs.rmSync("dist-test", { recursive: true, force: true });
fs.rmSync("node_modules", { recursive: true, force: true });
