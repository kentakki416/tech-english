import { type SQL, sql } from "@repo/db"

/**
 * 生の SQL で timestamp without time zone（UTC で保存している。@repo/db の columns.ts）を読み書きするときの変換。
 * Drizzle の select は列の型で変換するが、生の SQL（db.execute）は自分で変換する
 */

/**
 * UTC の時刻を `timestamp without time zone` の値にする。
 * Date をそのまま渡すと pg が Node のタイムゾーンのオフセットを付けて送り、列の型がそれを無視してずれるので、ISO 8601 の文字列で渡す
 * （timestamp without time zone への変換では、末尾の Z は無視される）
 */
export const convertInstantToUtcTimestamp = (instant: Date): SQL => sql`${instant.toISOString()}::timestamp`

/**
 * `::text` で読んだ timestamp without time zone（UTC。例 "2026-10-15 04:55:15.545"）を Date にする
 */
export const convertUtcTimestampTextToDate = (value: string): Date => new Date(`${value.replace(" ", "T")}Z`)
