import { AsyncLocalStorage } from "async_hooks"

export interface LogContext {
  requestId?: string
  userId?: number | string
}

export const logContext = new AsyncLocalStorage<LogContext>()
