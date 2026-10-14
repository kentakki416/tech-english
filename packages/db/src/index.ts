export { createDrizzleClient } from "./drizzle/client"
export type { CreateDrizzleClientOptions, DrizzleClient, DrizzleTransaction } from "./drizzle/client"
export * from "./drizzle/schema"

/**
 * Drizzle の Repository が使うクエリ演算子。
 *
 * app から drizzle-orm を直接 import させず、ここで re-export する。app が別に drizzle-orm を
 * 依存に持つと、peer dependency の解決次第で packages/db と別インスタンスになり、
 * テーブル定義と演算子の型が噛み合わなくなるため。必要な演算子が増えたらここに足す。
 */
export {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  ne,
  notExists,
  notInArray,
  or,
  sql,
} from "drizzle-orm"
