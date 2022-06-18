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

const bridge = {
	input: "build/bridge.js",
	output: {
		file: "dist/bridge.js",
		format: "cjs",
	},
	plugins: [resolve()],
}

export default [background, bootloader, bridge]
