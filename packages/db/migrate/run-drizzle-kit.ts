import { spawn } from "node:child_process"

import { DRIZZLE_CONFIG_PATH, DRIZZLE_KIT_BIN_PATH, PACKAGE_DIR } from "./paths"

type RunDrizzleKitOptions = {
  /**
   * 指定すると、drizzle-kit はこのディレクトリのマイグレーションだけを見る
   */
  migrationsDir?: string
}

export const runDrizzleKit = async (command: "generate" | "migrate", args: string[], options: RunDrizzleKitOptions = {}): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(DRIZZLE_KIT_BIN_PATH, [command, `--config=${DRIZZLE_CONFIG_PATH}`, ...args], {
      cwd: PACKAGE_DIR,
      env: options.migrationsDir ? { ...process.env, DRIZZLE_MIGRATIONS_DIR: options.migrationsDir } : process.env,
      /**
       * generate は列のリネームなどで対話的に確認を求める
       */
      stdio: "inherit",
    })
    child.on("error", reject)
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`drizzle-kit ${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}`))
      }
    })
  })
