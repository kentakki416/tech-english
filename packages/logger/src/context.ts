import { AsyncLocalStorage } from "async_hooks"

export interface LogContext {
  adminId?: number
  requestId?: string
  userId?: number | string
}

export const logContext = new AsyncLocalStorage<LogContext>()
