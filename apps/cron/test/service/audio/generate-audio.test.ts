import type { PassageAudioManifest, PassageBlock } from "@repo/domain"
import type { Storage } from "@repo/storage"

import { FakeTtsClient, type TtsClient } from "../../../src/client/polly"
import { calculateAudioTextHash } from "../../../src/lib/audio"
import type {
  AudioClaimOutcome,
  AudioClaimResult,
  ClaimedAudioTarget,
  PassageAudioRepository,
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
  generationStartedAt: NOW,
  passageId: 42,
  previous: null,
  ...overrides,
})

const buildInput = (overrides: Partial<GenerateAudioInput> = {}): GenerateAudioInput => ({
  isShuttingDown: () => false,
  maxPassagesPerRun: 20,
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

const createFakeRepo = (options: { completeResult?: AudioClaimResult; targets?: ClaimedAudioTarget[] } = {}) => {
  const passageAudioRepository = {
    claimTargets: vi.fn<PassageAudioRepository["claimTargets"]>(async () => options.targets ?? [buildTarget()]),
    completeClaim: vi.fn<PassageAudioRepository["completeClaim"]>(async () => options.completeResult ?? "ready"),
    releaseClaim: vi.fn<PassageAudioRepository["releaseClaim"]>(async () => undefined),
    releaseStaleGenerating: vi.fn<PassageAudioRepository["releaseStaleGenerating"]>(async () => 0),
  } satisfies PassageAudioRepository
  return { passageAudioRepository }
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
    it("30 分前より前の generating を回収してから、maxPassagesPerRun 件を確保する", async () => {
      const repo = createFakeRepo({ targets: [] })

      await generateAudio(buildInput({ maxPassagesPerRun: 7 }), repo, createDeps())

      expect(repo.passageAudioRepository.releaseStaleGenerating).toHaveBeenCalledWith(new Date("2026-10-13T02:30:00.000Z"))
      expect(repo.passageAudioRepository.claimTargets).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 7, now: NOW, voiceId: VOICE_ID }),
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

      expect(result).toEqual({ failedCount: 0, lostClaimCount: 0, readyCount: 1, retryLaterCount: 0, textChangedCount: 0, unchangedCount: 0 })
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
      expect(repo.passageAudioRepository.completeClaim).toHaveBeenCalledWith(
        { blocks: BLOCKS, generationStartedAt: NOW, passageId: 42, previous: null },
        outcome,
        expect.objectContaining({ now: NOW }),
      )
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

    it("isShuttingDown が true になったら残りを処理しない", async () => {
      const repo = createFakeRepo({ targets: [buildTarget(), buildTarget({ passageId: 43 })] })
      let processedCount = 0
      repo.passageAudioRepository.completeClaim.mockImplementation(async () => {
        processedCount++
        return "ready"
      })

      const result = await generateAudio(buildInput({ isShuttingDown: () => processedCount > 0 }), repo, createDeps())

      expect(repo.passageAudioRepository.completeClaim).toHaveBeenCalledTimes(1)
      expect(result.readyCount).toBe(1)
    })
  })
})
