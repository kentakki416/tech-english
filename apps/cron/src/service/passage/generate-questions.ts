import { calculateQuestionCount } from "@repo/domain"
import { logger } from "@repo/logger"

import {
  type ILlmClient,
  isFatalLlmError,
  type LlmEffort,
  LlmInvalidJsonError,
  LlmOutputTruncatedError,
  type LlmUsage,
} from "../../client/anthropic"
import {
  buildDraftContent,
  findVerificationMismatches,
  type GeneratedDraft,
  validateGeneratedOutput,
} from "../../lib/question-generation"
import {
  buildGenerateQuestionsUserContent,
  buildVerifyQuestionsUserContent,
  GENERATE_QUESTIONS_OUTPUT_JSON_SCHEMA,
  GENERATE_QUESTIONS_SYSTEM_PROMPT,
  type GenerateQuestionsOutput,
  PROMPT_VERSION,
  VERIFY_QUESTIONS_OUTPUT_JSON_SCHEMA,
  VERIFY_QUESTIONS_SYSTEM_PROMPT,
  verifyQuestionsOutputSchema,
} from "../../prompt"
import type { ClaimedPassage, PassageClaim, PassageRepository } from "../../repository"

/**
 * generating のままこの分数を超えた行は、前回の実行が途中で落ちたものとして collected に戻す
 */
const STALE_GENERATING_MINUTES = 30

/**
 * 失敗がこの回数に達したら failed にする
 */
const MAX_GENERATION_ATTEMPTS = 3

/**
 * 1 件の生成で LLM を呼ぶ回数の上限（検証に不合格なら理由を付けて 1 回だけ再生成する）
 */
const MAX_GENERATION_CALLS = 2

/**
 * 生成の出力の上限（思考のトークンを含む）。非ストリーミングで SDK のタイムアウト（10 分）に収まる目安
 */
const GENERATION_MAX_TOKENS = 16000

/**
 * 生成の effort。adaptive thinking と一緒に明示して送る。Claude Sonnet 5.5 の既定（high）と同じ値だが、明示しておくと
 * GENERATION_MODEL を既定の違うモデル（Claude Opus 5.5 は medium）に変えても下がらない。
 * structured output では low / medium のときに思考が max_tokens まで続くことがあり、high 以上ではほぼ起きない（Anthropic のドキュメント）。
 * max_tokens は SDK の非ストリーミングの上限に近く上げられないので、effort を下げずに出力の予算を確保する
 */
const GENERATION_EFFORT: LlmEffort = "high"

/**
 * 検証の出力の上限。設問番号と選択肢の index だけを返させる
 */
const VERIFICATION_MAX_TOKENS = 2000

const MILLIS_PER_MINUTE = 60 * 1000

/**
 * LLM が不向きと判定したのに理由が無いときの却下の理由
 */
const DEFAULT_UNSUITABLE_REASON = "LLM が題材に不向きと判定"

/**
 * 検証モデルの呼び出し・出力が使えなかったときの要確認の理由
 */
const VERIFICATION_FAILED_REASON = "検証モデルでの確認に失敗しました"

export type GenerateQuestionsInput = {
  generationModel: string
  maxPassagesPerRun: number
  /**
   * 確認待ちの下書きがこの件数以上なら生成しない（passageId の指定時は見ない）
   */
  maxPendingDrafts: number
  now: () => Date
  /**
   * 指定があればその 1 件だけ（collected でなければ throw）
   */
  passageId?: number
  /**
   * 選択肢のシャッフルに使う [0, 1) の乱数
   */
  random: () => number
  verificationModel: string
}

export type GenerateQuestionsResult = {
  draftCount: number
  /**
   * 失敗が上限に達して failed にした件数。1 件でもあれば task が exit 1 で終える
   */
  failedCount: number
  rejectedCount: number
  /**
   * 失敗したが上限に達していないので collected に戻した件数（次回の実行でやり直す。出力が max_tokens で切れたものを含む）。
   * draftCount と rejectedCount が 0 でこれが 1 以上（全件が失敗）なら task が exit 1 で終える
   */
  retryLaterCount: number
  skippedReason: "pending_drafts_limit" | null
}

type GenerateQuestionsRepo = {
  passageRepository: PassageRepository
}

type GenerateQuestionsDeps = {
  llmClient: ILlmClient
}

/**
 * 1 件の処理の結果。stale は claim が古く（別の実行に回収・再取得されて）保存できなかったもの
 */
type PassageOutcome = "draft" | "failed" | "rejected" | "retry_later" | "stale"

/**
 * 生成の結果。不合格（invalid）のときは最後の不合格の理由、出力が上限で切れた（truncated）ときはそのエラーを持つ
 */
type GenerationResult =
  | { model: string; ok: true; output: GenerateQuestionsOutput; usage: LlmUsage }
  | { errors: string[]; ok: false; reason: "invalid"; usage: LlmUsage }
  | { error: LlmOutputTruncatedError; ok: false; reason: "truncated"; usage: LlmUsage }

/**
 * 解答キーを見ない検証の結果。fatalError は API キーやモデル ID の誤り（下書きを保存してからタスクを止める）
 */
type VerificationResult = {
  attentionReasons: string[]
  fatalError: unknown
  usage: LlmUsage | null
  verificationChoiceIndexes: (number | null)[]
}

const EMPTY_USAGE: LlmUsage = { cacheCreationInputTokens: 0, cacheReadInputTokens: 0, inputTokens: 0, outputTokens: 0 }

const sumUsage = (left: LlmUsage, right: LlmUsage): LlmUsage => ({
  cacheCreationInputTokens: left.cacheCreationInputTokens + right.cacheCreationInputTokens,
  cacheReadInputTokens: left.cacheReadInputTokens + right.cacheReadInputTokens,
  inputTokens: left.inputTokens + right.inputTokens,
  outputTokens: left.outputTokens + right.outputTokens,
})

/**
 * generation_error に残す「種類: メッセージ」
 */
const describeError = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error)
  const kind = error.name === "Error" ? error.constructor.name : error.name
  return `${kind}: ${error.message}`
}

/**
 * 生成して検証する。不合格（JSON でない出力を含む）なら不合格の理由を付けて 1 回だけ再生成する。
 * 出力が max_tokens で切れたら再生成せずに返す（思考のトークンも上限に含まれるので、同じ上限ですぐに作り直しても切れやすく、
 * 費用だけが増える。一時的な失敗として次の実行に回す）。API エラー・拒否はそのまま throw する
 */
const generateValidOutput = async (
  passage: ClaimedPassage,
  input: GenerateQuestionsInput,
  deps: GenerateQuestionsDeps,
): Promise<GenerationResult> => {
  let retryErrors: string[] = []
  let usage = EMPTY_USAGE
  for (let call = 1; call <= MAX_GENERATION_CALLS; call++) {
    try {
      const response = await deps.llmClient.createStructuredMessage({
        adaptiveThinking: { effort: GENERATION_EFFORT },
        jsonSchema: GENERATE_QUESTIONS_OUTPUT_JSON_SCHEMA,
        maxTokens: GENERATION_MAX_TOKENS,
        model: input.generationModel,
        system: GENERATE_QUESTIONS_SYSTEM_PROMPT,
        userContent: buildGenerateQuestionsUserContent({
          blocks: passage.blocks,
          questionCount: calculateQuestionCount(passage.wordCount),
          retryErrors,
          title: passage.title,
          wordCount: passage.wordCount,
        }),
      })
      usage = sumUsage(usage, response.usage)
      const validation = validateGeneratedOutput(response.json, passage)
      if (validation.ok) return { model: response.model, ok: true, output: validation.output, usage }
      retryErrors = validation.errors
    } catch (error) {
      if (error instanceof LlmOutputTruncatedError) return { error, ok: false, reason: "truncated", usage }
      if (!(error instanceof LlmInvalidJsonError)) throw error
      retryErrors = [error.message]
    }
    logger.info("generated output was rejected by validation", { call, errors: retryErrors, passageId: passage.id })
  }
  return { errors: retryErrors, ok: false, reason: "invalid", usage }
}

/**
 * 検証モデルの回答が設問ごとにちょうど 1 つずつあるか
 */
const hasOneAnswerPerQuestion = (answers: { questionNumber: number }[], questionCount: number): boolean => {
  const questionNumbers = new Set(answers.map((answer) => answer.questionNumber))
  return (
    answers.length === questionCount &&
    questionNumbers.size === questionCount &&
    [...questionNumbers].every((questionNumber) => questionNumber >= 1 && questionNumber <= questionCount)
  )
}

/**
 * 解答キーを見ない検証。本文とシャッフル後の設問・選択肢だけを検証モデルに渡し、正解と食い違った設問を要確認にする。
 * API エラー・出力の不備では生成を捨てず、検証なし（verificationChoiceIndex = null）で要確認の理由を返す
 */
const verifyDraft = async (
  passage: ClaimedPassage,
  draft: GeneratedDraft,
  input: GenerateQuestionsInput,
  deps: GenerateQuestionsDeps,
): Promise<VerificationResult> => {
  const unverified = (usage: LlmUsage | null, fatalError: unknown = null): VerificationResult => ({
    attentionReasons: [VERIFICATION_FAILED_REASON],
    fatalError,
    usage,
    verificationChoiceIndexes: draft.questions.map(() => null),
  })
  try {
    const response = await deps.llmClient.createStructuredMessage({
      jsonSchema: VERIFY_QUESTIONS_OUTPUT_JSON_SCHEMA,
      maxTokens: VERIFICATION_MAX_TOKENS,
      model: input.verificationModel,
      system: VERIFY_QUESTIONS_SYSTEM_PROMPT,
      userContent: buildVerifyQuestionsUserContent({
        blocks: passage.blocks,
        questions: draft.questions.map((question) => ({ choices: question.choices, prompt: question.prompt })),
        title: passage.title,
        wordCount: passage.wordCount,
      }),
    })
    const parsed = verifyQuestionsOutputSchema.safeParse(response.json)
    if (!parsed.success || !hasOneAnswerPerQuestion(parsed.data.answers, draft.questions.length)) {
      logger.warn("verification output does not answer each question once; saved without verification", {
        passageId: passage.id,
      })
      return unverified(response.usage)
    }
    const mismatches = findVerificationMismatches(draft.questions, parsed.data.answers)
    return { ...mismatches, fatalError: null, usage: response.usage }
  } catch (error) {
    logger.warn("verification failed; saved without verification", { error: describeError(error), passageId: passage.id })
    return unverified(null, isFatalLlmError(error) ? error : null)
  }
}

/**
 * 失敗を記録する。上限に達したら failed、それ以外は collected に戻す
 */
const recordFailure = async (
  claim: PassageClaim,
  error: string,
  repo: GenerateQuestionsRepo,
): Promise<PassageOutcome> => {
  const status = await repo.passageRepository.recordGenerationFailure(claim, { error, maxAttempts: MAX_GENERATION_ATTEMPTS })
  if (status === null) return "stale"
  return status === "failed" ? "failed" : "retry_later"
}

/**
 * 1 件分。生成 → 検証と後処理 → 解答キーを見ない検証 → 保存。
 * 生成の API エラー・拒否などは throw する（呼び出し側が失敗として記録する。API キー・モデル ID の誤りは claim を戻してタスクを止める）
 */
const processPassage = async (
  passage: ClaimedPassage,
  claim: PassageClaim,
  input: GenerateQuestionsInput,
  repo: GenerateQuestionsRepo,
  deps: GenerateQuestionsDeps,
): Promise<PassageOutcome> => {
  const generation = await generateValidOutput(passage, input, deps)
  if (!generation.ok && generation.reason === "truncated") {
    const error = describeError(generation.error)
    const outcome = await recordFailure(claim, error, repo)
    /**
     * 出力が上限で切れた（思考が長引いたか、出力が長すぎる）。output_tokens と上限を出して頻度を追えるようにする
     */
    logger.warn("passage generation failed", {
      error,
      generationUsage: generation.usage,
      maxTokens: GENERATION_MAX_TOKENS,
      outcome,
      outputTokens: generation.error.outputTokens,
      passageId: passage.id,
      stopReason: generation.error.stopReason,
    })
    return outcome
  }
  if (!generation.ok) {
    const outcome = await recordFailure(claim, `validation failed: ${generation.errors.join("; ")}`, repo)
    logger.warn("passage generation failed", {
      errors: generation.errors,
      generationUsage: generation.usage,
      outcome,
      passageId: passage.id,
    })
    return outcome
  }

  if (!generation.output.isSuitable) {
    const reason = generation.output.unsuitableReason?.trim()
    const isUpdated = await repo.passageRepository.markRejectedByLlm(
      claim,
      {
        generationModel: generation.model,
        generationPromptVersion: PROMPT_VERSION,
        reason: reason ? reason : DEFAULT_UNSUITABLE_REASON,
      },
      input.now(),
    )
    const outcome: PassageOutcome = isUpdated ? "rejected" : "stale"
    logger.info("passage processed", {
      generationUsage: generation.usage,
      outcome,
      passageId: passage.id,
      unsuitableReason: generation.output.unsuitableReason,
    })
    return outcome
  }

  const { content, droppedGlossary } = buildDraftContent({
    blocks: passage.blocks,
    output: generation.output,
    random: input.random,
    wordCount: passage.wordCount,
  })
  const verification = await verifyDraft(passage, content, input, deps)
  const attentionReasons = [...content.attentionReasons, ...verification.attentionReasons]
  const isSaved = await repo.passageRepository.saveDraft(
    claim,
    {
      ...content,
      attentionReasons,
      generationModel: generation.model,
      generationPromptVersion: PROMPT_VERSION,
      questions: content.questions.map((question, index) => ({
        ...question,
        verificationChoiceIndex: verification.verificationChoiceIndexes[index] ?? null,
      })),
    },
    input.now(),
  )
  const outcome: PassageOutcome = isSaved ? "draft" : "stale"
  logger.info("passage processed", {
    attentionReasons,
    droppedGlossary,
    generationUsage: generation.usage,
    outcome,
    passageId: passage.id,
    verificationUsage: verification.usage,
  })
  /**
   * 検証モデルの ID の誤りなどは、下書きを保存した（生成の費用を無駄にしない）うえでタスクを止める
   */
  if (verification.fatalError) throw verification.fatalError
  return outcome
}

/**
 * 取得する件数。passageId の指定時は下書きの上限を見ない。0 なら下書きが上限に達している
 */
const calculateClaimLimit = async (input: GenerateQuestionsInput, repo: GenerateQuestionsRepo): Promise<number> => {
  if (input.passageId !== undefined) return 1
  const pendingDraftCount = await repo.passageRepository.countByStatus("draft")
  return Math.max(0, Math.min(input.maxPassagesPerRun, input.maxPendingDrafts - pendingDraftCount))
}

/**
 * generate:questions の本体。collected の本文候補から設問・和訳・用語集を生成して draft にする。
 *
 * 1. 下書きの件数が上限以上なら何もせず終える（passageId の指定時は見ない）
 * 2. generating のまま 30 分以上たった行を collected に戻す
 * 3. 上限の件数まで、1 件ずつ「collected の最も古い行を generating にしながら取る（FOR UPDATE SKIP LOCKED）→ 処理する」を繰り返す。
 *    まとめて取らないのは、全件に同じ generation_started_at が入り、実行が 30 分を超えたときに後半の行が別の実行に回収・再取得されて
 *    LLM の費用が二重にかかるため（1 件ずつ取れば、各行の generation_started_at はその行を取った時刻になる）。
 *    passageId の指定で取れなければ throw
 * 4. 1 件の失敗で他の件は止めない。API キー・モデル ID の誤りはその行を collected に戻して throw する
 */
export const generateQuestions = async (
  input: GenerateQuestionsInput,
  repo: GenerateQuestionsRepo,
  deps: GenerateQuestionsDeps,
): Promise<GenerateQuestionsResult> => {
  const result: GenerateQuestionsResult = {
    draftCount: 0,
    failedCount: 0,
    rejectedCount: 0,
    retryLaterCount: 0,
    skippedReason: null,
  }
  const limit = await calculateClaimLimit(input, repo)
  if (limit === 0) {
    logger.info("pending drafts reached the limit; generation is skipped", { maxPendingDrafts: input.maxPendingDrafts })
    return { ...result, skippedReason: "pending_drafts_limit" }
  }

  const releasedCount = await repo.passageRepository.releaseStaleGenerating(
    new Date(input.now().getTime() - STALE_GENERATING_MINUTES * MILLIS_PER_MINUTE),
  )
  if (releasedCount > 0) logger.warn("stale generating passages were released", { releasedCount })

  for (let claimedCount = 0; claimedCount < limit; claimedCount++) {
    const passage = await repo.passageRepository.claimNextCollected({ now: input.now(), passageId: input.passageId })
    if (!passage) {
      if (input.passageId === undefined) break
      const status = await repo.passageRepository.findStatusById(input.passageId)
      throw new Error(
        status === null
          ? `Passage not found: id=${input.passageId}`
          : `Passage is not collected: id=${input.passageId}, status=${status} (a collected passage may also be locked by another run)`,
      )
    }
    logger.info("passage claimed", { generationStartedAt: passage.generationStartedAt, passageId: passage.id })

    const claim: PassageClaim = { generationStartedAt: passage.generationStartedAt, id: passage.id }
    let outcome: PassageOutcome
    try {
      outcome = await processPassage(passage, claim, input, repo, deps)
    } catch (error) {
      /**
       * 設定の誤りで全件の失敗回数を増やさないよう、失敗を記録せずに戻して止める（まだ取っていない行はそのまま残る）。
       * 下書きを保存した後なら claim のガードで何も更新しない
       */
      if (isFatalLlmError(error)) {
        await repo.passageRepository.releaseClaim(claim)
        throw error
      }
      const description = describeError(error)
      outcome = await recordFailure(claim, description, repo)
      logger.warn("passage generation failed", { error: description, outcome, passageId: passage.id })
    }
    if (outcome === "draft") result.draftCount++
    if (outcome === "failed") result.failedCount++
    if (outcome === "rejected") result.rejectedCount++
    if (outcome === "retry_later") result.retryLaterCount++
    if (outcome === "stale") logger.warn("passage was reclaimed by another run; the result was discarded", { passageId: passage.id })
  }
  return result
}
