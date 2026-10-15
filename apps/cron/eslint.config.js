const baseConfig = require("@repo/eslint-config")
const dbBoundary = require("@repo/eslint-config/db-boundary")

module.exports = [...baseConfig, ...dbBoundary]
