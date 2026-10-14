/* eslint-disable no-console */
import { sql } from "drizzle-orm"

import { createDrizzleClient } from "../src/drizzle/client"
/**
 * schema/index.ts ではなくファイルを直接 import する。index は @repo/domain を import するテーブル定義を含み、
 * 本番の migration イメージ（@repo/domain をビルドしていない）で読み込めないため
 */
import { dictionaryEntries } from "../src/drizzle/schema/dictionary-entry"

import { convertEjdictLinesToEntries, type EjdictEntry } from "./ejdict"

/**
 * 英和辞書（EJDict-hand、https://github.com/kujirahand/EJDict）を dictionary_entries に投入する。
 *
 * ライセンス：取得元の README（このコミット）に
 * 「This is the English-Japanese Dictionary data (Public Domain / No Copyright).」
 * 「これはパブリックドメインの英和辞書データです。」「License: Public Domain CC0」とあり、LICENSE は CC0 1.0 Universal。
 * 2026-10-13 に確認した。版を上げるときは新しいコミットで同じ記載を確認してから EJDICT_COMMIT_SHA を変える。
 *
 * 何度流しても同じ結果になる（headword で upsert し、意味が変わった行だけ更新する）。既存の seed.ts と違い
 * NODE_ENV=production でもスキップしない（本番でも初回と辞書の版を上げるときに流す）。
 * 版を上げて EJDict から消えた見出し語は削除しない（残っても引けるだけで害が無いため）。
 */
const EJDICT_COMMIT_SHA = "9663055d59a8cb1a35078a71db7a09ff39305828"

/**
 * このコミットの src/ には a.txt〜z.txt があり（release/ は無い）、行は `見出し語<TAB>意味`。
 * 記号・数字で始まる見出し語（`$`、`'em`、`10-4`）は a.txt に入っている
 */
const EJDICT_FILE_LETTERS = "abcdefghijklmnopqrstuvwxyz".split("")

const BATCH_SIZE = 1000

const db = createDrizzleClient()

const buildEjdictFileUrl = (commitSha: string, letter: string): string =>
  `https://raw.githubusercontent.com/kujirahand/EJDict/${commitSha}/src/${letter}.txt`

const fetchEjdictLines = async (commitSha: string): Promise<string[]> => {
  const texts = await Promise.all(
    EJDICT_FILE_LETTERS.map(async (letter) => {
      const url = buildEjdictFileUrl(commitSha, letter)
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`)
      return response.text()
    }),
  )
  return texts.flatMap((text) => text.split(/\r?\n/))
}

const splitIntoBatches = (entries: EjdictEntry[], size: number): EjdictEntry[][] => {
  const batches: EjdictEntry[][] = []
  for (let index = 0; index < entries.length; index += size) {
    batches.push(entries.slice(index, index + size))
  }
  return batches
}

/**
 * 全件を 1 トランザクションで upsert する（途中で失敗したときに新旧の版が混ざらないように）
 */
const upsertDictionaryEntries = async (entries: EjdictEntry[]): Promise<void> => {
  await db.transaction(async (tx) => {
    for (const batch of splitIntoBatches(entries, BATCH_SIZE)) {
      await tx
        .insert(dictionaryEntries)
        .values(batch)
        .onConflictDoUpdate({
          set: { meaningJa: sql`excluded.meaning_ja`, updatedAt: new Date() },
          setWhere: sql`${dictionaryEntries.meaningJa} IS DISTINCT FROM excluded.meaning_ja`,
          target: dictionaryEntries.headword,
        })
    }
  })
}

const main = async () => {
  const lines = await fetchEjdictLines(EJDICT_COMMIT_SHA)
  const entries = convertEjdictLinesToEntries(lines)
  console.log(`Fetched EJDict-hand (${EJDICT_COMMIT_SHA}): ${lines.length} lines -> ${entries.length} entries`)
  await upsertDictionaryEntries(entries)
  const total = await db.$count(dictionaryEntries)
  console.log(`Seed dictionary completed: dictionary_entries has ${total} rows`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
