import resolve from "@rollup/plugin-node-resolve"
import { terser } from "rollup-plugin-terser"

export default {
	input: "build/kernel.js",
	output: {
		file: "build/kernel.r.js",
		format: "cjs",
	},
	plugins: [resolve(), terser()],
}
