import resolve from "@rollup/plugin-node-resolve";
import { terser } from "rollup-plugin-terser";

export default {
  input: "build/index.js",
  output: {
    file: "dist/index.js",
    format: "cjs",
  },
  plugins: [resolve(), terser()],
};
