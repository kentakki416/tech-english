import type { SubmitAttemptRequest } from "@repo/api-schema"

/**
 * 端末（localStorage）に保存する挑戦の途中経過。解答画面が書き、開始確認の再開の表示と結果画面が読む・消す。
 * ブラウザでだけ動かすので `server-only` を付けない。
 * localStorage はプライベートブラウズや容量超過で例外になるため、読み書きはすべて try / catch で包み、失敗しても画面は動かす
 */

/**
 * キーは挑戦 ID ごと（`attempt-progress:42`）
 */
export const ATTEMPT_PROGRESS_KEY_PREFIX = "attempt-progress:"

const ATTEMPT_PROGRESS_VERSION = 1

type SubmitWordLookup = SubmitAttemptRequest["word_lookups"][number]

export type AttemptProgress = {
  /**
   * 設問 ID → 選んだ選択肢の添字
   */
  answers: Record<number, number>
  elapsedSeconds: number
  /**
   * 和訳を一度でも見たブロックの添字
   */
  translatedBlockIndexes: number[]
  version: typeof ATTEMPT_PROGRESS_VERSION
  /**
   * 提出の word_lookups にそのまま使う
   */
  wordLookups: {
    glossaryEntryId: SubmitWordLookup["glossary_entry_id"]
    lemma: SubmitWordLookup["lemma"]
    source: SubmitWordLookup["source"]
    surface: SubmitWordLookup["surface"]
  }[]
}

export type WordLookupRecord = AttemptProgress["wordLookups"][number]

const buildKey = (attemptId: number): string => `${ATTEMPT_PROGRESS_KEY_PREFIX}${attemptId}`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * 保存の形が今の版と合っているか（古い版・壊れた値は読まない）
 */
const isAttemptProgress = (value: unknown): value is AttemptProgress =>
  isRecord(value)
  && value.version === ATTEMPT_PROGRESS_VERSION
  && isRecord(value.answers)
  && Object.values(value.answers).every(choice => typeof choice === "number")
  && typeof value.elapsedSeconds === "number"
  && Array.isArray(value.translatedBlockIndexes)
  && value.translatedBlockIndexes.every(index => typeof index === "number")
  && Array.isArray(value.wordLookups)
  && value.wordLookups.every(lookup => isRecord(lookup) && typeof lookup.lemma === "string" && typeof lookup.surface === "string")

/**
 * 保存が無い・版が違う・JSON が壊れている・localStorage が使えないときは null
 */
export const readAttemptProgress = (attemptId: number): AttemptProgress | null => {
  try {
    const raw = window.localStorage.getItem(buildKey(attemptId))
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return isAttemptProgress(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const writeAttemptProgress = (attemptId: number, progress: AttemptProgress): void => {
  try {
    window.localStorage.setItem(buildKey(attemptId), JSON.stringify(progress))
  } catch {
    /**
     * 保存できなくても解答は続けられる（別の端末で再開したときと同じく 0 からになるだけ）
     */
  }
}

export const removeAttemptProgress = (attemptId: number): void => {
  try {
    window.localStorage.removeItem(buildKey(attemptId))
  } catch {
    /**
     * 消せなくても次に同じ挑戦 ID を読むことは無いので無視する
     */
  }
}
