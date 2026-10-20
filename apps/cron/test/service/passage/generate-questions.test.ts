import { AuthenticationError, InternalServerError, NotFoundError } from "@anthropic-ai/sdk"

import {
  LlmInvalidJsonError,
  LlmOutputTruncatedError,
  LlmRefusalError,
  type StructuredMessageRequest,
  type StructuredMessageResponse,
} from "../../../src/client/anthropic"
import { PROMPT_VERSION } from "../../../src/prompt"
import type { ClaimedPassage, DraftContent, PassageRepository } from "../../../src/repository"
import { generateQuestions, type GenerateQuestionsInput } from "../../../src/service/passage"
import { buildGeneratedOutput, buildQuestion, PASSAGE } from "../../lib/question-generation/helpers"

/**
 * 1 件ごとのログ（捨てた用語集・usage・失敗）を確かめるため logger を差し替える（@repo/logger の logger は Proxy で spyOn できない）
 */
const { infoMock, warnMock } = vi.hoisted(() => ({ infoMock: vi.fn(), warnMock: vi.fn() }))
vi.mock("@repo/logger", () => ({ logger: { debug: vi.fn(), error: vi.fn(), info: infoMock, warn: warnMock } }))

const NOW = new Date("2026-10-13T03:00:00.000Z")

const STARTED_AT = new Date("2026-10-13T03:00:00.123Z")

const GENERATION_MODEL = "claude-sonnet-5-5"

const VERIFICATION_MODEL = "claude-haiku-4-5-20251001"

const USAGE = { cacheCreationInputTokens: 0, cacheReadInputTokens: 1200, inputTokens: 800, outputTokens: 3000 }

const API_ERROR_HEADERS = new Headers()

const buildApiErrorBody = (type: string) => ({ error: { message: "error", type }, type: "error" })

/**
 * random が常に 0 のとき、選択肢は [1, 2, 3, 0] の順に並ぶ。正解の位置は Q1: 0 → 3、Q2: 1 → 0、Q3: 2 → 1
 */
const SHUFFLED_CORRECT_CHOICE_INDEXES = [3, 0, 1]

const buildPassage = (id: number): ClaimedPassage => ({
  id,
  blocks: PASSAGE.blocks,
  generationAttemptCount: 0,
  generationStartedAt: STARTED_AT,
  title: PASSAGE.title,
  wordCount: PASSAGE.wordCount,
})

const buildInput = (overrides: Partial<GenerateQuestionsInput> = {}): GenerateQuestionsInput => ({
  generationModel: GENERATION_MODEL,
  maxPassagesPerRun: 10,
  maxPendingDrafts: 50,
  now: () => NOW,
  random: () => 0,
  verificationModel: VERIFICATION_MODEL,
  ...overrides,
})

/**
 * claimed は取れる collected の行（claimNextCollected が 1 回ごとに先頭から 1 件ずつ返し、無くなったら null）
 */
const createFakeRepo = (options: {
  claimed?: ClaimedPassage[]
  draftCount?: number
  failureStatus?: "collected" | "failed" | null
  isSaved?: boolean
  status?: "draft" | null
} = {}) => {
  const collectedQueue = [...(options.claimed ?? [buildPassage(1)])]
  const passageRepository = {
    claimNextCollected: vi.fn<PassageRepository["claimNextCollected"]>(async () => collectedQueue.shift() ?? null),
    countByStatus: vi.fn<PassageRepository["countByStatus"]>(async () => options.draftCount ?? 0),
    findStatusById: vi.fn<PassageRepository["findStatusById"]>(async () => options.status ?? null),
    findTitles: vi.fn<PassageRepository["findTitles"]>(async () => []),
    insertIgnoringDuplicates: vi.fn<PassageRepository["insertIgnoringDuplicates"]>(async () => 0),
    markRejectedByLlm: vi.fn<PassageRepository["markRejectedByLlm"]>(async () => true),
    recordGenerationFailure: vi.fn<PassageRepository["recordGenerationFailure"]>(
      async () => (options.failureStatus === undefined ? "collected" : options.failureStatus),
    ),
    rejectCollected: vi.fn<PassageRepository["rejectCollected"]>(async () => 0),
    releaseClaim: vi.fn<PassageRepository["releaseClaim"]>(async () => undefined),
    releaseStaleGenerating: vi.fn<PassageRepository["releaseStaleGenerating"]>(async () => 0),
    saveDraft: vi.fn<PassageRepository["saveDraft"]>(async () => options.isSaved ?? true),
  } satisfies PassageRepository
  return { passageRepository }
}

type FakeResponse = Error | unknown

/**
 * 全問を正解と同じに答える検証モデルの出力（random が 0 のとき）
 */
const ALL_CORRECT_ANSWERS = {
  answers: SHUFFLED_CORRECT_CHOICE_INDEXES.map((choiceIndex, index) => ({ choiceIndex, questionNumber: index + 1 })),
}

/**
 * 生成は generations を順に返し（Error なら throw）、検証は verification を返す LLM クライアントの偽物
 */
const createFakeLlmClient = (generations: FakeResponse[], verification: FakeResponse = ALL_CORRECT_ANSWERS) => {
  const queue = [...generations]
  const createStructuredMessage = vi.fn(async (request: StructuredMessageRequest): Promise<StructuredMessageResponse> => {
    const next = request.model === VERIFICATION_MODEL ? verification : queue.shift()
    if (next instanceof Error) throw next
    return { json: next, model: `${request.model}-20261013`, usage: USAGE }
  })
  const requestsOf = (model: string): StructuredMessageRequest[] =>
    createStructuredMessage.mock.calls.map(([request]) => request).filter((request) => request.model === model)
  return { createStructuredMessage, requestsOf }
}

const readSavedDraft = (repo: ReturnType<typeof createFakeRepo>): DraftContent => {
  const [call] = repo.passageRepository.saveDraft.mock.calls
  return call[1]
}

describe("generateQuestions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("合格 → 和訳・用語集・シャッフル後の設問・制限時間・要確認の理由を saveDraft に渡し、draftCount が 1", async () => {
      const repo = createFakeRepo()
      const llmClient = createFakeLlmClient([buildGeneratedOutput()], {
        answers: [
          { choiceIndex: 3, questionNumber: 1 },
          { choiceIndex: 0, questionNumber: 2 },
          { choiceIndex: 2, questionNumber: 3 },
        ],
      })

      const result = await generateQuestions(buildInput(), repo, { llmClient })

      expect(result).toEqual({ draftCount: 1, failedCount: 0, rejectedCount: 0, retryLaterCount: 0, skippedReason: null })
      const [claim, content, savedAt] = repo.passageRepository.saveDraft.mock.calls[0]
      expect(claim).toEqual({ generationStartedAt: STARTED_AT, id: 1 })
      expect(savedAt).toEqual(NOW)
      expect(content.generationModel).toBe("claude-sonnet-5-5-20261013")
      expect(content.generationPromptVersion).toBe(PROMPT_VERSION)
      expect(content.difficulty).toBe(2)
      expect(content.timeLimitSeconds).toBe(210)
      expect(content.blocks[1].translationJa).toBe("ネットワークの呼び出しは、コードとは無関係な多くの理由で失敗する。")
      expect(content.glossary.map((entry) => entry.surface)).toEqual(["opt in to", "idempotent", "Under the hood", "caveat"])
      expect(content.questions.map((question) => question.correctChoiceIndex)).toEqual(SHUFFLED_CORRECT_CHOICE_INDEXES)
      expect(content.questions[0].choices[3]).toBe(buildQuestion().choices[0])
      expect(content.questions.map((question) => question.verificationChoiceIndex)).toEqual([3, 0, 2])
      expect(content.glossary[content.questions[1].targetGlossaryIndex ?? -1].surface).toBe("idempotent")
      expect(content.attentionReasons).toEqual(["Q3：検証モデルは C を選択（正解は B）"])
    })

    it("生成・検証のモデルと出力の上限を渡し、検証モデルには正解・解説・根拠を渡さない", async () => {
      const repo = createFakeRepo()
      const llmClient = createFakeLlmClient([buildGeneratedOutput()])

      await generateQuestions(buildInput(), repo, { llmClient })

      const [generationRequest] = llmClient.requestsOf(GENERATION_MODEL)
      expect(generationRequest.maxTokens).toBe(16000)
      expect(generationRequest.adaptiveThinking).toEqual({ effort: "high" })
      expect(generationRequest.userContent).toContain("Create exactly 3 questions for this passage.")
      const [verificationRequest] = llmClient.requestsOf(VERIFICATION_MODEL)
      expect(verificationRequest.maxTokens).toBe(2000)
      expect(verificationRequest.adaptiveThinking).toBeUndefined()
      const output = buildGeneratedOutput()
      for (const question of output.questions) {
        expect(verificationRequest.userContent).toContain(question.prompt)
        expect(verificationRequest.userContent).not.toContain(question.explanationJa)
      }
      expect(verificationRequest.userContent).not.toContain("<evidence")
    })

    it("1 件ごとに結果・usage・捨てた用語集をログに出す", async () => {
      const repo = createFakeRepo()
      const llmClient = createFakeLlmClient([buildGeneratedOutput()])

      await generateQuestions(buildInput(), repo, { llmClient })

      expect(infoMock).toHaveBeenCalledWith("passage processed", expect.objectContaining({
        droppedGlossary: [{ blockIndex: 4, surface: "jitters" }],
        generationUsage: USAGE,
        outcome: "draft",
        passageId: 1,
        verificationUsage: USAGE,
      }))
    })

    it("releaseStaleGenerating を now - 30 分で呼んでから claimNextCollected する", async () => {
      const repo = createFakeRepo({ claimed: [] })

      await generateQuestions(buildInput(), repo, { llmClient: createFakeLlmClient([]) })

      expect(repo.passageRepository.releaseStaleGenerating).toHaveBeenCalledWith(new Date("2026-10-13T02:30:00.000Z"))
      expect(repo.passageRepository.claimNextCollected).toHaveBeenCalledWith({ now: NOW, passageId: undefined })
      expect(repo.passageRepository.releaseStaleGenerating.mock.invocationCallOrder[0])
        .toBeLessThan(repo.passageRepository.claimNextCollected.mock.invocationCallOrder[0])
    })

    it("1 件ずつ「取得 → 生成 → 保存」を繰り返し、各行はその行を取った時刻で取る", async () => {
      const repo = createFakeRepo()
      const claimedAt = [new Date("2026-10-13T03:00:00.000Z"), new Date("2026-10-13T03:40:00.000Z")]
      let claimCount = 0
      repo.passageRepository.claimNextCollected.mockImplementation(async ({ now }) => {
        claimCount++
        return claimCount <= 2 ? { ...buildPassage(claimCount), generationStartedAt: now } : null
      })
      let clock = 0
      const now = () => claimedAt[Math.min(clock, claimedAt.length - 1)]
      repo.passageRepository.saveDraft.mockImplementation(async () => {
        clock++
        return true
      })
      const llmClient = createFakeLlmClient([buildGeneratedOutput(), buildGeneratedOutput()])

      const result = await generateQuestions(buildInput({ now }), repo, { llmClient })

      expect(result.draftCount).toBe(2)
      expect(repo.passageRepository.claimNextCollected.mock.calls.map(([call]) => call.now)).toEqual([...claimedAt, claimedAt[1]])
      expect(repo.passageRepository.saveDraft.mock.calls.map(([claim]) => claim)).toEqual([
        { generationStartedAt: claimedAt[0], id: 1 },
        { generationStartedAt: claimedAt[1], id: 2 },
      ])
      /**
       * 2 件目は 1 件目を保存してから取る（まとめて取らない）
       */
      expect(repo.passageRepository.saveDraft.mock.invocationCallOrder[0])
        .toBeLessThan(repo.passageRepository.claimNextCollected.mock.invocationCallOrder[1])
    })

    it("取れる行が無くなったら、上限に達していなくても終える", async () => {
      const repo = createFakeRepo({ claimed: [buildPassage(1)] })

      const result = await generateQuestions(buildInput(), repo, { llmClient: createFakeLlmClient([buildGeneratedOutput()]) })

      expect(result.draftCount).toBe(1)
      expect(repo.passageRepository.claimNextCollected).toHaveBeenCalledTimes(2)
    })

    it("下書きが上限ちょうどなら、LLM も claimNextCollected も呼ばずに pending_drafts_limit で返す", async () => {
      const repo = createFakeRepo({ draftCount: 50 })
      const llmClient = createFakeLlmClient([])

      const result = await generateQuestions(buildInput(), repo, { llmClient })

      expect(result).toEqual({ draftCount: 0, failedCount: 0, rejectedCount: 0, retryLaterCount: 0, skippedReason: "pending_drafts_limit" })
      expect(repo.passageRepository.countByStatus).toHaveBeenCalledWith("draft")
      expect(repo.passageRepository.claimNextCollected).not.toHaveBeenCalled()
      expect(repo.passageRepository.releaseStaleGenerating).not.toHaveBeenCalled()
      expect(llmClient.createStructuredMessage).not.toHaveBeenCalled()
    })

    it("下書きが上限 - 1 なら 1 件だけ、余裕があれば maxPassagesPerRun 件まで取る", async () => {
      const passages = [1, 2, 3, 4, 5, 6].map(buildPassage)
      const nearLimit = createFakeRepo({ claimed: passages, draftCount: 49 })
      const plenty = createFakeRepo({ claimed: passages, draftCount: 3 })
      const outputs = passages.map(() => buildGeneratedOutput())

      const nearLimitResult = await generateQuestions(buildInput(), nearLimit, { llmClient: createFakeLlmClient(outputs) })
      const plentyResult = await generateQuestions(buildInput({ maxPassagesPerRun: 4 }), plenty, { llmClient: createFakeLlmClient(outputs) })

      expect(nearLimit.passageRepository.claimNextCollected).toHaveBeenCalledTimes(1)
      expect(nearLimitResult.draftCount).toBe(1)
      expect(plenty.passageRepository.claimNextCollected).toHaveBeenCalledTimes(4)
      expect(plentyResult.draftCount).toBe(4)
    })

    it("passageId の指定時は下書きの上限を見ず、その 1 件だけを取る", async () => {
      const repo = createFakeRepo({ claimed: [buildPassage(42)], draftCount: 50 })

      const result = await generateQuestions(buildInput({ passageId: 42 }), repo, { llmClient: createFakeLlmClient([buildGeneratedOutput()]) })

      expect(result.draftCount).toBe(1)
      expect(repo.passageRepository.countByStatus).not.toHaveBeenCalled()
      expect(repo.passageRepository.claimNextCollected).toHaveBeenCalledTimes(1)
      expect(repo.passageRepository.claimNextCollected).toHaveBeenCalledWith({ now: NOW, passageId: 42 })
    })

    it("1 回目が不合格・2 回目が合格なら、2 回目の user message に不合格の理由が入り、下書きにする", async () => {
      const repo = createFakeRepo()
      const invalid = buildGeneratedOutput({ questions: [buildQuestion(), buildQuestion()] })
      const llmClient = createFakeLlmClient([invalid, buildGeneratedOutput()])

      const result = await generateQuestions(buildInput(), repo, { llmClient })

      expect(result.draftCount).toBe(1)
      const [first, second] = llmClient.requestsOf(GENERATION_MODEL)
      expect(first.userContent).not.toContain("previous_attempt_errors")
      expect(second.userContent).toContain("- questions: expected 3 questions but got 2")
      expect(repo.passageRepository.recordGenerationFailure).not.toHaveBeenCalled()
    })

    it("出力が JSON として読めなければ、その旨を理由にして再生成する", async () => {
      const repo = createFakeRepo()
      const llmClient = createFakeLlmClient([new LlmInvalidJsonError("Unexpected end of JSON input"), buildGeneratedOutput()])

      const result = await generateQuestions(buildInput(), repo, { llmClient })

      expect(result.draftCount).toBe(1)
      const [, second] = llmClient.requestsOf(GENERATION_MODEL)
      expect(second.userContent).toContain("- LLM output is not valid JSON: Unexpected end of JSON input")
    })

    it("isSuitable = false なら markRejectedByLlm（理由が無ければ既定の理由）で、検証モデルは呼ばない", async () => {
      const repo = createFakeRepo()
      const unsuitable = buildGeneratedOutput({ glossary: [], isSuitable: false, questions: [], translations: [], unsuitableReason: null })
      const llmClient = createFakeLlmClient([unsuitable])

      const result = await generateQuestions(buildInput(), repo, { llmClient })

      expect(result.rejectedCount).toBe(1)
      expect(repo.passageRepository.markRejectedByLlm).toHaveBeenCalledWith(
        { generationStartedAt: STARTED_AT, id: 1 },
        { generationModel: "claude-sonnet-5-5-20261013", generationPromptVersion: PROMPT_VERSION, reason: "LLM が題材に不向きと判定" },
        NOW,
      )
      expect(llmClient.requestsOf(VERIFICATION_MODEL)).toEqual([])
      expect(repo.passageRepository.saveDraft).not.toHaveBeenCalled()
    })

    it("LLM の却下の理由があればそれを残す", async () => {
      const repo = createFakeRepo()
      const unsuitable = buildGeneratedOutput({ glossary: [], isSuitable: false, questions: [], translations: [], unsuitableReason: "目次だけ" })

      await generateQuestions(buildInput(), repo, { llmClient: createFakeLlmClient([unsuitable]) })

      expect(repo.passageRepository.markRejectedByLlm.mock.calls[0][1].reason).toBe("目次だけ")
    })
  })

  describe("異常系", () => {
    it("出力が max_tokens で切れたら再生成せず、output_tokens と上限を warn に出して一時的な失敗（次の実行に回す）にする", async () => {
      const repo = createFakeRepo({ claimed: [buildPassage(1), buildPassage(2)], failureStatus: "collected" })
      const llmClient = createFakeLlmClient([new LlmOutputTruncatedError("max_tokens", 16000), buildGeneratedOutput()])

      const result = await generateQuestions(buildInput(), repo, { llmClient })

      expect(result).toEqual({ draftCount: 1, failedCount: 0, rejectedCount: 0, retryLaterCount: 1, skippedReason: null })
      expect(repo.passageRepository.recordGenerationFailure).toHaveBeenCalledWith(
        { generationStartedAt: STARTED_AT, id: 1 },
        {
          error: "LlmOutputTruncatedError: LLM output was truncated at the output limit (stop_reason: max_tokens, output_tokens: 16000)",
          maxAttempts: 3,
        },
      )
      expect(warnMock).toHaveBeenCalledWith("passage generation failed", expect.objectContaining({
        maxTokens: 16000,
        outcome: "retry_later",
        outputTokens: 16000,
        passageId: 1,
        stopReason: "max_tokens",
      }))
      /**
       * 1 件目は 1 回だけ呼んで次の件に進む（同じ上限での作り直しはしない）。検証モデルは 2 件目でだけ呼ぶ
       */
      expect(llmClient.requestsOf(GENERATION_MODEL)).toHaveLength(2)
      expect(llmClient.requestsOf(VERIFICATION_MODEL)).toHaveLength(1)
      expect(repo.passageRepository.saveDraft.mock.calls.map(([claim]) => claim.id)).toEqual([2])
    })

    it("出力が max_tokens で切れ、失敗が上限に達したら failedCount が 1", async () => {
      const repo = createFakeRepo({ failureStatus: "failed" })
      const llmClient = createFakeLlmClient([new LlmOutputTruncatedError("max_tokens", 15998)])

      const result = await generateQuestions(buildInput(), repo, { llmClient })

      expect(result.failedCount).toBe(1)
      expect(warnMock).toHaveBeenCalledWith("passage generation failed", expect.objectContaining({ outcome: "failed", outputTokens: 15998 }))
    })

    it("2 回とも不合格なら recordGenerationFailure に最後の理由を渡し、collected に戻れば retryLaterCount が 1", async () => {
      const repo = createFakeRepo({ failureStatus: "collected" })
      const invalid = buildGeneratedOutput({ questions: [buildQuestion(), buildQuestion()] })
      const llmClient = createFakeLlmClient([invalid, invalid])

      const result = await generateQuestions(buildInput(), repo, { llmClient })

      expect(result).toEqual({ draftCount: 0, failedCount: 0, rejectedCount: 0, retryLaterCount: 1, skippedReason: null })
      expect(repo.passageRepository.recordGenerationFailure).toHaveBeenCalledWith(
        { generationStartedAt: STARTED_AT, id: 1 },
        { error: "validation failed: questions: expected 3 questions but got 2", maxAttempts: 3 },
      )
      expect(llmClient.requestsOf(GENERATION_MODEL)).toHaveLength(2)
      expect(llmClient.requestsOf(VERIFICATION_MODEL)).toEqual([])
      expect(warnMock).toHaveBeenCalledWith("passage generation failed", expect.objectContaining({
        errors: ["questions: expected 3 questions but got 2"],
        outcome: "retry_later",
        passageId: 1,
      }))
    })

    it("API エラーで recordGenerationFailure が failed を返せば failedCount が 1。2 件目の処理は続く", async () => {
      const repo = createFakeRepo({ claimed: [buildPassage(1), buildPassage(2)], failureStatus: "failed" })
      const apiError = new InternalServerError(500, buildApiErrorBody("api_error"), "internal", API_ERROR_HEADERS)
      const llmClient = createFakeLlmClient([apiError, buildGeneratedOutput()])

      const result = await generateQuestions(buildInput(), repo, { llmClient })

      expect(result).toEqual({ draftCount: 1, failedCount: 1, rejectedCount: 0, retryLaterCount: 0, skippedReason: null })
      const [claim, failure] = repo.passageRepository.recordGenerationFailure.mock.calls[0]
      expect(claim.id).toBe(1)
      expect(failure.error).toMatch(/^InternalServerError: /)
      expect(failure.maxAttempts).toBe(3)
      expect(repo.passageRepository.saveDraft.mock.calls[0][0].id).toBe(2)
      expect(warnMock).toHaveBeenCalledWith("passage generation failed", expect.objectContaining({
        error: expect.stringMatching(/^InternalServerError: /),
        outcome: "failed",
        passageId: 1,
      }))
      expect(infoMock).not.toHaveBeenCalledWith("passage processed", expect.objectContaining({ passageId: 1 }))
    })

    it("拒否（LlmRefusalError）は再生成せずに失敗として記録する", async () => {
      const repo = createFakeRepo()
      const llmClient = createFakeLlmClient([new LlmRefusalError("cyber")])

      const result = await generateQuestions(buildInput(), repo, { llmClient })

      expect(result.retryLaterCount).toBe(1)
      expect(llmClient.requestsOf(GENERATION_MODEL)).toHaveLength(1)
      expect(repo.passageRepository.recordGenerationFailure.mock.calls[0][1].error)
        .toBe("LlmRefusalError: LLM refused the request (category: cyber)")
    })

    it("検証モデルの呼び出しが失敗したら、検証なし（null）で保存して要確認に理由を入れる", async () => {
      const repo = createFakeRepo()
      const apiError = new InternalServerError(500, buildApiErrorBody("api_error"), "internal", API_ERROR_HEADERS)
      const llmClient = createFakeLlmClient([buildGeneratedOutput()], apiError)

      const result = await generateQuestions(buildInput(), repo, { llmClient })

      expect(result.draftCount).toBe(1)
      const content = readSavedDraft(repo)
      expect(content.questions.map((question) => question.verificationChoiceIndex)).toEqual([null, null, null])
      expect(content.attentionReasons).toEqual(["検証モデルでの確認に失敗しました"])
    })

    it.each([
      ["回答の件数が設問数と合わない", { answers: [{ choiceIndex: 0, questionNumber: 1 }] }],
      ["同じ設問への回答が重複している", { answers: [1, 1, 2].map((questionNumber) => ({ choiceIndex: 0, questionNumber })) }],
      ["範囲外の設問番号がある", { answers: [1, 2, 4].map((questionNumber) => ({ choiceIndex: 0, questionNumber })) }],
      ["スキーマに合わない", { answers: "A, B, C" }],
    ])("検証モデルの出力が使えなければ（%s）検証なしで保存する", async (_label, verification) => {
      const repo = createFakeRepo()

      await generateQuestions(buildInput(), repo, { llmClient: createFakeLlmClient([buildGeneratedOutput()], verification) })

      const content = readSavedDraft(repo)
      expect(content.questions.map((question) => question.verificationChoiceIndex)).toEqual([null, null, null])
      expect(content.attentionReasons).toEqual(["検証モデルでの確認に失敗しました"])
    })

    it("isFatalLlmError なら失敗を記録せずに releaseClaim して throw し、残りの行は取らない", async () => {
      const repo = createFakeRepo({ claimed: [buildPassage(1), buildPassage(2)] })
      const fatalError = new AuthenticationError(401, buildApiErrorBody("authentication_error"), "invalid x-api-key", API_ERROR_HEADERS)
      const llmClient = createFakeLlmClient([fatalError, buildGeneratedOutput()])

      await expect(generateQuestions(buildInput(), repo, { llmClient })).rejects.toBe(fatalError)

      expect(repo.passageRepository.releaseClaim).toHaveBeenCalledWith({ generationStartedAt: STARTED_AT, id: 1 })
      expect(repo.passageRepository.recordGenerationFailure).not.toHaveBeenCalled()
      expect(llmClient.requestsOf(GENERATION_MODEL)).toHaveLength(1)
      expect(repo.passageRepository.claimNextCollected).toHaveBeenCalledTimes(1)
    })

    it("検証モデルの ID の誤り（404）は、下書きを検証なしで保存してから throw する", async () => {
      const repo = createFakeRepo()
      const fatalError = new NotFoundError(404, buildApiErrorBody("not_found_error"), "model not found", API_ERROR_HEADERS)
      const llmClient = createFakeLlmClient([buildGeneratedOutput()], fatalError)

      await expect(generateQuestions(buildInput(), repo, { llmClient })).rejects.toBe(fatalError)

      expect(readSavedDraft(repo).attentionReasons).toEqual(["検証モデルでの確認に失敗しました"])
      expect(repo.passageRepository.recordGenerationFailure).not.toHaveBeenCalled()
    })

    it("claim が古く保存できなければ数えない", async () => {
      const repo = createFakeRepo({ isSaved: false })

      const result = await generateQuestions(buildInput(), repo, { llmClient: createFakeLlmClient([buildGeneratedOutput()]) })

      expect(result).toEqual({ draftCount: 0, failedCount: 0, rejectedCount: 0, retryLaterCount: 0, skippedReason: null })
    })

    it("passageId の指定で取れなければ、行の状態をメッセージに含めて throw する", async () => {
      const draft = createFakeRepo({ claimed: [], status: "draft" })
      const missing = createFakeRepo({ claimed: [], status: null })

      await expect(generateQuestions(buildInput({ passageId: 42 }), draft, { llmClient: createFakeLlmClient([]) }))
        .rejects.toThrow("Passage is not collected: id=42, status=draft")
      await expect(generateQuestions(buildInput({ passageId: 43 }), missing, { llmClient: createFakeLlmClient([]) }))
        .rejects.toThrow("Passage not found: id=43")
      expect(draft.passageRepository.findStatusById).toHaveBeenCalledWith(42)
    })

    it("Repository が throw した場合、そのまま伝搬する", async () => {
      const repo = createFakeRepo()
      repo.passageRepository.claimNextCollected.mockRejectedValueOnce(new Error("db connection failed"))

      await expect(generateQuestions(buildInput(), repo, { llmClient: createFakeLlmClient([]) })).rejects.toThrow("db connection failed")
    })
  })
})
