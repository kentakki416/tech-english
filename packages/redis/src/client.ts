import Redis, { type RedisOptions } from "ioredis"

export type CreateRedisClientOptions = {
  /** 省略時は process.env.REDIS_URL、それも無ければ localhost にフォールバック */
  url?: string
  /** BullMQ の Worker は maxRetriesPerRequest: null が必須 */
  options?: RedisOptions
  /**
   * ioredis は再接続失敗時に `error` を emit し、**リスナが無いと常駐プロセスが落ちる**。
   * 省略時は console.error にフォールバックするが、各 app の logger を渡すのが望ましい。
   */
  onError?: (error: Error) => void
}

const DEFAULT_URL = "redis://localhost:6380"

const resolveUrlFromEnv = (): string => process.env.REDIS_URL ?? DEFAULT_URL

/**
 * 各 app の src/index.ts で 1 回呼んで Repository に DI する。
 * BullMQ や Pub/Sub の subscriber は別接続が必須なので用途ごとに呼ぶ。
 */
export const createRedisClient = (params: CreateRedisClientOptions = {}): Redis => {
  const client = instantiateRedisClient(params)
  const onError = params.onError ?? ((error: Error): void => {
    console.error("[redis] connection error:", error.message)
  })
  client.on("error", onError)
  return client
}

/**
 * url / 環境変数のいずれかから ioredis インスタンスを生成する内部ヘルパ。
 */
const instantiateRedisClient = (params: CreateRedisClientOptions): Redis => {
  const url = params.url ?? resolveUrlFromEnv()
  return new Redis(url, params.options ?? {})
}
