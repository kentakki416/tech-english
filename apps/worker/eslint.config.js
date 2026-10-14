const baseConfig = require("@repo/eslint-config")
const dbBoundary = require("@repo/eslint-config/db-boundary")

/**
 * @repo/db（Drizzle）の import 境界（db-boundary）を有効にする。
 * 詳細と限界は packages/eslint-config/db-boundary.js を参照。
 */
module.exports = [...baseConfig, ...dbBoundary]
