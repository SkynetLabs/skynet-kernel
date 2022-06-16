import resolve from "@rollup/plugin-node-resolve"

const background = {
	input: "build/background.js",
	output: {
		file: "dist/background.js",
		format: "cjs",
	},
	plugins: [resolve()],
}

const bootloader = {
	input: "build/bootloader.js",
	output: {
		file: "dist/bootloader.js",
		format: "cjs",
	},
	plugins: [resolve()],
}

export default [background, bootloader]
