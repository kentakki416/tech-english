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

const instantiateRedisClient = (params: CreateRedisClientOptions): Redis => {
  const url = params.url ?? resolveUrlFromEnv()
  return new Redis(url, params.options ?? {})
}
