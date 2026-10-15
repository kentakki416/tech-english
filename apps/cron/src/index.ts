import { logger } from "@repo/logger"

/**
 * `pnpm dev` の起動確認用。本番では起動されない（スケジューラは `task/<name>` を直接起動する）。
 */
const main = (): void => {
  logger.info("cron package booted", { env: process.env.NODE_ENV ?? "local" })
}

main()
