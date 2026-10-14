import AsyncStorage from "@react-native-async-storage/async-storage"

import type { SubmitAttemptRequest } from "@repo/api-schema"

/**
 * 端末（AsyncStorage）に保存する挑戦の途中経過。解答画面（step9）が書き、開始確認の再開の表示が読み、結果画面（step10）と期限切れの表示が消す。
 * 形は web の `attempt-progress.ts`（localStorage）と同じ。読み書きはすべて try / catch で包み、失敗しても画面は動かす
 */

/**
 * キーは挑戦 ID ごと（`attempt-progress:42`）。アカウント削除（github-auth step7）はこの接頭辞のキーをすべて消す
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
   * 読み上げを 1 秒以上聞いたブロックの添字。読み上げより前の版で保存したものには無い
   * （版は上げない。上げると解答中の挑戦の途中経過〈回答・経過秒数〉が読めなくなるため。web と同じ）
   */
  listenedBlockIndexes?: number[]
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
  && (value.listenedBlockIndexes === undefined
    || (Array.isArray(value.listenedBlockIndexes) && value.listenedBlockIndexes.every(index => typeof index === "number")))
  && Array.isArray(value.translatedBlockIndexes)
  && value.translatedBlockIndexes.every(index => typeof index === "number")
  && Array.isArray(value.wordLookups)
  && value.wordLookups.every(lookup => isRecord(lookup) && typeof lookup.lemma === "string" && typeof lookup.surface === "string")

/**
 * 保存が無い・版が違う・JSON が壊れている・AsyncStorage が読めないときは null
 */
export const readAttemptProgress = async (attemptId: number): Promise<AttemptProgress | null> => {
  try {
    const raw = await AsyncStorage.getItem(buildKey(attemptId))
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return isAttemptProgress(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * 版は書き込むときに付ける（呼び出し側は今の版を知らなくてよい）
 */
export const writeAttemptProgress = async (attemptId: number, progress: Omit<AttemptProgress, "version">): Promise<void> => {
  const value: AttemptProgress = { ...progress, version: ATTEMPT_PROGRESS_VERSION }
  try {
    await AsyncStorage.setItem(buildKey(attemptId), JSON.stringify(value))
  } catch {
    /**
     * 保存できなくても解答は続けられる（別の端末で再開したときと同じく 0 からになるだけ）
     */
  }
}

export const removeAttemptProgress = async (attemptId: number): Promise<void> => {
  try {
    await AsyncStorage.removeItem(buildKey(attemptId))
  } catch {
    /**
     * 消せなくても次に同じ挑戦 ID を読むことは無いので無視する
     */
  }
}
