import path from "node:path"

export const PACKAGE_DIR = path.resolve(__dirname, "..")

export const MIGRATIONS_DIR = path.join(PACKAGE_DIR, "drizzle/migrations")

export const DRIZZLE_CONFIG_PATH = "drizzle/drizzle.config.ts"

export const DRIZZLE_KIT_BIN_PATH = path.join(PACKAGE_DIR, "node_modules/.bin/drizzle-kit")
