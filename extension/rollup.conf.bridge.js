import resolve from "@rollup/plugin-node-resolve"

export default {
	input: "build/bridge.js",
	output: {
		file: "build/bridge.r.js",
		format: "cjs",
	},
	plugins: [resolve()],
}
