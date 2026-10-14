import {
  type AttemptAnswer,
  type AttemptWordLookup,
  type GlossaryEntry,
  numberParagraphs,
  type Passage,
  type PassageBlock,
  type PassageBlockType,
  type PassageDifficulty,
  type Question,
  type ReadingAttempt,
} from "@repo/domain"
import { type ApiErrorDetail, badRequestError, conflictError, err, notFoundError, ok, Result, unauthorizedError } from "@repo/errors"
import { logger } from "@repo/logger"

import { calculateAliveSince, calculateExpiresAt, isAttemptExpired } from "../lib/attempt-expiry"
import { buildAttribution, type PassageAttribution } from "../lib/build-attribution"
import {
  type AnswerInput,
  calculateWordsPerMinute,
  clampElapsedSeconds,
  gradeAnswers,
  hasAnswerKeyChanged,
  isOvertime,
} from "../lib/grade-attempt"
import { findEvidenceSegmentRange, type PassageSegment, segmentPassage, type SegmentWithRange } from "../lib/segment-passage"
import { formatDateInTimeZone } from "../lib/time-zone"
import type {
  AttemptContent,
  PassageRepository,
  ReadingAttemptRepository,
  ReadOptions,
  TransactionRunner,
  UserRepository,
  WordLookupWithMeaning,
} from "../repository"

type AttemptRepo = {
  passageRepository: PassageRepository
  readingAttemptRepository: ReadingAttemptRepository
  userRepository: UserRepository
}

/**
 * read replica の遅れを避けて primary から読む（書き込みの直後・同時操作の後の読み直し、書き込み API の前提の確認）
 */
const PRIMARY_READ: ReadOptions = { fromPrimary: true }

/**
 * 提出で受け取る調べた単語（調べた 1 回ごとに 1 件）。glossaryEntryId は source が glossary のときだけ持つ
 */
export type WordLookupInput = Pick<AttemptWordLookup, "glossaryEntryId" | "lemma" | "source" | "surface">

/**
 * 挑戦した問題の概要
 */
export type AttemptPassageView = Pick<Passage, "id" | "title" | "wordCount"> & { difficulty: PassageDifficulty }

/**
 * 本文の 1 ブロック。paragraphNumber は heading と code が null、segments は code のブロックが空
 */
export type AttemptBlockView = {
  lang: string | null
  paragraphNumber: number | null
  segments: PassageSegment[]
  text: string
  translationJa: string | null
  type: PassageBlockType
}

/**
 * 用語集の項目（位置はセグメントの glossaryEntryId で示すので持たない）
 */
export type AttemptGlossaryEntryView = Pick<GlossaryEntry, "id" | "lemma" | "meaningJa" | "noteJa" | "partOfSpeech" | "surface">

/**
 * 解答中の設問。正解・解説・根拠を持たない
 */
export type AttemptQuestionView = Pick<Question, "id" | "choices" | "orderIndex" | "prompt" | "type">

/**
 * 解答中の挑戦。用語集とセグメントから語義設問の対象語句を除く
 */
export type InProgressAttemptView = {
  id: number
  attribution: PassageAttribution
  blocks: AttemptBlockView[]
  expiresAt: Date
  glossary: AttemptGlossaryEntryView[]
  passage: AttemptPassageView
  questions: AttemptQuestionView[]
  serverNow: Date
  startedAt: Date
  status: "in_progress"
  /**
   * 開始時点の制限時間
   */
  timeLimitSeconds: number
}

/**
 * 根拠の位置。blockIndex のブロックのセグメントの [segmentStart, segmentEnd)
 */
export type EvidenceView = { blockIndex: number; quote: string; segmentEnd: number; segmentStart: number }

/**
 * 結果の設問。正解・解説・選択肢はいまの設問、selectedChoiceIndex と isCorrect は提出時に保存した値
 */
export type ResultQuestionView = AttemptQuestionView &
  Pick<Question, "correctChoiceIndex" | "explanationJa"> & {
    /**
     * 引用が本文に見つからなければ null
     */
    evidence: EvidenceView | null
    /**
     * 提出後に正解が直されて、保存した正誤といまの正解での正誤が食い違うか
     */
    isAnswerKeyChanged: boolean
    isCorrect: boolean
    /**
     * null は未回答
     */
    selectedChoiceIndex: number | null
  }

/**
 * 結果の「調べた単語」の 1 件
 */
export type ResultWordLookupView = Pick<WordLookupWithMeaning, "lemma" | "meaningJa" | "source" | "surface">

/**
 * 提出済みの挑戦（結果の形）。本文・用語集は語義設問の対象語句も含む
 */
export type SubmittedAttemptView = {
  id: number
  attribution: PassageAttribution
  blocks: AttemptBlockView[]
  correctCount: number
  elapsedSeconds: number
  glossary: AttemptGlossaryEntryView[]
  isOvertime: boolean
  passage: AttemptPassageView
  questionCount: number
  questions: ResultQuestionView[]
  startedAt: Date
  status: "submitted"
  studyDate: string
  submittedAt: Date
  /**
   * 開始時点の制限時間
   */
  timeLimitSeconds: number
  translatedBlockCount: number
  wordLookupCount: number
  /**
   * (source, 用語集の ID か見出し語) で重複を除き、最初に調べた順
   */
  wordLookups: ResultWordLookupView[]
  /**
   * elapsedSeconds が 0 なら null
   */
  wordsPerMinute: number | null
}

/**
 * 期限切れの挑戦
 */
export type ExpiredAttemptView = { id: number; passage: AttemptPassageView; startedAt: Date; status: "expired" }

/**
 * 挑戦の取得の結果
 */
export type AttemptView = ExpiredAttemptView | InProgressAttemptView | SubmittedAttemptView

/**
 * 問題の概要。挑戦がある問題は一度公開されているので難易度を必ず持つ（公開の条件。非公開に戻しても消えない）
 */
const buildPassageView = (passage: Passage): AttemptPassageView => {
  if (passage.difficulty === null) throw new Error(`Passage with an attempt has no difficulty: id=${passage.id}`)
  return { id: passage.id, difficulty: passage.difficulty, title: passage.title, wordCount: passage.wordCount }
}

/**
 * セグメントから位置を外す（位置は根拠のハイライトの計算に使い、レスポンスには出さない）
 */
const stripSegmentRange = ({ glossaryEntryId, kind, text }: SegmentWithRange): PassageSegment =>
  glossaryEntryId === undefined ? { kind, text } : { glossaryEntryId, kind, text }

/**
 * 本文のブロック（セグメントは位置を外して出す）
 */
const buildBlockViews = (blocks: PassageBlock[], segmentsByBlock: SegmentWithRange[][]): AttemptBlockView[] => {
  const paragraphNumbers = numberParagraphs(blocks)
  return blocks.map((block, index) => ({
    lang: block.lang ?? null,
    paragraphNumber: paragraphNumbers[index] ?? null,
    segments: (segmentsByBlock[index] ?? []).map(stripSegmentRange),
    text: block.text,
    translationJa: block.type === "code" ? null : block.translationJa ?? null,
    type: block.type,
  }))
}

const buildGlossaryViews = (glossary: GlossaryEntry[]): AttemptGlossaryEntryView[] =>
  glossary.map((entry) => ({
    id: entry.id,
    lemma: entry.lemma,
    meaningJa: entry.meaningJa,
    noteJa: entry.noteJa,
    partOfSpeech: entry.partOfSpeech,
    surface: entry.surface,
  }))

/**
 * 設問の、解答中にも出してよい列だけ（正解が混ざらないよう明示的に取り出す）
 */
const buildQuestionView = (question: Question): AttemptQuestionView => ({
  id: question.id,
  choices: question.choices,
  orderIndex: question.orderIndex,
  prompt: question.prompt,
  type: question.type,
})

/**
 * 解答中の形。語義設問の対象語句を用語集から外してからセグメントに分けるので、その語句は普通の単語になる（押すと辞書を引く）
 */
const buildInProgressView = (attempt: ReadingAttempt, content: AttemptContent, now: Date): InProgressAttemptView => {
  /**
   * 対象の語句を持つのは vocabulary の設問だけ
   */
  const hiddenGlossaryEntryIds = new Set(
    content.questions.flatMap((question) => (question.targetGlossaryEntryId === null ? [] : [question.targetGlossaryEntryId])),
  )
  const glossary = content.glossary.filter((entry) => !hiddenGlossaryEntryIds.has(entry.id))
  const { blocks } = content.passage

  return {
    id: attempt.id,
    attribution: buildAttribution(content.source, content.passage),
    blocks: buildBlockViews(blocks, segmentPassage(blocks, glossary)),
    expiresAt: calculateExpiresAt(attempt.startedAt),
    glossary: buildGlossaryViews(glossary),
    passage: buildPassageView(content.passage),
    questions: content.questions.map(buildQuestionView),
    serverNow: now,
    startedAt: attempt.startedAt,
    status: "in_progress",
    timeLimitSeconds: attempt.timeLimitSeconds,
  }
}

/**
 * 設問の根拠の引用を、根拠のブロックのセグメントの範囲にする。ブロックが無い・code のブロック・引用が見つからなければ null
 */
const locateEvidence = (question: Question, blocks: PassageBlock[], segmentsByBlock: SegmentWithRange[][]): EvidenceView | null => {
  const block = blocks[question.evidenceBlockIndex]
  const segments = segmentsByBlock[question.evidenceBlockIndex]
  if (!block || !segments) return null
  const range = findEvidenceSegmentRange(block.text, segments, question.evidenceQuote)
  if (!range) return null
  return { blockIndex: question.evidenceBlockIndex, quote: question.evidenceQuote, segmentEnd: range.end, segmentStart: range.start }
}

/**
 * 結果の「調べた単語」。(source, 用語集の ID か見出し語) で重複を除き、最初に調べた順（lookups は id の昇順）に並べる。
 * 用語集の項目が消された（ID が null になった）ものは見出し語で重複を除く
 */
const dedupeWordLookups = (lookups: WordLookupWithMeaning[]): ResultWordLookupView[] => {
  const seenKeys = new Set<string>()
  return lookups.flatMap((lookup) => {
    const key = lookup.source === "glossary" && lookup.glossaryEntryId !== null
      ? `glossary-id:${lookup.glossaryEntryId}`
      : `${lookup.source}-lemma:${lookup.lemma}`
    if (seenKeys.has(key)) return []
    seenKeys.add(key)
    return [{ lemma: lookup.lemma, meaningJa: lookup.meaningJa, source: lookup.source, surface: lookup.surface }]
  })
}

/**
 * 結果の形。用語集は全件（語義設問の対象語句も含む）でセグメントに分け、各設問の根拠をセグメントの範囲にする。
 * 正誤と自分の回答は保存値、正解・解説・選択肢はいまの設問（一度挑戦された問題は設問の数が変わらないので、どの設問にも回答がある）。
 * 提出後に正解が直されて両者が食い違う設問は isAnswerKeyChanged を true にする（提出時の採点は変えない）
 */
const buildSubmittedView = (
  attempt: ReadingAttempt,
  content: AttemptContent,
  answers: AttemptAnswer[],
  lookups: WordLookupWithMeaning[],
): SubmittedAttemptView => {
  const { correctCount, elapsedSeconds, isOvertime, questionCount, studyDate, submittedAt } = attempt
  /**
   * submitted の行は採点結果と時間を必ず持つ（reading_attempts_submitted_columns_check）
   */
  if (
    correctCount === null ||
    elapsedSeconds === null ||
    isOvertime === null ||
    questionCount === null ||
    studyDate === null ||
    submittedAt === null
  ) {
    throw new Error(`Submitted attempt has no result: id=${attempt.id}`)
  }
  const { blocks } = content.passage
  const segmentsByBlock = segmentPassage(blocks, content.glossary)
  const answerByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]))

  return {
    id: attempt.id,
    attribution: buildAttribution(content.source, content.passage),
    blocks: buildBlockViews(blocks, segmentsByBlock),
    correctCount,
    elapsedSeconds,
    glossary: buildGlossaryViews(content.glossary),
    isOvertime,
    passage: buildPassageView(content.passage),
    questionCount,
    questions: content.questions.map((question) => {
      const answer = answerByQuestionId.get(question.id)
      if (!answer) throw new Error(`Answer of submitted attempt not found: attemptId=${attempt.id}, questionId=${question.id}`)
      return {
        ...buildQuestionView(question),
        correctChoiceIndex: question.correctChoiceIndex,
        evidence: locateEvidence(question, blocks, segmentsByBlock),
        explanationJa: question.explanationJa,
        isAnswerKeyChanged: hasAnswerKeyChanged(answer, question.correctChoiceIndex),
        isCorrect: answer.isCorrect,
        selectedChoiceIndex: answer.selectedChoiceIndex,
      }
    }),
    startedAt: attempt.startedAt,
    status: "submitted",
    studyDate,
    submittedAt,
    timeLimitSeconds: attempt.timeLimitSeconds,
    translatedBlockCount: attempt.translatedBlockCount,
    wordLookupCount: attempt.wordLookupCount,
    wordLookups: dedupeWordLookups(lookups),
    wordsPerMinute: calculateWordsPerMinute(content.passage.wordCount, elapsedSeconds),
  }
}

/**
 * 提出済みの挑戦の回答と調べた単語を読んで結果の形にする
 */
const loadSubmittedView = async (
  attempt: ReadingAttempt,
  content: AttemptContent,
  readingAttemptRepository: ReadingAttemptRepository,
  options?: ReadOptions,
): Promise<SubmittedAttemptView> => {
  const [answers, lookups] = await Promise.all([
    readingAttemptRepository.findAnswersByAttemptId(attempt.id, options),
    readingAttemptRepository.findWordLookupsWithMeaning(attempt.id, options),
  ])
  return buildSubmittedView(attempt, content, answers, lookups)
}

const buildExpiredView = (attempt: ReadingAttempt, content: AttemptContent): ExpiredAttemptView => ({
  id: attempt.id,
  passage: buildPassageView(content.passage),
  startedAt: attempt.startedAt,
  status: "expired",
})

/**
 * 挑戦の開始。そのユーザーの期限切れの挑戦中を expired にしてから、期限内の挑戦中があればそれを返し（isCreated: false）、
 * 無ければ新しく作る（isCreated: true）。新しく始められるのは公開中の問題だけで、非公開に戻された問題でも挑戦中なら再開できる
 */
export const startAttempt = async (
  input: { now: Date; passageId: number; userId: number },
  repo: AttemptRepo,
): Promise<Result<{ isCreated: boolean; view: InProgressAttemptView }>> => {
  /**
   * 削除済みユーザーの access token が残っている場合（access token は JWT なので最長 15 分は失効させられない）
   */
  const user = await repo.userRepository.findById(input.userId)
  if (!user) {
    logger.debug("AttemptService: User not found", { userId: input.userId })
    return err(unauthorizedError("User not found"))
  }

  const aliveSince = calculateAliveSince(input.now)
  await repo.readingAttemptRepository.expireStale(input.userId, aliveSince)

  const content = await repo.passageRepository.findAttemptContentById(input.passageId)
  if (!content) {
    logger.debug("AttemptService: Passage not found", { passageId: input.passageId })
    return err(notFoundError("Passage not found"))
  }

  /**
   * 作るかどうかの前提の確認なので primary から読む（作った直後の挑戦中を read replica の遅れで見失って 2 つ目を作ろうとしないため）
   */
  const existing = await repo.readingAttemptRepository.findAliveInProgress(input.userId, input.passageId, aliveSince, PRIMARY_READ)
  if (existing) return ok({ isCreated: false, view: buildInProgressView(existing, content, input.now) })

  const { passage } = content
  if (passage.status !== "published") {
    logger.debug("AttemptService: Passage is not published", { passageId: input.passageId, status: passage.status })
    return err(notFoundError("Passage not found"))
  }
  /**
   * 公開中の問題は制限時間を必ず持つ（公開の条件）
   */
  if (passage.timeLimitSeconds === null) throw new Error(`Published passage has no time limit: id=${passage.id}`)

  const created = await repo.readingAttemptRepository.createInProgress({
    passageId: input.passageId,
    startedAt: input.now,
    timeLimitSeconds: passage.timeLimitSeconds,
    userId: input.userId,
  })
  /**
   * 同時に開始されて部分 unique index に当たったときは、先に作られた方を返す。
   * 作られたばかりの行は read replica にまだ届いていないことがあるので primary から読む
   */
  const attempt = created ?? await repo.readingAttemptRepository.findAliveInProgress(
    input.userId,
    input.passageId,
    aliveSince,
    PRIMARY_READ,
  )
  if (!attempt) throw new Error(`In-progress attempt disappeared after conflict: passageId=${input.passageId}, userId=${input.userId}`)
  if (created) logger.info("AttemptService: Attempt started", { attemptId: created.id, passageId: input.passageId, userId: input.userId })
  return ok({ isCreated: created !== null, view: buildInProgressView(attempt, content, input.now) })
}

/**
 * 自分の挑戦の取得。そのユーザーの期限切れの挑戦中を expired にしてから読む。他人の挑戦・存在しない ID は 404（存在を明かさない）。
 * 先に expireStale で書き込むので書き込み API と同じく primary から読む（開始・提出の直後の挑戦を read replica の遅れで見失わないため）
 */
export const getAttempt = async (
  input: { attemptId: number; now: Date; userId: number },
  repo: Omit<AttemptRepo, "userRepository">,
): Promise<Result<AttemptView>> => {
  await repo.readingAttemptRepository.expireStale(input.userId, calculateAliveSince(input.now))

  const attempt = await repo.readingAttemptRepository.findByIdForUser(input.attemptId, input.userId, PRIMARY_READ)
  if (!attempt) {
    logger.debug("AttemptService: Attempt not found", { attemptId: input.attemptId, userId: input.userId })
    return err(notFoundError("Attempt not found"))
  }

  /**
   * passages は物理削除しない（reading_attempts の外部キーは restrict）ので、挑戦があれば問題もある
   */
  const content = await repo.passageRepository.findAttemptContentById(attempt.passageId)
  if (!content) throw new Error(`Passage of attempt not found: attemptId=${attempt.id}, passageId=${attempt.passageId}`)

  if (attempt.status === "submitted") {
    /**
     * 挑戦を primary から読んだので、回答・調べた単語も primary から読む（提出の直後は read replica にまだ届いていないことがある）
     */
    return ok(await loadSubmittedView(attempt, content, repo.readingAttemptRepository, PRIMARY_READ))
  }
  /**
   * expireStale と同じ now で判定するので in_progress のまま読めるのは期限内のはずだが、念のため開始時刻でも期限を判定する
   */
  if (attempt.status === "expired" || isAttemptExpired(attempt.startedAt, input.now)) {
    return ok(buildExpiredView(attempt, content))
  }
  return ok(buildInProgressView(attempt, content, input.now))
}

/**
 * 回答の検証。この問題に無い設問・同じ設問への 2 回目の回答を、原因ごとに返す
 */
const validateAnswers = (answers: AnswerInput[], questions: Question[]): ApiErrorDetail[] => {
  const questionIds = new Set(questions.map((question) => question.id))
  const answeredIds = new Set<number>()
  return answers.flatMap((answer, index): ApiErrorDetail[] => {
    const path = ["answers", index, "question_id"]
    if (!questionIds.has(answer.questionId)) {
      return [{ code: "unknown_question", message: "This question is not in the passage", path }]
    }
    if (answeredIds.has(answer.questionId)) {
      return [{ code: "duplicate_question", message: "This question is answered more than once", path }]
    }
    answeredIds.add(answer.questionId)
    return []
  })
}

/**
 * 保存する調べた単語。glossary はこの問題の用語集にある ID だけ残して見出し語を用語集の値にし（無い ID は捨てて warn）、
 * dictionary は見出し語を小文字にする
 */
const resolveWordLookups = (lookups: WordLookupInput[], glossary: GlossaryEntry[], attemptId: number): WordLookupInput[] => {
  const glossaryById = new Map(glossary.map((entry) => [entry.id, entry]))
  const droppedGlossaryEntryIds: (number | null)[] = []
  const resolved = lookups.flatMap((lookup): WordLookupInput[] => {
    if (lookup.source === "dictionary") return [{ ...lookup, glossaryEntryId: null, lemma: lookup.lemma.toLowerCase() }]
    const entry = lookup.glossaryEntryId === null ? undefined : glossaryById.get(lookup.glossaryEntryId)
    if (!entry) {
      droppedGlossaryEntryIds.push(lookup.glossaryEntryId)
      return []
    }
    return [{ ...lookup, lemma: entry.lemma }]
  })
  if (droppedGlossaryEntryIds.length > 0) {
    logger.warn("AttemptService: Word lookups with unknown glossary entries are dropped", { attemptId, droppedGlossaryEntryIds })
  }
  return resolved
}

/**
 * 提出。採点は提出時点の設問で行い、かかった時間を壁時計で切り詰め、study_date をユーザーのタイムゾーンで決めて、
 * 挑戦・回答（全設問）・調べた単語を 1 トランザクションで保存する。
 * すでに提出済みなら入力を無視して保存済みの結果を返す（通信の再送で二重に記録しない）。期限切れは 409。
 * 書き込み API なので挑戦は primary から読む（作った直後・提出した直後の挑戦を read replica の遅れで見失わないため）
 */
export const submitAttempt = async (
  input: {
    activeSeconds: number
    answers: AnswerInput[]
    attemptId: number
    now: Date
    translatedBlockCount: number
    userId: number
    wordLookups: WordLookupInput[]
  },
  repo: AttemptRepo & { transactionRunner: TransactionRunner },
): Promise<Result<SubmittedAttemptView>> => {
  /**
   * 削除済みユーザーの access token が残っている場合
   */
  const user = await repo.userRepository.findById(input.userId)
  if (!user) {
    logger.debug("AttemptService: User not found", { userId: input.userId })
    return err(unauthorizedError("User not found"))
  }

  const attempt = await repo.readingAttemptRepository.findByIdForUser(input.attemptId, input.userId, PRIMARY_READ)
  if (!attempt) {
    logger.debug("AttemptService: Attempt not found", { attemptId: input.attemptId, userId: input.userId })
    return err(notFoundError("Attempt not found"))
  }

  /**
   * passages は物理削除しないので、挑戦があれば問題もある
   */
  const content = await repo.passageRepository.findAttemptContentById(attempt.passageId)
  if (!content) throw new Error(`Passage of attempt not found: attemptId=${attempt.id}, passageId=${attempt.passageId}`)

  if (attempt.status === "submitted") {
    logger.debug("AttemptService: Attempt is already submitted", { attemptId: attempt.id })
    return ok(await loadSubmittedView(attempt, content, repo.readingAttemptRepository, PRIMARY_READ))
  }
  if (attempt.status === "expired") {
    logger.debug("AttemptService: Attempt is expired", { attemptId: attempt.id })
    return err(conflictError("Attempt has expired"))
  }
  if (isAttemptExpired(attempt.startedAt, input.now)) {
    await repo.readingAttemptRepository.expireStale(input.userId, calculateAliveSince(input.now))
    logger.debug("AttemptService: Attempt is expired on submit", { attemptId: attempt.id, startedAt: attempt.startedAt })
    return err(conflictError("Attempt has expired"))
  }

  const invalidAnswers = validateAnswers(input.answers, content.questions)
  if (invalidAnswers.length > 0) {
    logger.debug("AttemptService: Invalid answers", { attemptId: attempt.id, invalidAnswers })
    return err(badRequestError("Invalid answers", invalidAnswers))
  }

  const graded = gradeAnswers(content.questions, input.answers)
  const elapsedSeconds = clampElapsedSeconds(input.activeSeconds, attempt.startedAt, input.now)
  const translatableBlockCount = content.passage.blocks.filter((block) => block.type !== "code").length
  const wordLookups = resolveWordLookups(input.wordLookups, content.glossary, attempt.id)

  const submitted = await repo.transactionRunner.run(async (tx) => {
    const marked = await repo.readingAttemptRepository.markSubmitted(
      {
        attemptId: attempt.id,
        correctCount: graded.correctCount,
        elapsedSeconds,
        /**
         * 開始時点の制限時間で判定する
         */
        isOvertime: isOvertime(elapsedSeconds, attempt.timeLimitSeconds),
        questionCount: content.questions.length,
        studyDate: formatDateInTimeZone(input.now, user.timezone),
        submittedAt: input.now,
        translatedBlockCount: Math.min(input.translatedBlockCount, translatableBlockCount),
        wordLookupCount: wordLookups.length,
      },
      tx,
    )
    /**
     * 同時に提出された（または期限切れにされた）ので何も挿入しない
     */
    if (!marked) return null
    await repo.readingAttemptRepository.insertAnswers(
      graded.answers.map((answer) => ({
        attemptId: attempt.id,
        isCorrect: answer.isCorrect,
        questionId: answer.questionId,
        selectedChoiceIndex: answer.selectedChoiceIndex,
      })),
      tx,
    )
    await repo.readingAttemptRepository.insertWordLookups(
      wordLookups.map((lookup) => ({
        attemptId: attempt.id,
        glossaryEntryId: lookup.glossaryEntryId,
        lemma: lookup.lemma,
        passageId: attempt.passageId,
        source: lookup.source,
        surface: lookup.surface,
        userId: input.userId,
      })),
      tx,
    )
    return marked
  })

  if (!submitted) {
    const latest = await repo.readingAttemptRepository.findByIdForUser(attempt.id, input.userId, PRIMARY_READ)
    if (latest?.status === "submitted") {
      logger.debug("AttemptService: Attempt was submitted concurrently", { attemptId: attempt.id })
      return ok(await loadSubmittedView(latest, content, repo.readingAttemptRepository, PRIMARY_READ))
    }
    /**
     * 提出の間に期限切れにされた（アカウントごと削除されたなら 404）
     */
    logger.debug("AttemptService: Attempt could not be submitted", { attemptId: attempt.id, status: latest?.status })
    return latest ? err(conflictError("Attempt has expired")) : err(notFoundError("Attempt not found"))
  }

  logger.info("AttemptService: Attempt submitted", {
    attemptId: submitted.id,
    correctCount: submitted.correctCount,
    elapsedSeconds: submitted.elapsedSeconds,
    userId: input.userId,
  })
  return ok(await loadSubmittedView(submitted, content, repo.readingAttemptRepository, PRIMARY_READ))
}
