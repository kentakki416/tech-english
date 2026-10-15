import type { ATTEMPT_STATUSES, WORD_LOOKUP_SOURCES } from "../const/attempt"

export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number]

export type WordLookupSource = (typeof WORD_LOOKUP_SOURCES)[number]

/**
 * 挑戦。提出時に採点結果と時間が入る（in_progress / expired の間は null）
 */
export type ReadingAttempt = {
  id: number
  correctCount: number | null
  /**
   * 画面を見ていた時間（秒）。提出時刻 − 開始時刻で切り詰めた値
   */
  elapsedSeconds: number | null
  isOvertime: boolean | null
  /**
   * 解答中に読み上げを聞いた段落の数（1 秒以上再生したブロック）
   */
  listenedBlockCount: number
  passageId: number
  questionCount: number | null
  startedAt: Date
  status: AttemptStatus
  /**
   * 提出時のユーザーの TZ での日付（YYYY-MM-DD）
   */
  studyDate: string | null
  submittedAt: Date | null
  /**
   * 開始時点の制限時間
   */
  timeLimitSeconds: number
  translatedBlockCount: number
  userId: number
  wordLookupCount: number
  createdAt: Date
  updatedAt: Date
}

/**
 * 設問ごとの回答と正誤（提出時点の正誤を固定して保存する）
 */
export type AttemptAnswer = {
  id: number
  attemptId: number
  isCorrect: boolean
  questionId: number
  /**
   * null は未回答
   */
  selectedChoiceIndex: number | null
  createdAt: Date
  updatedAt: Date
}

/**
 * 調べた単語
 */
export type AttemptWordLookup = {
  id: number
  attemptId: number
  /**
   * 用語集から引いた場合だけ。用語集の項目が消えると null になる
   */
  glossaryEntryId: number | null
  lemma: string
  passageId: number
  source: WordLookupSource
  surface: string
  userId: number
  createdAt: Date
  updatedAt: Date
}

/**
 * 英和辞書の項目（EJDict-hand）
 */
export type DictionaryEntry = {
  id: number
  /**
   * 見出し語（小文字）
   */
  headword: string
  meaningJa: string
  createdAt: Date
  updatedAt: Date
}
