import pino from "pino"

import { LOG_LEVEL, NODE_ENV } from "./const"
import { logContext } from "./context"
import type { ILogger, LogMetadata } from "./interface"
import { buildPinoRedactPaths } from "./redact"

type NodeEnv = typeof NODE_ENV[keyof typeof NODE_ENV]

/**
 * Pino Logger
 */
export class PinoLogger implements ILogger {
  private _logger: pino.Logger

  constructor() {
    const env = (process.env.NODE_ENV || NODE_ENV.DEV) as NodeEnv
    const logLevel = env === NODE_ENV.PRD ? LOG_LEVEL.INFO : LOG_LEVEL.DEBUG

    /**
     * 開発環境 (development) のみ pino-pretty で可読性向上。
     * 本番 (production) / テスト (test) / その他は JSON 形式で stdout に出力する。
     * test で pino-pretty を使うと worker thread が起動し、vitest で
     * 「open handle / プロセスが exit しない」やログノイズの原因になるため除外する。
     */
    this._logger = pino(
      {
        base: {
          env: env,
        },
        level: logLevel,
        mixin: () => {
          return logContext.getStore() || {}
        },
        /**
         * accessToken / refreshToken / password 等を誤って metadata に含めても
         * 平文で出さないよう、native redact でマスクする。
         */
        redact: {
          censor: "[REDACTED]",
          paths: buildPinoRedactPaths(),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      env === NODE_ENV.DEV
        ? pino.transport({
          options: {
            colorize: true,
            ignore: "pid,hostname",
            translateTime: "yyyy-mm-dd HH:MM:ss",
          },
          target: "pino-pretty",
        })
        : process.stdout
    )
  }

  public debug(message: string, metadata?: LogMetadata): void {
    this._logger.debug(metadata || {}, message)
  }

  public info(message: string, metadata?: LogMetadata): void {
    this._logger.info(metadata || {}, message)
  }

  public warn(message: string, metadata?: LogMetadata): void {
    this._logger.warn(metadata || {}, message)
  }

  public error(message: string, error?: Error, metadata?: LogMetadata): void {
    if (error) {
      this._logger.error(
        {
          err: {
            message: error.message,
            stack: error.stack,
          },
          ...metadata,
        },
        message
      )
    } else {
      this._logger.error(metadata || {}, message)
    }
  }
}
