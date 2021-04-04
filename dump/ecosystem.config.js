module.exports = {
	apps: [
	{
		name: "api-sidecar",
		script: "./node_modules/.bin/substrate-api-sidecar",
		env: {
			NODE_ENV: "development",
		},
		env_production: {
			NODE_ENV: "production",
		}
	},
	{
		name: "indexer-block",
		script: "./lib/index.js",
		args: "scrape-block",
		env: {
			NODE_ENV: "development",
		},
		env_production: {
			NODE_ENV: "production",
		}
	},
	// {
	// 	name: "indexer-bucket",
	// 	script: "./lib/index.js",
	// 	args: "scrape-block",
	// 	env: {
	// 		NODE_ENV: "development",
	// 	},
	// 	env_production: {
	// 		NODE_ENV: "production",
	// 	}
	// }
	]
}
