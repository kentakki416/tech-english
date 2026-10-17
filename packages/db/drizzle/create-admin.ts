/* eslint-disable no-console */
/**
 * admins に email を登録する。既にあれば何もしない（何度流しても同じ結果になる）
 *
 * 使い方:
 * - ローカル: pnpm --filter @repo/db admin:create --email someone@example.com
 * - 本番: GitHub Actions の「Admin Create」（.github/workflows/admin-create.yml）が、最後に deploy した migration イメージで流す
 */
import { parseArgs } from "node:util"

import { normalizeEmail } from "@repo/domain"

import { createDrizzleClient } from "../src/drizzle/client"
import { admins } from "../src/drizzle/schema"

/**
 * email として受け付ける形（空白と @ を含まない文字列 @ 空白と @ を含まない文字列）
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/

const main = async () => {
  const { values } = parseArgs({ options: { email: { type: "string" } } })
  if (!values.email || !EMAIL_PATTERN.test(values.email)) {
    throw new Error("Usage: admin:create --email <email>")
  }
  const email = normalizeEmail(values.email)

  const db = createDrizzleClient()
  try {
    const [created] = await db
      .insert(admins)
      .values({ email })
      .onConflictDoNothing({ target: admins.email })
      .returning({ id: admins.id })
    /**
     * email は出さない。本番では Actions の入力として既にログに残るので、コマンドの出力にまで重ねない
     */
    console.log(created ? `Created admin (id=${created.id})` : "Admin already exists")
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
