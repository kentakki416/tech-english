import { parseArgs } from "node:util"

export type CollectArgs = {
  dryRun: boolean
  /**
   * null は全ソース（有効なものだけ）
   */
  sourceId: number | null
}

const SOURCE_ID_PATTERN = /^\d+$/

/**
 * collect:passages の引数（`--source-id=3`、`--dry-run`）を読む。未知のフラグ・位置引数は throw する
 */
export const parseCollectArgs = (argv: string[]): CollectArgs => {
  const { values } = parseArgs({
    allowPositionals: false,
    args: argv,
    options: {
      "dry-run": { default: false, type: "boolean" },
      "source-id": { type: "string" },
    },
    strict: true,
  })
  const rawSourceId = values["source-id"]
  if (rawSourceId !== undefined && !SOURCE_ID_PATTERN.test(rawSourceId)) {
    throw new Error(`--source-id must be a non-negative integer: ${rawSourceId}`)
  }
  const sourceId = rawSourceId === undefined ? null : Number(rawSourceId)
  /**
   * 試し実行は文書を取得して表示するので、全ソースを対象にはしない
   */
  if (values["dry-run"] && sourceId === null) throw new Error("--dry-run requires --source-id")
  return { dryRun: values["dry-run"], sourceId }
}
