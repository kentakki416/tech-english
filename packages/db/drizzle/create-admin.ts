/* eslint-disable no-console */
/**
 * admins に email を登録する。既にあれば何もしない（何度流しても同じ結果になる）
 *
 * 使い方:
 * - ローカル: pnpm --filter @repo/db admin:create --email someone@example.com
 * - dev / min / prd: GitHub Actions の「Admin Create」（.github/workflows/admin-create.yml）が、最後に deploy した migration イメージで流す
 *
 * 成功しても失敗しても、出力に email を出さない。本番の出力は CloudWatch Logs と Actions のログに残る
 * （email は Actions の入力として既に残るので、コマンドの出力にまで重ねない）
 */
import { parseArgs } from "node:util"

import { normalizeEmail } from "@repo/domain"

import { createDrizzleClient } from "../src/drizzle/client"
import { admins } from "../src/drizzle/schema"

/**
 * email として受け付ける形（空白と @ を含まない文字列 @ 空白と @ を含まない文字列）
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/

/**
 * エラーの code（Postgres の SQLSTATE や ECONNREFUSED など）を、cause をたどって最初に見つかったものを返す。
 * Drizzle のクエリのエラー（DrizzleQueryError）は code を持たず、cause に pg のエラーを持つ
 */
const findErrorCode = (error: unknown): string | undefined => {
  if (!(error instanceof Error)) return undefined
  if ("code" in error && typeof error.code === "string") return error.code
  if ("cause" in error) return findErrorCode(error.cause)
  return undefined
}

const main = async () => {
  const { values } = parseArgs({ options: { email: { type: "string" } } })
  if (!values.email || !EMAIL_PATTERN.test(values.email)) {
    console.error("Usage: admin:create --email <email>")
    process.exit(1)
  }
  const email = normalizeEmail(values.email)

  const db = createDrizzleClient()
  try {
    const [created] = await db
      .insert(admins)
      .values({ email })
      .onConflictDoNothing({ target: admins.email })
      .returning({ id: admins.id })
    console.log(created ? `Created admin (id=${created.id})` : "Admin already exists")
  } finally {
    await db.$disconnect()
  }
}

main().catch((e: unknown) => {
  /**
   * e の message は出さない。DrizzleQueryError は message に params（= email）を含み、pg のエラーの message も入力の値を含むことがある
   */
  const code = findErrorCode(e)
  console.error(code ? `Failed to create admin (code=${code})` : "Failed to create admin")
  process.exit(1)
})
