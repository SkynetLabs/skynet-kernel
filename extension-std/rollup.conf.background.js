import resolve from "@rollup/plugin-node-resolve"

export default {
	input: "build/background.js",
	output: {
		file: "build/background.r.js",
		format: "cjs",
	},
	plugins: [resolve()],
}
