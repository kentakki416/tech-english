import type { LogMetadata } from "./interface"

/**
 * ログ出力時にマスクする機密キー。
 * accessToken / refreshToken / password などをうっかり metadata に含めても
 * 平文で出力されないようにするためのデフォルトの除外キー集合。
 */
export const REDACT_KEYS = [
  "accessToken",
  "authorization",
  "password",
  "refreshToken",
  "secret",
  "token",
] as const

const REDACTED = "[REDACTED]"

const REDACT_KEYS_LOWER = new Set<string>(
  REDACT_KEYS.map((key) => key.toLowerCase()),
)

/**
 * pino の `redact.paths` 用のパス一覧を構築する。
 * top-level（例: `password`）と 1 階層ネスト（例: `*.password`）の両方をカバーする。
 */
export const buildPinoRedactPaths = (): string[] =>
  REDACT_KEYS.flatMap((key) => [key, `*.${key}`])

/**
 * 機密キーに該当する値を再帰的に `[REDACTED]` へ置き換える内部ヘルパ。
 */
const redactValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item))
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      result[key] = REDACT_KEYS_LOWER.has(key.toLowerCase())
        ? REDACTED
        : redactValue(child)
    }
    return result
  }
  return value
}

/**
 * metadata の中の機密キーをマスクしたコピーを返す。
 * pino のように native redact を持たない console / winston 実装で使う。
 */
export const redactMetadata = (
  metadata?: LogMetadata,
): LogMetadata | undefined => {
  if (!metadata) {
    return metadata
  }
  return redactValue(metadata) as LogMetadata
}
