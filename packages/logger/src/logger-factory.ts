import { ConsoleLogger } from "./console-logger"
import { LOGGER_TYPE, type LoggerType } from "./const"
import type { ILogger } from "./interface"
import { PinoLogger } from "./pino-logger"
import { SilentLogger } from "./silent-logger"
import { WinstonLogger } from "./winston-logger"

/**
 * Logger Factory
 * 環境変数に基づいて適切な Logger インスタンスを生成
 */
export class LoggerFactory {
  private static _instance: ILogger | null = null

  /**
   * Logger インスタンスを取得（シングルトン）
   */
  public static getLogger(): ILogger {
    if (this._instance) {
      return this._instance
    }

    const loggerType = (process.env.LOGGER_TYPE || LOGGER_TYPE.PINO) as LoggerType

    this._instance = this.createLogger(loggerType)
    return this._instance
  }

  /**
   * Logger インスタンスを明示的に作成
   * テスト時などに使用
   */
  public static createLogger(type: LoggerType): ILogger {
    switch (type) {
    case LOGGER_TYPE.CONSOLE:
      return new ConsoleLogger()
    case LOGGER_TYPE.PINO:
      return new PinoLogger()
    case LOGGER_TYPE.SILENT:
      return new SilentLogger()
    case LOGGER_TYPE.WINSTON:
      return new WinstonLogger()
    default:
      return new WinstonLogger()
    }
  }

  /**
   * シングルトンインスタンスをリセット
   */
  public static reset(): void {
    this._instance = null
  }
}

/**
 * デフォルトの Logger インスタンス（アプリケーション全体で使用）。
 *
 * `import { logger } from "@repo/logger"` した時点で PinoLogger を生成（dev では
 * pino-pretty の worker thread 起動）してしまう eager な副作用を避けるため、
 * 実際にメソッドが呼ばれるまでインスタンス生成を遅延する Proxy で包む。
 * 型だけ欲しい / logger を使わない app（queue の producer 等）が無駄な
 * オープンハンドルや初期化コストを負わずに済む。
 */
export const logger: ILogger = new Proxy({} as ILogger, {
  get(target, property, receiver) {
    const instance = LoggerFactory.getLogger()
    const value = Reflect.get(instance as object, property, receiver)
    return typeof value === "function" ? value.bind(instance) : value
  },
})
