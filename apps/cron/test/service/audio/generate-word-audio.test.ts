import type { Storage } from "@repo/storage"

import { FakeTtsClient, type SynthesizeInput, type TtsClient } from "../../../src/client/polly"
import { buildWordAudioKey, calculateWordTextHash } from "../../../src/lib/audio"
import type {
  AudioSynthesisUsageRepository,
  ClaimedWordAudio,
  WordAudioClaimOutcome,
  WordAudioClaimResult,
  WordAudioRepository,
} from "../../../src/repository"
import { generateWordAudio, type GenerateWordAudioInput } from "../../../src/service/audio"

/**
 * 1 語ごとのログを捨てる（@repo/logger の logger は Proxy で spyOn できない）
 */
vi.mock("@repo/logger", () => ({ logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

const NOW = new Date("2026-10-14T03:00:00.000Z")

const VOICE_ID = "Joanna"

const buildClaim = (overrides: Partial<ClaimedWordAudio> = {}): ClaimedWordAudio => ({
  claimedStatus: "generating",
  generationStartedAt: NOW,
  id: 7,
  lemma: "escape hatch",
  previousAudioKey: null,
  ...overrides,
})

const buildInput = (overrides: Partial<GenerateWordAudioInput> = {}): GenerateWordAudioInput => ({
  isShuttingDown: () => false,
  maxWordsPerRun: 300,
  monthlyCharacterLimit: 1_800_000,
  now: () => NOW,
  voiceId: VOICE_ID,
  ...overrides,
})

const createFakeRepo = (options: { claims?: ClaimedWordAudio[]; completeResult?: WordAudioClaimResult; usedCharacters?: number } = {}) => {
  const wordAudioRepository = {
    claimTargets: vi.fn<WordAudioRepository["claimTargets"]>(async () => options.claims ?? [buildClaim()]),
    completeClaim: vi.fn<WordAudioRepository["completeClaim"]>(async () => options.completeResult ?? "ready"),
    releaseClaim: vi.fn<WordAudioRepository["releaseClaim"]>(async () => undefined),
    releaseStaleGenerating: vi.fn<WordAudioRepository["releaseStaleGenerating"]>(async () => 0),
  } satisfies WordAudioRepository
  const audioSynthesisUsageRepository = {
    record: vi.fn<AudioSynthesisUsageRepository["record"]>(async () => undefined),
    sumCharactersSinceFromPrimary: vi.fn<AudioSynthesisUsageRepository["sumCharactersSinceFromPrimary"]>(async () => options.usedCharacters ?? 0),
  } satisfies AudioSynthesisUsageRepository
  return { audioSynthesisUsageRepository, wordAudioRepository }
}

/**
 * Polly のように、mp3 の 1 リクエスト分の課金文字数（テキストの長さ）を recordBilledCharacters で記録する音声合成（中身は FakeTtsClient）
 */
class BilledFakeTtsClient implements TtsClient {
  private _fake = new FakeTtsClient()

  public async synthesize(input: SynthesizeInput) {
    return this._fake.synthesize(input)
  }

  public async synthesizeAudio(input: SynthesizeInput) {
    await input.recordBilledCharacters(input.text.length)
    return { audio: (await this._fake.synthesizeAudio(input)).audio, billedCharacters: input.text.length }
  }
}

/**
 * synthesizeAudio が error を throw する音声合成
 */
const createFailingTtsClient = (error: Error): TtsClient => ({
  synthesize: vi.fn(),
  synthesizeAudio: vi.fn(async () => {
    throw error
  }),
})

const createFakeStorage = () => ({
  delete: vi.fn<Storage["delete"]>(async () => undefined),
  save: vi.fn<Storage["save"]>(async (key) => `/media/${key}`),
})

const createDeps = (ttsClient: TtsClient = new FakeTtsClient()) => ({ audioStorage: createFakeStorage(), ttsClient })

const readOutcome = (repo: ReturnType<typeof createFakeRepo>, call = 0): WordAudioClaimOutcome => {
  const outcome = repo.wordAudioRepository.completeClaim.mock.calls[call]?.[1]
  if (!outcome) throw new Error("completeClaim was not called")
  return outcome
}

const KEY = buildWordAudioKey(calculateWordTextHash({ lemma: "escape hatch", voiceId: VOICE_ID }))

describe("generateWordAudio", () => {
  describe("正常系", () => {
    it("30 分前より前の generating を回収してから、maxWordsPerRun 語を確保する（失敗の上限は 3）", async () => {
      const repo = createFakeRepo({ claims: [] })

      const result = await generateWordAudio(buildInput({ maxWordsPerRun: 50 }), repo, createDeps())

      const staleBefore = new Date("2026-10-14T02:30:00.000Z")
      expect(repo.wordAudioRepository.releaseStaleGenerating).toHaveBeenCalledWith(staleBefore)
      expect(repo.wordAudioRepository.claimTargets).toHaveBeenCalledWith({ limit: 50, maxAttempts: 3, now: NOW, staleBefore, voiceId: VOICE_ID })
      expect(result).toEqual({ failedCount: 0, isMonthlyLimitReached: false, lostClaimCount: 0, readyCount: 0, retryLaterCount: 0 })
    })

    it("見出し語のまま mp3 だけを作り、words/{text_hash}.mp3 に保存して ready の結果を書く", async () => {
      const repo = createFakeRepo()
      const deps = createDeps()

      const result = await generateWordAudio(buildInput(), repo, deps)

      expect(deps.audioStorage.save).toHaveBeenCalledWith(KEY, expect.any(Buffer))
      expect(readOutcome(repo)).toEqual({
        audioKey: KEY,
        billedCharacters: 0,
        kind: "ready",
        textHash: calculateWordTextHash({ lemma: "escape hatch", voiceId: VOICE_ID }),
        voiceId: VOICE_ID,
      })
      expect(repo.wordAudioRepository.completeClaim).toHaveBeenCalledWith(buildClaim(), expect.anything(), NOW)
      expect(result.readyCount).toBe(1)
    })

    it("課金文字数を word_audio_id と時刻つきで記録する（fake は課金されないので記録しない）", async () => {
      const billed = createFakeRepo()
      await generateWordAudio(buildInput(), billed, createDeps(new BilledFakeTtsClient()))
      const fake = createFakeRepo()
      await generateWordAudio(buildInput(), fake, createDeps())

      expect(billed.audioSynthesisUsageRepository.record.mock.calls).toEqual([[{ characters: 12, now: NOW, target: { wordAudioId: 7 } }]])
      expect(readOutcome(billed)).toEqual(expect.objectContaining({ billedCharacters: 12 }))
      expect(fake.audioSynthesisUsageRepository.record).not.toHaveBeenCalled()
    })

    it("voice の変更で作り直して ready にしたら、前の mp3 を消す（キーが同じなら消さない）", async () => {
      const repo = createFakeRepo({
        claims: [
          buildClaim({ claimedStatus: "ready", previousAudioKey: "words/old.mp3" }),
          buildClaim({ claimedStatus: "ready", id: 8, previousAudioKey: KEY }),
        ],
      })
      const deps = createDeps()

      await generateWordAudio(buildInput(), repo, deps)

      expect(deps.audioStorage.delete.mock.calls).toEqual([["words/old.mp3"]])
    })

    it("月の上限ちょうど（今月の合計 + 見出し語の文字数 = 上限）なら作る（境界値）", async () => {
      const repo = createFakeRepo({ usedCharacters: 100 })

      const result = await generateWordAudio(buildInput({ monthlyCharacterLimit: 100 + "escape hatch".length }), repo, createDeps())

      expect(result).toEqual(expect.objectContaining({ isMonthlyLimitReached: false, readyCount: 1 }))
    })
  })

  describe("異常系", () => {
    it("今月の合計 + 見出し語の文字数が月の上限を超えるなら、その語と残りの確保を外して止める（音声合成を呼ばない）", async () => {
      const claims = [buildClaim(), buildClaim({ id: 8, lemma: "cache" })]
      const repo = createFakeRepo({ claims, usedCharacters: 100 })
      const deps = createDeps(new BilledFakeTtsClient())
      const synthesizeAudio = vi.spyOn(deps.ttsClient, "synthesizeAudio")

      const result = await generateWordAudio(buildInput({ monthlyCharacterLimit: 100 + "escape hatch".length - 1 }), repo, deps)

      expect(result).toEqual(expect.objectContaining({ isMonthlyLimitReached: true, readyCount: 0 }))
      expect(repo.wordAudioRepository.releaseClaim.mock.calls).toEqual([[claims[0]], [claims[1]]])
      expect(synthesizeAudio).not.toHaveBeenCalled()
      expect(repo.wordAudioRepository.completeClaim).not.toHaveBeenCalled()
    })

    it("一時的な失敗（throttling など）は失敗の outcome（上限 3）にして、次の語は続ける", async () => {
      const repo = createFakeRepo({ claims: [buildClaim(), buildClaim({ id: 8, lemma: "cache" })], completeResult: "retry_later" })
      const throttled = Object.assign(new Error("Rate exceeded"), { name: "ThrottlingException" })

      const result = await generateWordAudio(buildInput(), repo, createDeps(createFailingTtsClient(throttled)))

      expect(readOutcome(repo)).toEqual({ error: "ThrottlingException: Rate exceeded", kind: "failed", maxAttempts: 3 })
      expect(repo.wordAudioRepository.completeClaim).toHaveBeenCalledTimes(2)
      expect(result.retryLaterCount).toBe(2)
    })

    it("設定の誤り（権限が無い）は、その語の確保を失敗回数を増やさずに外して throw する", async () => {
      const repo = createFakeRepo({ claims: [buildClaim(), buildClaim({ id: 8, lemma: "cache" })] })
      const denied = Object.assign(new Error("not authorized"), { name: "AccessDeniedException" })

      await expect(generateWordAudio(buildInput(), repo, createDeps(createFailingTtsClient(denied)))).rejects.toBe(denied)
      expect(repo.wordAudioRepository.releaseClaim.mock.calls).toEqual([[buildClaim()]])
      expect(repo.wordAudioRepository.completeClaim).not.toHaveBeenCalled()
    })

    it("確保が取り直されていた（lost_claim）ら数えるだけで、前の mp3 は消さない", async () => {
      const repo = createFakeRepo({ claims: [buildClaim({ claimedStatus: "ready", previousAudioKey: "words/old.mp3" })], completeResult: "lost_claim" })
      const deps = createDeps()

      const result = await generateWordAudio(buildInput(), repo, deps)

      expect(result.lostClaimCount).toBe(1)
      expect(deps.audioStorage.delete).not.toHaveBeenCalled()
    })

    it("前の mp3 を消せなくても（一時的な失敗）warn だけで続ける。保存先の設定の誤りは throw する", async () => {
      const claims = [buildClaim({ claimedStatus: "ready", previousAudioKey: "words/old.mp3" })]
      const temporary = createDeps()
      temporary.audioStorage.delete.mockRejectedValueOnce(Object.assign(new Error("slow down"), { name: "SlowDown" }))
      const fatal = createDeps()
      const noBucket = Object.assign(new Error("no bucket"), { name: "NoSuchBucket" })
      fatal.audioStorage.delete.mockRejectedValueOnce(noBucket)

      await expect(generateWordAudio(buildInput(), createFakeRepo({ claims }), temporary)).resolves.toEqual(expect.objectContaining({ readyCount: 1 }))
      await expect(generateWordAudio(buildInput(), createFakeRepo({ claims }), fatal)).rejects.toBe(noBucket)
    })

    it("停止指示を受けたら、残りの語を処理しない", async () => {
      const repo = createFakeRepo({ claims: [buildClaim(), buildClaim({ id: 8, lemma: "cache" })] })
      let calls = 0

      await generateWordAudio(buildInput({ isShuttingDown: () => calls++ > 0 }), repo, createDeps())

      expect(repo.wordAudioRepository.completeClaim).toHaveBeenCalledTimes(1)
    })
  })
})
