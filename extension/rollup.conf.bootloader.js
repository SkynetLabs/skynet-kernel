import resolve from "@rollup/plugin-node-resolve"

export default {
	input: "build/bootloader.js",
	output: {
		file: "build/bootloader.r.js",
		format: "cjs",
	},
	plugins: [resolve()],
}
