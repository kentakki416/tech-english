import type { PassageAudioManifest, PassageBlock } from "@repo/domain"
import type { Storage } from "@repo/storage"

import { FakeTtsClient, type SynthesizeInput, type TtsClient } from "../../../src/client/polly"
import { calculateAudioTextHash, estimateBilledCharacters } from "../../../src/lib/audio"
import type {
  AudioClaimOutcome,
  AudioClaimResult,
  AudioSynthesisUsageRepository,
  ClaimedAudioTarget,
  PassageAudioRepository,
  RejectedPassageAudio,
} from "../../../src/repository"
import { generateAudio, type GenerateAudioInput } from "../../../src/service/audio"

/**
 * 1 件ごとのログを捨てる（@repo/logger の logger は Proxy で spyOn できない）
 */
vi.mock("@repo/logger", () => ({ logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

const NOW = new Date("2026-10-13T03:00:00.000Z")

const VOICE_ID = "Joanna"

const BLOCKS: PassageBlock[] = [
  { text: "Synchronizing with Effects", type: "heading" },
  { text: "Some components need to stay in sync with `window` events.", translationJa: "…", type: "paragraph" },
  { lang: "js", text: "useEffect(() => {})", type: "code" },
  { text: "Effects are an escape hatch.", type: "paragraph" },
]

const TEXT_HASH = calculateAudioTextHash({ blocks: BLOCKS, voiceId: VOICE_ID })

const buildTarget = (overrides: Partial<ClaimedAudioTarget> = {}): ClaimedAudioTarget => ({
  blocks: BLOCKS,
  claimedStatus: "generating",
  generationStartedAt: NOW,
  isRegenerationRequested: false,
  passageId: 42,
  previous: null,
  ...overrides,
})

const MONTHLY_CHARACTER_LIMIT = 1_800_000

const buildInput = (overrides: Partial<GenerateAudioInput> = {}): GenerateAudioInput => ({
  maxPassagesPerRun: 20,
  monthlyCharacterLimit: MONTHLY_CHARACTER_LIMIT,
  now: () => NOW,
  voiceId: VOICE_ID,
  ...overrides,
})

/**
 * 前の成功のマニフェスト（別の hash のキー）
 */
const PREVIOUS_MANIFEST: PassageAudioManifest = {
  blocks: [
    { blockIndex: 0, parts: [{ durationMs: 900, key: "passages/42/old-hash/0-0.mp3", words: [] }] },
    { blockIndex: 1, parts: [{ durationMs: 2700, key: "passages/42/old-hash/1-0.mp3", words: [] }] },
  ],
}

const createFakeRepo = (
  options: {
    completeResult?: AudioClaimResult
    rejected?: RejectedPassageAudio[]
    targets?: ClaimedAudioTarget[]
    usedCharacters?: number
  } = {},
) => {
  const passageAudioRepository = {
    claimTargets: vi.fn<PassageAudioRepository["claimTargets"]>(async () => options.targets ?? [buildTarget()]),
    completeClaim: vi.fn<PassageAudioRepository["completeClaim"]>(async () => options.completeResult ?? "ready"),
    deleteByPassageId: vi.fn<PassageAudioRepository["deleteByPassageId"]>(async () => undefined),
    findRejected: vi.fn<PassageAudioRepository["findRejected"]>(async () => options.rejected ?? []),
    releaseClaim: vi.fn<PassageAudioRepository["releaseClaim"]>(async () => undefined),
    releaseStaleGenerating: vi.fn<PassageAudioRepository["releaseStaleGenerating"]>(async () => 0),
  } satisfies PassageAudioRepository
  const audioSynthesisUsageRepository = {
    record: vi.fn<AudioSynthesisUsageRepository["record"]>(async () => undefined),
    sumCharactersSinceFromPrimary: vi.fn<AudioSynthesisUsageRepository["sumCharactersSinceFromPrimary"]>(
      async () => options.usedCharacters ?? 0,
    ),
  } satisfies AudioSynthesisUsageRepository
  return { audioSynthesisUsageRepository, passageAudioRepository }
}

/**
 * Polly のように、音声と単語の時刻の 2 リクエスト分の課金文字数（テキストの長さ）を recordBilledCharacters で記録する音声合成（中身は FakeTtsClient）
 */
class BilledFakeTtsClient implements TtsClient {
  private _fake = new FakeTtsClient()

  public async synthesize(input: SynthesizeInput) {
    await input.recordBilledCharacters(input.text.length)
    await input.recordBilledCharacters(input.text.length)
    const result = await this._fake.synthesize(input)
    return { ...result, billedCharacters: input.text.length * 2 }
  }

  public async synthesizeAudio(input: SynthesizeInput) {
    await input.recordBilledCharacters(input.text.length)
    return { audio: (await this._fake.synthesizeAudio(input)).audio, billedCharacters: input.text.length }
  }
}

const createFakeStorage = () => ({
  delete: vi.fn<Storage["delete"]>(async () => undefined),
  save: vi.fn<Storage["save"]>(async (key) => `/media/${key}`),
})

const createDeps = (ttsClient: TtsClient = new FakeTtsClient()) => ({ audioStorage: createFakeStorage(), ttsClient })

/**
 * completeClaim に渡した outcome（1 件目）
 */
const readOutcome = (repo: ReturnType<typeof createFakeRepo>, call = 0): AudioClaimOutcome => {
  const outcome = repo.passageAudioRepository.completeClaim.mock.calls[call]?.[1]
  if (!outcome) throw new Error("completeClaim was not called")
  return outcome
}

describe("generateAudio", () => {
  describe("正常系", () => {
    it("30 分前より前の generating を回収してから、maxPassagesPerRun 件を確保する（30 分以内に ready のまま確保された行は取らない・失敗の上限は 3）", async () => {
      const repo = createFakeRepo({ targets: [] })

      await generateAudio(buildInput({ maxPassagesPerRun: 7 }), repo, createDeps())

      expect(repo.passageAudioRepository.releaseStaleGenerating).toHaveBeenCalledWith(new Date("2026-10-13T02:30:00.000Z"))
      expect(repo.passageAudioRepository.claimTargets).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 7,
          maxAttempts: 3,
          now: NOW,
          staleBefore: new Date("2026-10-13T02:30:00.000Z"),
          voiceId: VOICE_ID,
        }),
      )
      const [releaseOrder] = repo.passageAudioRepository.releaseStaleGenerating.mock.invocationCallOrder
      const [claimOrder] = repo.passageAudioRepository.claimTargets.mock.invocationCallOrder
      expect(releaseOrder).toBeLessThan(claimOrder ?? 0)
      /**
       * Repository に渡す hash の関数は voice を閉じ込めている
       */
      const [claimInput] = repo.passageAudioRepository.claimTargets.mock.calls[0] ?? []
      expect(claimInput?.calculateTextHash(BLOCKS)).toBe(TEXT_HASH)
    })

    it("初めての問題：code を飛ばして読み上げるブロックごとに保存し、マニフェスト付きの ready を渡す", async () => {
      const repo = createFakeRepo()
      const deps = createDeps()

      const result = await generateAudio(buildInput(), repo, deps)

      expect(result).toEqual({
        failedCount: 0,
        isMonthlyLimitReached: false,
        lostClaimCount: 0,
        purgedCount: 0,
        readyCount: 1,
        retryLaterCount: 0,
        textChangedCount: 0,
        unchangedCount: 0,
      })
      expect(deps.audioStorage.save.mock.calls.map(([key]) => key)).toEqual([
        `passages/42/${TEXT_HASH}/0-0.mp3`,
        `passages/42/${TEXT_HASH}/1-0.mp3`,
        `passages/42/${TEXT_HASH}/3-0.mp3`,
      ])
      const outcome = readOutcome(repo)
      if (outcome.kind !== "ready") throw new Error(`unexpected outcome: ${outcome.kind}`)
      expect(outcome).toMatchObject({ billedCharacters: 0, textHash: TEXT_HASH, voiceId: VOICE_ID })
      expect(outcome.manifest.blocks.map((block) => block.blockIndex)).toEqual([0, 1, 3])
      const [paragraph] = outcome.manifest.blocks[1]?.parts ?? []
      expect(paragraph?.key).toBe(`passages/42/${TEXT_HASH}/1-0.mp3`)
      expect(paragraph?.durationMs).toBeGreaterThan(0)
      /**
       * 単語の位置は元の本文（バッククォートを含む）の位置
       */
      const text = BLOCKS[1]?.text ?? ""
      expect(paragraph?.words.map(([, , startOffset, endOffset]) => text.slice(startOffset, endOffset))).toEqual([
        "Some", "components", "need", "to", "stay", "in", "sync", "with", "window", "events",
      ])
      expect(repo.passageAudioRepository.completeClaim).toHaveBeenCalledWith(buildTarget(), outcome, expect.objectContaining({ now: NOW }))
    })

    it("3,001 文字以上のブロックは 2 パートになり、キーが -0 / -1", async () => {
      const longText = Array.from({ length: 120 }, (_, index) => `Sentence ${index} explains retries.`).join(" ")
      const blocks: PassageBlock[] = [{ text: longText, type: "paragraph" }]
      const repo = createFakeRepo({ targets: [buildTarget({ blocks })] })
      const deps = createDeps()
      const textHash = calculateAudioTextHash({ blocks, voiceId: VOICE_ID })

      await generateAudio(buildInput(), repo, deps)

      expect(longText.length).toBeGreaterThan(3000)
      expect(deps.audioStorage.save.mock.calls.map(([key]) => key)).toEqual([
        `passages/42/${textHash}/0-0.mp3`,
        `passages/42/${textHash}/0-1.mp3`,
      ])
      const outcome = readOutcome(repo)
      if (outcome.kind !== "ready") throw new Error(`unexpected outcome: ${outcome.kind}`)
      const parts = outcome.manifest.blocks[0]?.parts ?? []
      expect(parts).toHaveLength(2)
      /**
       * 2 つめのパートの単語も元の本文の位置を指す
       */
      const secondWords = parts[1]?.words ?? []
      const lastWord = secondWords[secondWords.length - 1]
      expect(longText.slice(lastWord?.[2], lastWord?.[3])).toBe("retries")
    })

    it.each([
      ["ready（公開し直された・voice の確認）", "ready"],
      ["pending（再試行・手動の UPDATE で ready から戻された）", "pending"],
    ] as const)("前の行が %s でも、前の成功のマニフェストの hash が同じなら unchanged で、音声合成も保存もしない", async (_label, status) => {
      const repo = createFakeRepo({
        completeResult: "unchanged",
        targets: [buildTarget({ previous: { manifest: PREVIOUS_MANIFEST, status, textHash: TEXT_HASH } })],
      })
      const ttsClient = new FakeTtsClient()
      const synthesize = vi.spyOn(ttsClient, "synthesize")
      const deps = createDeps(ttsClient)

      const result = await generateAudio(buildInput(), repo, deps)

      expect(readOutcome(repo)).toEqual({ kind: "unchanged", textHash: TEXT_HASH })
      expect(result.unchangedCount).toBe(1)
      expect(synthesize).not.toHaveBeenCalled()
      expect(deps.audioStorage.save).not.toHaveBeenCalled()
      expect(deps.audioStorage.delete).not.toHaveBeenCalled()
    })

    it.each([
      ["別の Polly の voice", "Matthew"],
      ["fake（無音の mp3）で作った音声", "fake:Joanna"],
    ])("前の行が ready でも voice が違えば（%s。hash が違うので）作り直す", async (_label, previousVoiceId) => {
      const previousHash = calculateAudioTextHash({ blocks: BLOCKS, voiceId: previousVoiceId })
      const repo = createFakeRepo({
        targets: [buildTarget({ previous: { manifest: PREVIOUS_MANIFEST, status: "ready", textHash: previousHash } })],
      })

      await generateAudio(buildInput(), repo, createDeps())

      expect(readOutcome(repo).kind).toBe("ready")
    })

    it("前の行にマニフェストが無ければ（一度も成功していない）、hash が同じでも作り直す（失敗の後のやり直し）", async () => {
      const repo = createFakeRepo({
        targets: [buildTarget({ previous: { manifest: null, status: "pending", textHash: TEXT_HASH } })],
      })

      await generateAudio(buildInput(), repo, createDeps())

      expect(readOutcome(repo).kind).toBe("ready")
    })

    it("前の行が pending でマニフェストがあっても、hash が違えば（AUDIO_TEXT_VERSION を上げた後など）作り直して前の mp3 を消す", async () => {
      const repo = createFakeRepo({
        targets: [buildTarget({ previous: { manifest: PREVIOUS_MANIFEST, status: "pending", textHash: "old-hash" } })],
      })
      const deps = createDeps()

      await generateAudio(buildInput(), repo, deps)

      expect(readOutcome(repo).kind).toBe("ready")
      expect(deps.audioStorage.delete.mock.calls.map(([key]) => key)).toEqual([
        "passages/42/old-hash/0-0.mp3",
        "passages/42/old-hash/1-0.mp3",
      ])
    })

    it("completeClaim が ready なら前の hash の mp3 を消し、delete が throw しても続ける", async () => {
      const repo = createFakeRepo({
        targets: [
          buildTarget({ previous: { manifest: PREVIOUS_MANIFEST, status: "ready", textHash: "old-hash" } }),
          buildTarget({ passageId: 43 }),
        ],
      })
      const deps = createDeps()
      deps.audioStorage.delete.mockRejectedValueOnce(new Error("EACCES"))

      const result = await generateAudio(buildInput(), repo, deps)

      expect(deps.audioStorage.delete.mock.calls.map(([key]) => key)).toEqual([
        "passages/42/old-hash/0-0.mp3",
        "passages/42/old-hash/1-0.mp3",
      ])
      expect(result.readyCount).toBe(2)
    })

    it("completeClaim が text_changed なら今回作った mp3 を消す（前のマニフェストにあるキーは残す）", async () => {
      const repo = createFakeRepo({ completeResult: "text_changed" })
      const deps = createDeps()

      const result = await generateAudio(buildInput(), repo, deps)

      expect(deps.audioStorage.delete.mock.calls.map(([key]) => key)).toEqual(deps.audioStorage.save.mock.calls.map(([key]) => key))
      expect(result).toMatchObject({ failedCount: 0, retryLaterCount: 0, textChangedCount: 1 })
    })

    it("completeClaim が lost_claim なら何も消さない", async () => {
      const repo = createFakeRepo({
        completeResult: "lost_claim",
        targets: [buildTarget({ previous: { manifest: PREVIOUS_MANIFEST, status: "ready", textHash: "old-hash" } })],
      })
      const deps = createDeps()

      const result = await generateAudio(buildInput(), repo, deps)

      expect(deps.audioStorage.delete).not.toHaveBeenCalled()
      expect(result).toMatchObject({ failedCount: 0, lostClaimCount: 1, retryLaterCount: 0 })
    })

    it("読み上げるブロックが無ければ blocks が空のマニフェストで ready", async () => {
      const repo = createFakeRepo({ targets: [buildTarget({ blocks: [{ lang: "sh", text: "npm install", type: "code" }] })] })
      const deps = createDeps()

      await generateAudio(buildInput(), repo, deps)

      expect(readOutcome(repo)).toMatchObject({ kind: "ready", manifest: { blocks: [] } })
      expect(deps.audioStorage.save).not.toHaveBeenCalled()
    })

    it("作り直しの依頼があれば、hash が同じでも作り直し、保存キーに確保の時刻を入れて前の mp3（同じ hash のキー）を消す", async () => {
      const previousManifest: PassageAudioManifest = {
        blocks: [{ blockIndex: 0, parts: [{ durationMs: 900, key: `passages/42/${TEXT_HASH}/0-0.mp3`, words: [] }] }],
      }
      const repo = createFakeRepo({
        targets: [buildTarget({
          claimedStatus: "ready",
          isRegenerationRequested: true,
          previous: { manifest: previousManifest, status: "ready", textHash: TEXT_HASH },
        })],
      })
      const deps = createDeps()

      const result = await generateAudio(buildInput(), repo, deps)

      const keyDirectory = `passages/42/${TEXT_HASH}-r${NOW.getTime()}`
      expect(deps.audioStorage.save.mock.calls.map(([key]) => key)).toEqual([
        `${keyDirectory}/0-0.mp3`,
        `${keyDirectory}/1-0.mp3`,
        `${keyDirectory}/3-0.mp3`,
      ])
      expect(readOutcome(repo)).toMatchObject({ kind: "ready", textHash: TEXT_HASH })
      expect(deps.audioStorage.delete.mock.calls.map(([key]) => key)).toEqual([`passages/42/${TEXT_HASH}/0-0.mp3`])
      expect(result.readyCount).toBe(1)
    })

    it("作り直しの依頼で hash が違えば（本文も直した）、保存キーはふつうの hash のディレクトリ", async () => {
      const repo = createFakeRepo({
        targets: [buildTarget({
          isRegenerationRequested: true,
          previous: { manifest: PREVIOUS_MANIFEST, status: "pending", textHash: "old-hash" },
        })],
      })
      const deps = createDeps()

      await generateAudio(buildInput(), repo, deps)

      expect(deps.audioStorage.save.mock.calls[0]?.[0]).toBe(`passages/42/${TEXT_HASH}/0-0.mp3`)
    })

    it("ready のまま確保した行（voice の変更）も作り直し、completeClaim にその確保（claimedStatus: ready）を渡す", async () => {
      const previousHash = calculateAudioTextHash({ blocks: BLOCKS, voiceId: "Matthew" })
      const target = buildTarget({ claimedStatus: "ready", previous: { manifest: PREVIOUS_MANIFEST, status: "ready", textHash: previousHash } })
      const repo = createFakeRepo({ targets: [target] })

      await generateAudio(buildInput(), repo, createDeps())

      expect(repo.passageAudioRepository.completeClaim).toHaveBeenCalledWith(target, expect.objectContaining({ kind: "ready" }), expect.anything())
    })

    it("Polly のリクエストごとの課金文字数を問題の id と時刻つきで記録する", async () => {
      const repo = createFakeRepo({ targets: [buildTarget({ blocks: [{ text: "Effects run.", type: "paragraph" }] })] })

      await generateAudio(buildInput(), repo, createDeps(new BilledFakeTtsClient()))

      expect(repo.audioSynthesisUsageRepository.record.mock.calls).toEqual([
        [{ characters: 12, now: NOW, target: { passageId: 42 } }],
        [{ characters: 12, now: NOW, target: { passageId: 42 } }],
      ])
    })

    it("課金の無い応答（文字数 0）は記録しない", async () => {
      const repo = createFakeRepo()
      const ttsClient = new FakeTtsClient()
      vi.spyOn(ttsClient, "synthesize").mockImplementation(async (input) => {
        await input.recordBilledCharacters(0)
        return new FakeTtsClient().synthesize(input)
      })

      await generateAudio(buildInput(), repo, createDeps(ttsClient))

      expect(repo.audioSynthesisUsageRepository.record).not.toHaveBeenCalled()
    })
  })

  describe("月の上限（monthlyCharacterLimit）", () => {
    it("今月（UTC の暦月の初め以降）の課金文字数を primary から読み、合計 + 見込みが上限ちょうどまでなら作る", async () => {
      const estimated = estimateBilledCharacters(BLOCKS)
      const repo = createFakeRepo({ usedCharacters: MONTHLY_CHARACTER_LIMIT - estimated })

      const result = await generateAudio(buildInput(), repo, createDeps())

      expect(repo.audioSynthesisUsageRepository.sumCharactersSinceFromPrimary).toHaveBeenCalledWith(new Date("2026-10-01T00:00:00.000Z"))
      expect(result).toMatchObject({ isMonthlyLimitReached: false, readyCount: 1 })
    })

    it("合計 + 見込みが上限を超えるなら、音声合成を呼ばずにその問題と残りの確保を外して止める（失敗には数えない）", async () => {
      const estimated = estimateBilledCharacters(BLOCKS)
      const unchangedTarget = buildTarget({ passageId: 44, previous: { manifest: PREVIOUS_MANIFEST, status: "ready", textHash: TEXT_HASH } })
      const targets = [buildTarget(), buildTarget({ claimedStatus: "ready", passageId: 43 }), unchangedTarget]
      const repo = createFakeRepo({ targets, usedCharacters: MONTHLY_CHARACTER_LIMIT - estimated + 1 })
      const ttsClient = new FakeTtsClient()
      const synthesize = vi.spyOn(ttsClient, "synthesize")

      const result = await generateAudio(buildInput(), repo, createDeps(ttsClient))

      expect(synthesize).not.toHaveBeenCalled()
      expect(repo.passageAudioRepository.completeClaim).not.toHaveBeenCalled()
      expect(repo.passageAudioRepository.releaseClaim.mock.calls.map(([claim]) => claim)).toEqual(targets)
      expect(result).toMatchObject({ failedCount: 0, isMonthlyLimitReached: true, readyCount: 0, retryLaterCount: 0 })
    })

    it("途中の問題で上限に達したら、それまでの結果は書いたまま、その問題から先の確保を外す", async () => {
      const estimated = estimateBilledCharacters(BLOCKS)
      const targets = [buildTarget(), buildTarget({ passageId: 43 }), buildTarget({ passageId: 44 })]
      const repo = createFakeRepo({ targets })
      repo.audioSynthesisUsageRepository.sumCharactersSinceFromPrimary
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(MONTHLY_CHARACTER_LIMIT - estimated + 1)

      const result = await generateAudio(buildInput(), repo, createDeps())

      expect(repo.passageAudioRepository.completeClaim).toHaveBeenCalledTimes(1)
      expect(repo.passageAudioRepository.releaseClaim.mock.calls.map(([claim]) => claim.passageId)).toEqual([43, 44])
      expect(result).toMatchObject({ isMonthlyLimitReached: true, readyCount: 1 })
    })

    it("作り直さない（unchanged）問題は Polly を呼ばないので、上限を見ない", async () => {
      const repo = createFakeRepo({
        completeResult: "unchanged",
        targets: [buildTarget({ previous: { manifest: PREVIOUS_MANIFEST, status: "ready", textHash: TEXT_HASH } })],
        usedCharacters: MONTHLY_CHARACTER_LIMIT,
      })

      const result = await generateAudio(buildInput(), repo, createDeps())

      expect(repo.audioSynthesisUsageRepository.sumCharactersSinceFromPrimary).not.toHaveBeenCalled()
      expect(result).toMatchObject({ isMonthlyLimitReached: false, unchangedCount: 1 })
    })
  })

  describe("却下された問題の音声", () => {
    const REJECTED: RejectedPassageAudio[] = [
      { manifest: PREVIOUS_MANIFEST, passageId: 42 },
      { manifest: null, passageId: 50 },
    ]

    it("確保より前に、確保中でない行（30 分前を境に）の mp3 をすべて消してから行を消す（マニフェストが無い行は行だけ消す）", async () => {
      const repo = createFakeRepo({ rejected: REJECTED, targets: [] })
      const deps = createDeps()

      const result = await generateAudio(buildInput(), repo, deps)

      expect(repo.passageAudioRepository.findRejected).toHaveBeenCalledWith(new Date("2026-10-13T02:30:00.000Z"))
      expect(deps.audioStorage.delete.mock.calls.map(([key]) => key)).toEqual(["passages/42/old-hash/0-0.mp3", "passages/42/old-hash/1-0.mp3"])
      expect(repo.passageAudioRepository.deleteByPassageId.mock.calls.map(([passageId]) => passageId)).toEqual([42, 50])
      expect(result.purgedCount).toBe(2)
      const [findOrder] = repo.passageAudioRepository.findRejected.mock.invocationCallOrder
      const [claimOrder] = repo.passageAudioRepository.claimTargets.mock.invocationCallOrder
      expect(findOrder).toBeLessThan(claimOrder ?? 0)
    })

    it("mp3 の削除に一時的に失敗したら、その問題の行は残して（次の実行でやり直す）次の問題に進む", async () => {
      const repo = createFakeRepo({ rejected: REJECTED, targets: [] })
      const deps = createDeps()
      deps.audioStorage.delete.mockRejectedValueOnce(Object.assign(new Error("Please reduce your request rate."), { name: "SlowDown" }))

      const result = await generateAudio(buildInput(), repo, deps)

      expect(deps.audioStorage.delete).toHaveBeenCalledTimes(2)
      expect(repo.passageAudioRepository.deleteByPassageId.mock.calls.map(([passageId]) => passageId)).toEqual([50])
      expect(result.purgedCount).toBe(1)
    })
  })

  describe("異常系", () => {
    it("synthesize が普通のエラーなら failed の outcome（maxAttempts: 3、error に name と message）にし、次の問題は続ける", async () => {
      const repo = createFakeRepo({ targets: [buildTarget(), buildTarget({ passageId: 43 })] })
      repo.passageAudioRepository.completeClaim.mockImplementation(async (_claim, outcome) =>
        (outcome.kind === "failed" ? "retry_later" : "ready"))
      const ttsClient = new FakeTtsClient()
      vi.spyOn(ttsClient, "synthesize").mockRejectedValueOnce(
        Object.assign(new Error("Rate exceeded"), { name: "ThrottlingException" }),
      )

      const result = await generateAudio(buildInput(), repo, createDeps(ttsClient))

      expect(readOutcome(repo, 0)).toEqual({ error: "ThrottlingException: Rate exceeded", kind: "failed", maxAttempts: 3 })
      expect(readOutcome(repo, 1).kind).toBe("ready")
      expect(result).toMatchObject({ readyCount: 1, retryLaterCount: 1 })
    })

    it.each([
      ["S3 の 5xx", Object.assign(new Error("We encountered an internal error"), { name: "InternalError" }), "InternalError: We encountered an internal error"],
      ["ローカルの保存先の容量不足", new Error("disk full"), "Error: disk full"],
    ])("保存の一時的な失敗（%s）は failed の outcome にし、次の問題は続ける", async (_label, error, expectedError) => {
      const repo = createFakeRepo({ targets: [buildTarget(), buildTarget({ passageId: 43 })] })
      repo.passageAudioRepository.completeClaim.mockImplementation(async (_claim, outcome) =>
        (outcome.kind === "failed" ? "failed" : "ready"))
      const deps = createDeps()
      deps.audioStorage.save.mockRejectedValueOnce(error)

      const result = await generateAudio(buildInput(), repo, deps)

      expect(readOutcome(repo, 0)).toEqual({ error: expectedError, kind: "failed", maxAttempts: 3 })
      expect(readOutcome(repo, 1).kind).toBe("ready")
      expect(repo.passageAudioRepository.releaseClaim).not.toHaveBeenCalled()
      expect(result).toMatchObject({ failedCount: 1, readyCount: 1 })
    })

    it.each(["AccessDenied", "NoSuchBucket", "InvalidAccessKeyId", "SignatureDoesNotMatch", "ExpiredToken"])(
      "保存先の設定の誤り（%s）なら失敗回数を増やさずに releaseClaim して throw し、残りの問題は処理しない",
      async (name) => {
        const second = buildTarget({ passageId: 43 })
        const repo = createFakeRepo({ targets: [buildTarget(), second] })
        const ttsClient = new FakeTtsClient()
        const synthesize = vi.spyOn(ttsClient, "synthesize")
        const deps = createDeps(ttsClient)
        const fatal = Object.assign(new Error(`${name} occurred`), { name })
        deps.audioStorage.save.mockRejectedValue(fatal)

        await expect(generateAudio(buildInput(), repo, deps)).rejects.toBe(fatal)

        expect(repo.passageAudioRepository.releaseClaim).toHaveBeenCalledTimes(1)
        expect(repo.passageAudioRepository.releaseClaim).toHaveBeenCalledWith(buildTarget())
        expect(repo.passageAudioRepository.completeClaim).not.toHaveBeenCalled()
        /**
         * 1 件目の最初のパートで止まり、2 件目の音声合成（Polly の料金）は呼ばない
         */
        expect(synthesize).toHaveBeenCalledTimes(1)
        expect(deps.audioStorage.save).toHaveBeenCalledTimes(1)
      },
    )

    it("前の mp3 の削除で保存先の設定の誤りが起きたら throw し、残りの問題は処理しない（結果は書き終えているので releaseClaim しない）", async () => {
      const repo = createFakeRepo({
        targets: [
          buildTarget({ previous: { manifest: PREVIOUS_MANIFEST, status: "ready", textHash: "old-hash" } }),
          buildTarget({ passageId: 43 }),
        ],
      })
      const deps = createDeps()
      const fatal = Object.assign(new Error("Access Denied"), { name: "AccessDenied" })
      deps.audioStorage.delete.mockRejectedValue(fatal)

      await expect(generateAudio(buildInput(), repo, deps)).rejects.toBe(fatal)

      expect(repo.passageAudioRepository.completeClaim).toHaveBeenCalledTimes(1)
      expect(repo.passageAudioRepository.releaseClaim).not.toHaveBeenCalled()
      expect(deps.audioStorage.delete).toHaveBeenCalledTimes(1)
    })

    it("音声合成の設定の誤り（資格情報を解決できない）なら releaseClaim して throw し、残りの問題は処理しない", async () => {
      const second = buildTarget({ passageId: 43 })
      const repo = createFakeRepo({ targets: [buildTarget(), second] })
      const ttsClient = new FakeTtsClient()
      const fatal = Object.assign(new Error("Could not load credentials"), { name: "CredentialsProviderError" })
      vi.spyOn(ttsClient, "synthesize").mockRejectedValue(fatal)

      await expect(generateAudio(buildInput(), repo, createDeps(ttsClient))).rejects.toBe(fatal)

      expect(repo.passageAudioRepository.releaseClaim).toHaveBeenCalledTimes(1)
      expect(repo.passageAudioRepository.releaseClaim).toHaveBeenCalledWith(buildTarget())
      expect(repo.passageAudioRepository.completeClaim).not.toHaveBeenCalled()
    })

    it("却下された問題の mp3 の削除で保存先の設定の誤りが起きたら、行を消さずに throw し、確保もしない", async () => {
      const repo = createFakeRepo({ rejected: [{ manifest: PREVIOUS_MANIFEST, passageId: 42 }] })
      const deps = createDeps()
      const fatal = Object.assign(new Error("Access Denied"), { name: "AccessDenied" })
      deps.audioStorage.delete.mockRejectedValue(fatal)

      await expect(generateAudio(buildInput(), repo, deps)).rejects.toBe(fatal)

      expect(repo.passageAudioRepository.deleteByPassageId).not.toHaveBeenCalled()
      expect(repo.passageAudioRepository.claimTargets).not.toHaveBeenCalled()
    })

    it("ready のまま確保した行で設定の誤りが起きたら、その確保（claimedStatus: ready）を releaseClaim に渡して throw する", async () => {
      const target = buildTarget({ claimedStatus: "ready", previous: { manifest: PREVIOUS_MANIFEST, status: "ready", textHash: "old-hash" } })
      const repo = createFakeRepo({ targets: [target] })
      const ttsClient = new FakeTtsClient()
      const fatal = Object.assign(new Error("User is not authorized"), { name: "AccessDeniedException" })
      vi.spyOn(ttsClient, "synthesize").mockRejectedValue(fatal)

      await expect(generateAudio(buildInput(), repo, createDeps(ttsClient))).rejects.toBe(fatal)

      expect(repo.passageAudioRepository.releaseClaim).toHaveBeenCalledWith(target)
    })
  })
})
