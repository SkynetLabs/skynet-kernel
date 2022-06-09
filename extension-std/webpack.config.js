const path = require("path")

module.exports = {
	entry: {
		"src/background.ts": "./src/background.ts",
		"src/content-bootloader.ts": "./src/content-bootloader.ts",
		"src/content-bridge.ts": "./src/content-bridge.ts",
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: "ts-loader",
				exclude: /node_modules/,
			},
		],
	},
	resolve: {
		extensions: [".tsx", ".ts", ".js"],
	},
	output: {
		filename: "[name].js",
		path: path.resolve(__dirname, "dist"),
	},
	optimization: {
		minimize: false,
	},
}
