/**
 * ログに出すエラーの名前（`TimeoutError`・`ZodError` など）。認証の処理の失敗は、これと HTTP の status だけをログに出す。
 * message や中身には、送った値や api の応答（token・code・cookie・email）が入りうるため
 */
export const getErrorName = (error: unknown): string =>
  error instanceof Error ? error.name : typeof error
