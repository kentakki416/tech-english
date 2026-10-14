import { spawn } from "node:child_process"

type VersionedMigrationParams = {
  database: string
  migrationsDir: string
  password: string
  url: string
  username: string
}

/**
 * 未適用の migration を clickhouse-migrations で適用する。database が無ければ作る（ENGINE は指定しない）。
 *
 * ライブラリの関数（migration()）は呼ばず、CLI を子プロセスで起動する。
 * ライブラリはエラー時に process.exit(1) するため、呼び出し元でログや後始末を制御できない。
 */
export const runVersionedMigrations = async (params: VersionedMigrationParams): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [require.resolve("clickhouse-migrations/lib/cli.js"), "migrate"], {
      env: {
        /**
         * 親の CH_MIGRATIONS_* は引き継がない。SQL への環境変数の差し込み（CH_MIGRATIONS_SUBSTITUTE_ENV）など、
         * 設計で使わないと決めた設定が紛れ込まないようにする
         */
        ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("CH_MIGRATIONS_"))),
        CH_MIGRATIONS_DB: params.database,
        CH_MIGRATIONS_HOME: params.migrationsDir,
        CH_MIGRATIONS_HOST: params.url,
        CH_MIGRATIONS_PASSWORD: params.password,
        /**
         * アイドルから起きる ClickHouse Cloud の初回の応答を待てるよう、既定の 30 秒より延ばす
         */
        CH_MIGRATIONS_TIMEOUT: "120000",
        CH_MIGRATIONS_USER: params.username,
      },
      stdio: "inherit",
    })
    child.on("error", reject)
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`clickhouse-migrations exited with ${signal ? `signal ${signal}` : `code ${code}`}`))
      }
    })
  })
