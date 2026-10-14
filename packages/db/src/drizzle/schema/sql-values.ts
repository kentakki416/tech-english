import { type SQL, sql } from "drizzle-orm"

/**
 * domain の定数（値の集合）を CHECK 制約の `IN (...)` に並べる SQL にする。
 * drizzle-kit はマイグレーションの生成時にリテラルとして展開する（文字列は 'docs', 'github'、数値は 1, 2, 3）
 */
export const joinSqlValues = (values: readonly (number | string)[]): SQL =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )
