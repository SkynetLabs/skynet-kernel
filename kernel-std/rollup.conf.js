import resolve from "@rollup/plugin-node-resolve"

export default {
	input: "build/kernel.js",
	output: {
		file: "build/kernel.r.js",
		format: "cjs",
	},
	plugins: [resolve()],
}
