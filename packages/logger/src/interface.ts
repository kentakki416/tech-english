export type LogMetadata = Record<string, unknown>

export interface ILogger {
  debug(message: string, metadata?: LogMetadata): void

  info(message: string, metadata?: LogMetadata): void

  warn(message: string, metadata?: LogMetadata): void

  /**
   * エラーレベルのログ
   * Error オブジェクトを渡すと、スタックトレースも記録される
   */
  error(message: string, error?: Error, metadata?: LogMetadata): void
}
