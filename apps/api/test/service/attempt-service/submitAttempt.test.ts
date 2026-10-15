import type { TransactionContext, TransactionRunner } from "../../../src/repository"
import { submitAttempt, type SubmittedAttemptView } from "../../../src/service/attempt-service"
import { createMockPassageRepository, createMockReadingAttemptRepository } from "../../fixture/passage-repository-mock"

import {
  ALIVE_SINCE,
  buildAttempt,
  buildAttemptContent,
  buildExpectedSubmittedView,
  buildStoredAnswers,
  buildStoredWordLookups,
  buildSubmittedAttempt,
  createMockUserRepository,
  FIXED_NOW,
  USER,
} from "./fixtures"

const passageRepository = createMockPassageRepository()
const readingAttemptRepository = createMockReadingAttemptRepository()
const userRepository = createMockUserRepository()

/**
 * Fake TransactionRunner: 目印のトークンを tx として callback を実行する（書き込みが同じ tx に乗っているかを確かめるため）
 */
const TX = { fake: "tx" } as unknown as TransactionContext
const transactionRunner: TransactionRunner = { run: vi.fn(async (fn) => fn(TX)) }

const repo = { passageRepository, readingAttemptRepository, transactionRunner, userRepository }

const PRIMARY = { fromPrimary: true }

const DAY_MS = 24 * 60 * 60 * 1000

const INPUT = {
  activeSeconds: 150,
  answers: [
    { questionId: 201, selectedChoiceIndex: 1 },
    { questionId: 202, selectedChoiceIndex: 0 },
  ],
  attemptId: 301,
  listenedBlockCount: 1,
  now: FIXED_NOW,
  translatedBlockCount: 2,
  userId: 7,
  wordLookups: [
    { glossaryEntryId: 101, lemma: "stay in sync", source: "glossary" as const, surface: "stay in sync with" },
    { glossaryEntryId: null, lemma: "Effect", source: "dictionary" as const, surface: "Effects" },
    { glossaryEntryId: 101, lemma: "stay in sync", source: "glossary" as const, surface: "stay in sync with" },
  ],
}

type SubmitInput = Parameters<typeof submitAttempt>[0]

const buildInput = (overrides: Partial<SubmitInput> = {}): SubmitInput => ({ ...INPUT, ...overrides })

const extractView = (result: Awaited<ReturnType<typeof submitAttempt>>): SubmittedAttemptView => {
  if (!result.ok) throw new Error("Expected ok result")
  return result.value
}

const extractSubmitInput = () => readingAttemptRepository.markSubmitted.mock.calls[0]?.[0]

describe("submitAttempt", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userRepository.findById.mockResolvedValue(USER)
    readingAttemptRepository.findByIdForUser.mockResolvedValue(buildAttempt())
    readingAttemptRepository.expireStale.mockResolvedValue(1)
    passageRepository.findAttemptContentById.mockResolvedValue(buildAttemptContent())
    readingAttemptRepository.markSubmitted.mockResolvedValue(buildSubmittedAttempt())
    readingAttemptRepository.insertAnswers.mockResolvedValue()
    readingAttemptRepository.insertWordLookups.mockResolvedValue()
    readingAttemptRepository.findAnswersByAttemptId.mockResolvedValue(buildStoredAnswers())
    readingAttemptRepository.findWordLookupsWithMeaning.mockResolvedValue(buildStoredWordLookups())
  })

  describe("正常系", () => {
    it("採点・時間・study_date を markSubmitted に渡し、回答（全設問）と調べた単語を同じトランザクションで保存して、primary から読んだ結果の形を返す", async () => {
      const result = await submitAttempt(INPUT, repo)

      expect(result).toEqual({ ok: true, value: buildExpectedSubmittedView() })
      expect(transactionRunner.run).toHaveBeenCalledTimes(1)
      expect(readingAttemptRepository.markSubmitted).toHaveBeenCalledWith(
        {
          attemptId: 301,
          correctCount: 1,
          elapsedSeconds: 150,
          isOvertime: false,
          listenedBlockCount: 1,
          questionCount: 3,
          studyDate: "2026-10-13",
          submittedAt: FIXED_NOW,
          translatedBlockCount: 2,
          wordLookupCount: 3,
        },
        TX,
      )
      expect(readingAttemptRepository.insertAnswers).toHaveBeenCalledWith(
        [
          { attemptId: 301, isCorrect: true, questionId: 201, selectedChoiceIndex: 1 },
          { attemptId: 301, isCorrect: false, questionId: 202, selectedChoiceIndex: 0 },
          { attemptId: 301, isCorrect: false, questionId: 203, selectedChoiceIndex: null },
        ],
        TX,
      )
      expect(readingAttemptRepository.insertWordLookups).toHaveBeenCalledWith(
        [
          { attemptId: 301, glossaryEntryId: 101, lemma: "stay in sync with", passageId: 1, source: "glossary", surface: "stay in sync with", userId: 7 },
          { attemptId: 301, glossaryEntryId: null, lemma: "effect", passageId: 1, source: "dictionary", surface: "Effects", userId: 7 },
          { attemptId: 301, glossaryEntryId: 101, lemma: "stay in sync with", passageId: 1, source: "glossary", surface: "stay in sync with", userId: 7 },
        ],
        TX,
      )
      expect(readingAttemptRepository.findByIdForUser).toHaveBeenCalledWith(301, 7, PRIMARY)
      expect(readingAttemptRepository.findAnswersByAttemptId).toHaveBeenCalledWith(301, PRIMARY)
      expect(readingAttemptRepository.findWordLookupsWithMeaning).toHaveBeenCalledWith(301, PRIMARY)
      expect(readingAttemptRepository.expireStale).not.toHaveBeenCalled()
    })

    it("結果の形は語義設問の対象語句（escape hatch）も用語集とセグメントに含み、正解・解説・根拠の範囲を持つ", async () => {
      const view = extractView(await submitAttempt(INPUT, repo))

      expect(view.blocks.map((block) => block.segments.flatMap((segment) => segment.glossaryEntryId ?? []))).toEqual([
        [],
        [101, 102],
        [],
        [],
        [103],
      ])
      expect(view.glossary.map((entry) => entry.id)).toEqual([101, 102, 103])
      const paragraph = view.blocks[1]?.segments ?? []
      expect(paragraph.slice(15, 31).map((segment) => segment.text).join("")).toBe("Effects are an escape hatch from the React paradigm.")
      expect(paragraph.slice(15, 22).map((segment) => segment.text).join("")).toBe("Effects are an escape hatch")
    })

    it.each([
      ["Asia/Tokyo では JST の 15:59:59.999 なので当日", "Asia/Tokyo", "2026-10-13T06:59:59.999Z", "2026-10-13"],
      ["America/Los_Angeles では同じ時刻が前日の 23:59:59.999（境界値）", "America/Los_Angeles", "2026-10-13T06:59:59.999Z", "2026-10-12"],
      ["America/Los_Angeles の 0:00 から当日（境界値）", "America/Los_Angeles", "2026-10-13T07:00:00.000Z", "2026-10-13"],
    ])("study_date はユーザーのタイムゾーンで決める: %s", async (_label, timezone, now, expected) => {
      userRepository.findById.mockResolvedValue({ ...USER, timezone })

      await submitAttempt(buildInput({ now: new Date(now) }), repo)

      expect(extractSubmitInput()?.studyDate).toBe(expected)
    })

    it.each([
      ["申告が壁時計より大きければ壁時計に切り詰める", 500, 100, { elapsedSeconds: 100, isOvertime: false }],
      ["制限時間ちょうど（100 秒）は超過ではない（境界値）", 100, 100, { elapsedSeconds: 100, isOvertime: false }],
      ["制限時間を 1 秒超えたら超過（境界値）", 100, 99, { elapsedSeconds: 100, isOvertime: true }],
      ["申告が壁時計より小さければ申告のまま", 60, 100, { elapsedSeconds: 60, isOvertime: false }],
    ])("%s。超過は開始時点の制限時間で判定する", async (_label, activeSeconds, timeLimitSeconds, expected) => {
      readingAttemptRepository.findByIdForUser.mockResolvedValue(
        buildAttempt({ startedAt: new Date(FIXED_NOW.getTime() - 100 * 1000), timeLimitSeconds }),
      )
      passageRepository.findAttemptContentById.mockResolvedValue(buildAttemptContent({ timeLimitSeconds: 999 }))

      await submitAttempt(buildInput({ activeSeconds }), repo)

      expect(extractSubmitInput()).toMatchObject(expected)
    })

    it.each([
      ["code 以外のブロック数（4）を超えたら 4 にする", 10, 4],
      ["code 以外のブロック数ちょうどはそのまま（境界値）", 4, 4],
      ["code 以外のブロック数より少なければそのまま", 3, 3],
    ])("translatedBlockCount は %s", async (_label, translatedBlockCount, expected) => {
      await submitAttempt(buildInput({ translatedBlockCount }), repo)

      expect(extractSubmitInput()?.translatedBlockCount).toBe(expected)
    })

    it.each([
      ["code 以外のブロック数（4）を超えたら 4 にする", 10, 4],
      ["code 以外のブロック数ちょうどはそのまま（境界値）", 4, 4],
      ["code 以外のブロック数より少なければそのまま", 3, 3],
      ["0 はそのまま", 0, 0],
    ])("listenedBlockCount は %s", async (_label, listenedBlockCount, expected) => {
      await submitAttempt(buildInput({ listenedBlockCount }), repo)

      expect(extractSubmitInput()?.listenedBlockCount).toBe(expected)
    })

    it("この問題の用語集に無い ID の単語は捨て（語義設問の対象 102 は残す）、wordLookupCount は残った件数", async () => {
      await submitAttempt(
        buildInput({
          wordLookups: [
            { glossaryEntryId: 999, lemma: "unknown", source: "glossary", surface: "unknown" },
            { glossaryEntryId: 102, lemma: "hatch", source: "glossary", surface: "escape hatch" },
            { glossaryEntryId: null, lemma: "PARADIGM", source: "dictionary", surface: "paradigm" },
          ],
        }),
        repo,
      )

      expect(extractSubmitInput()?.wordLookupCount).toBe(2)
      expect(readingAttemptRepository.insertWordLookups).toHaveBeenCalledWith(
        [
          { attemptId: 301, glossaryEntryId: 102, lemma: "escape hatch", passageId: 1, source: "glossary", surface: "escape hatch", userId: 7 },
          { attemptId: 301, glossaryEntryId: null, lemma: "paradigm", passageId: 1, source: "dictionary", surface: "paradigm", userId: 7 },
        ],
        TX,
      )
    })

    it("回答も調べた単語も無ければ全設問を未回答の不正解として保存し、調べた単語は空配列で渡す", async () => {
      await submitAttempt(buildInput({ answers: [], wordLookups: [] }), repo)

      expect(extractSubmitInput()).toMatchObject({ correctCount: 0, questionCount: 3, wordLookupCount: 0 })
      expect(readingAttemptRepository.insertAnswers).toHaveBeenCalledWith(
        [201, 202, 203].map((questionId) => ({ attemptId: 301, isCorrect: false, questionId, selectedChoiceIndex: null })),
        TX,
      )
      expect(readingAttemptRepository.insertWordLookups).toHaveBeenCalledWith([], TX)
    })

    it("提出時点の設問の正解で採点する（開始後に正解が直されていても）", async () => {
      const content = buildAttemptContent()
      passageRepository.findAttemptContentById.mockResolvedValue({
        ...content,
        questions: content.questions.map((question) => (question.id === 202 ? { ...question, correctChoiceIndex: 0 } : question)),
      })

      await submitAttempt(INPUT, repo)

      expect(extractSubmitInput()?.correctCount).toBe(2)
    })

    it("開始から 23:59:59 なら提出できる（境界値）", async () => {
      readingAttemptRepository.findByIdForUser.mockResolvedValue(buildAttempt({ startedAt: new Date(FIXED_NOW.getTime() - DAY_MS + 1000) }))

      const result = await submitAttempt(INPUT, repo)

      expect(result.ok).toBe(true)
      expect(readingAttemptRepository.markSubmitted).toHaveBeenCalledTimes(1)
      expect(readingAttemptRepository.expireStale).not.toHaveBeenCalled()
    })

    it("すでに提出済みなら入力を無視し、markSubmitted を呼ばずに保存済みの結果を返す（冪等）", async () => {
      readingAttemptRepository.findByIdForUser.mockResolvedValue(buildSubmittedAttempt())

      const result = await submitAttempt(buildInput({ activeSeconds: 9999, answers: [], listenedBlockCount: 4 }), repo)

      /**
       * listenedBlockCount も入力（4）ではなく保存済みの値（1）
       */
      expect(result).toEqual({ ok: true, value: buildExpectedSubmittedView() })
      expect(transactionRunner.run).not.toHaveBeenCalled()
      expect(readingAttemptRepository.markSubmitted).not.toHaveBeenCalled()
      expect(readingAttemptRepository.findAnswersByAttemptId).toHaveBeenCalledWith(301, PRIMARY)
    })

    it("提出済みなら開始から 24 時間たっていても保存済みの結果を返す", async () => {
      readingAttemptRepository.findByIdForUser.mockResolvedValue(buildSubmittedAttempt({ startedAt: new Date("2026-10-01T00:00:00.000Z") }))

      const result = await submitAttempt(INPUT, repo)

      expect(result.ok && result.value.status).toBe("submitted")
      expect(readingAttemptRepository.expireStale).not.toHaveBeenCalled()
    })

    it("markSubmitted が null（同時に提出された）なら挿入せず、primary から読み直した保存済みの結果を返す", async () => {
      readingAttemptRepository.findByIdForUser
        .mockResolvedValueOnce(buildAttempt())
        .mockResolvedValueOnce(buildSubmittedAttempt())
      readingAttemptRepository.markSubmitted.mockResolvedValue(null)

      const result = await submitAttempt(INPUT, repo)

      expect(result).toEqual({ ok: true, value: buildExpectedSubmittedView() })
      expect(readingAttemptRepository.insertAnswers).not.toHaveBeenCalled()
      expect(readingAttemptRepository.insertWordLookups).not.toHaveBeenCalled()
      expect(readingAttemptRepository.findByIdForUser.mock.calls).toEqual([
        [301, 7, PRIMARY],
        [301, 7, PRIMARY],
      ])
      expect(readingAttemptRepository.findAnswersByAttemptId).toHaveBeenCalledWith(301, PRIMARY)
    })
  })

  describe("異常系", () => {
    it("ユーザーが居なければ 401 を返し、挑戦を読まずトランザクションも開始しない", async () => {
      userRepository.findById.mockResolvedValue(null)

      const result = await submitAttempt(INPUT, repo)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 401, type: "UNAUTHORIZED" }), ok: false })
      expect(readingAttemptRepository.findByIdForUser).not.toHaveBeenCalled()
      expect(transactionRunner.run).not.toHaveBeenCalled()
    })

    it("自分の挑戦が見つからなければ（他人の挑戦・存在しない ID）404 を返し、トランザクションを開始しない", async () => {
      readingAttemptRepository.findByIdForUser.mockResolvedValue(null)

      const result = await submitAttempt(INPUT, repo)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
      expect(passageRepository.findAttemptContentById).not.toHaveBeenCalled()
      expect(transactionRunner.run).not.toHaveBeenCalled()
    })

    it("期限切れの挑戦は 409 を返し、トランザクションを開始しない", async () => {
      readingAttemptRepository.findByIdForUser.mockResolvedValue(buildAttempt({ status: "expired" }))

      const result = await submitAttempt(INPUT, repo)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(transactionRunner.run).not.toHaveBeenCalled()
    })

    it("開始からちょうど 24 時間の挑戦中は expireStale してから 409 を返す（境界値）", async () => {
      readingAttemptRepository.findByIdForUser.mockResolvedValue(buildAttempt({ startedAt: new Date(FIXED_NOW.getTime() - DAY_MS) }))

      const result = await submitAttempt(INPUT, repo)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(readingAttemptRepository.expireStale).toHaveBeenCalledWith(7, ALIVE_SINCE)
      expect(transactionRunner.run).not.toHaveBeenCalled()
    })

    it.each([
      [
        "同じ question_id が 2 回ある",
        [{ questionId: 201, selectedChoiceIndex: 1 }, { questionId: 201, selectedChoiceIndex: 2 }],
        [{ code: "duplicate_question", message: expect.any(String), path: ["answers", 1, "question_id"] }],
      ],
      [
        "この問題に無い question_id がある",
        [{ questionId: 201, selectedChoiceIndex: 1 }, { questionId: 999, selectedChoiceIndex: 0 }],
        [{ code: "unknown_question", message: expect.any(String), path: ["answers", 1, "question_id"] }],
      ],
    ])("%sなら 400 を返し、トランザクションを開始しない", async (_label, answers, details) => {
      const result = await submitAttempt(buildInput({ answers }), repo)

      expect(result).toEqual({ error: expect.objectContaining({ details, statusCode: 400, type: "BAD_REQUEST" }), ok: false })
      expect(transactionRunner.run).not.toHaveBeenCalled()
    })

    it("markSubmitted が null で、読み直すと期限切れにされていたら 409 を返す", async () => {
      readingAttemptRepository.findByIdForUser
        .mockResolvedValueOnce(buildAttempt())
        .mockResolvedValueOnce(buildAttempt({ status: "expired" }))
      readingAttemptRepository.markSubmitted.mockResolvedValue(null)

      const result = await submitAttempt(INPUT, repo)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 409, type: "CONFLICT" }), ok: false })
      expect(readingAttemptRepository.insertAnswers).not.toHaveBeenCalled()
    })

    it("markSubmitted が null で、読み直すと挑戦が無くなっていたら 404 を返す", async () => {
      readingAttemptRepository.findByIdForUser.mockResolvedValueOnce(buildAttempt()).mockResolvedValueOnce(null)
      readingAttemptRepository.markSubmitted.mockResolvedValue(null)

      const result = await submitAttempt(INPUT, repo)

      expect(result).toEqual({ error: expect.objectContaining({ statusCode: 404, type: "NOT_FOUND" }), ok: false })
    })

    it("挑戦の問題が見つからなければ throw する", async () => {
      passageRepository.findAttemptContentById.mockResolvedValue(null)

      await expect(submitAttempt(INPUT, repo)).rejects.toThrow()
      expect(transactionRunner.run).not.toHaveBeenCalled()
    })
  })
})
