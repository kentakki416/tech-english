export { createDrizzleClient } from "./drizzle/client"
export type { CreateDrizzleClientOptions, DrizzleClient, DrizzleTransaction } from "./drizzle/client"
export * from "./drizzle/schema"
export { createPrismaClient } from "./prisma/client"
export type { CreatePrismaClientOptions } from "./prisma/client"

/**
 * Drizzle の Repository が使うクエリ演算子。
 *
 * app から drizzle-orm を直接 import させず、ここで re-export する。app が別に drizzle-orm を
 * 依存に持つと、peer dependency の解決次第で packages/db と別インスタンスになり、
 * テーブル定義と演算子の型が噛み合わなくなるため。必要な演算子が増えたらここに足す。
 */
export { and, desc, eq, lt, sql } from "drizzle-orm"

/**
 * Prisma が生成するドメイン型 / 型ユーティリティを「型としてのみ」re-export する。
 *
 * `export *` だと PrismaClient クラス本体（runtime の値）まで公開され、app 側で
 * `new PrismaClient()` と書けて factory（createPrismaClient）を迂回できてしまう。
 * これは「factory のみ export」という共通パッケージの設計境界を壊すため、値は
 * 出さず型だけを明示 re-export する。利用側は
 * `import type { User, Memo, PrismaClient } from "@repo/db"` で参照する。
 */
export type {
  AuthAccount,
  Memo,
  Prisma,
  PrismaClient,
  User,
} from "../generated/client"
