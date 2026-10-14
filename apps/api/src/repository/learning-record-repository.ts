import type { QuestionType } from "@repo/domain"

/**
 * 1 日（学習した日）の集計。学習した日は挑戦を提出した日か、単語帳で答えた日（vocabulary-cards README「学習記録への反映」）
 */
export type DailyStudySummary = {
  attemptCount: number
  /**
   * 単語帳で答えた枚数（同じカードに 2 回答えれば 2）
   */
  cardCount: number
  correctCount: number
  /**
   * 学習した日（YYYY-MM-DD）
   */
  date: string
  questionCount: number
  /**
   * 単語帳で「覚えた」を付けた数
   */
  rememberedCount: number
  /**
   * 挑戦のかかった時間と、単語帳でカードを見ていた時間の合計（秒）
   */
  studySeconds: number
}

/**
 * これまでの累計
 */
export type StudyTotals = {
  attemptCount: number
  correctCount: number
  /**
   * 解いた問題の数（同じ問題を 2 回解いても 1）
   */
  passageCount: number
  questionCount: number
  studySeconds: number
}

/**
 * 正答数と設問数
 */
export type AccuracyCount = { correctCount: number; questionCount: number }

/**
 * 設問の種類ごとの正答数と設問数
 */
export type QuestionTypeAccuracyCount = AccuracyCount & { type: QuestionType }

/**
 * 提出した挑戦の一覧の 1 行
 */
export type SubmittedAttempt = {
  id: number
  correctCount: number
  elapsedSeconds: number
  isOvertime: boolean
  listenedBlockCount: number
  passageId: number
  passageTitle: string
  questionCount: number
  /**
   * 学習した日（YYYY-MM-DD）
   */
  studyDate: string
  submittedAt: Date
  translatedBlockCount: number
  wordLookupCount: number
}

/**
 * 提出した挑戦の一覧の取得条件。cursor はその id の挑戦より後ろ（古い側）を返す
 */
export type FindSubmittedAttemptsOptions = { cursor?: number; date?: string; limit: number }

/**
 * 学習記録の集計（読み取りのみ）のリポジトリ。数えるのは status = 'submitted' の挑戦と、単語帳の答え（vocabulary_reviews）だけで、
 * 他のユーザーの行は含めない。
 *
 * reading_attempts と vocabulary_reviews から都度集計し、日付で合わせる（learning-record README「集計の方法」）。遅くなったら日ごとの集計テーブルに
 * 切り替える想定で、そのときはこの実装だけを差し替える（API の形は変えない）
 */
export interface LearningRecordRepository {
  /**
   * 学習した日（挑戦を提出した日と単語帳で答えた日。重複なし。日付の昇順）
   */
  findStudyDates(userId: number): Promise<string[]>
  /**
   * 提出した挑戦を新しい順（submitted_at desc, id desc）に limit 件。date を指定するとその日（学習した日）だけ。
   * cursor が他のユーザーの挑戦・存在しない id なら 0 件
   */
  findSubmittedAttempts(userId: number, options: FindSubmittedAttemptsOptions): Promise<SubmittedAttempt[]>
  /**
   * 設問の種類ごとの正答数と設問数（attempt_answers を設問の種類でまとめる）。設問の無い種類は返さない
   */
  summarizeAccuracyByQuestionType(userId: number): Promise<QuestionTypeAccuracyCount[]>
  /**
   * 期間内（from と to を含む）の日ごとの集計。学習した日（単語帳だけの日を含む）だけを日付の昇順で返す
   */
  summarizeByDate(userId: number, range: { from: string; to: string }): Promise<DailyStudySummary[]>
  /**
   * 和訳・単語・読み上げをどれも使っていない（translated_block_count = 0 かつ word_lookup_count = 0 かつ listened_block_count = 0）
   * 挑戦だけの正答数と設問数
   */
  summarizeNoAssistAccuracy(userId: number): Promise<AccuracyCount>
  /**
   * 累計。studySeconds だけ単語帳の秒数を含み、他は挑戦だけ
   */
  summarizeTotals(userId: number): Promise<StudyTotals>
}
