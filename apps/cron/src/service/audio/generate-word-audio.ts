import { logger } from "@repo/logger"
import type { Storage } from "@repo/storage"

import type { TtsClient } from "../../client/polly"
import { MAX_AUDIO_ATTEMPTS, STALE_CLAIM_MINUTES } from "../../const/audio"
import {
  buildWordAudioKey,
  calculateWordTextHash,
  describeAudioError,
  getBillingMonthStart,
  isFatalAudioGenerationError,
} from "../../lib/audio"
import type {
  AudioSynthesisUsageRepository,
  ClaimedWordAudio,
  WordAudioClaimOutcome,
  WordAudioClaimResult,
  WordAudioRepository,
} from "../../repository"

const MILLIS_PER_MINUTE = 60 * 1000

export type GenerateWordAudioInput = {
  /**
   * 1 回の実行で確保する語の上限（WORD_AUDIO_MAX_PER_RUN）
   */
  maxWordsPerRun: number
  /**
   * 今月（UTC の暦月）に Polly で課金してよい文字数（AUDIO_MONTHLY_CHARACTER_LIMIT。読み上げと合算）
   */
  monthlyCharacterLimit: number
  now: () => Date
  /**
   * word_audios.voice_id と text_hash に入れる voice（buildAudioVoiceId の値。fake は `fake:<voice>`）。音声合成にもそのまま渡す
   */
  voiceId: string
}

export type GenerateWordAudioResult = {
  /**
   * 失敗が上限に達した語の数。retryLaterCount と合わせて 1 語でもあれば task が exit 1 で終える
   */
  failedCount: number
  /**
   * 月の上限（monthlyCharacterLimit）に達して止めたか。true なら task が exit 1 で終える
   */
  isMonthlyLimitReached: boolean
  /**
   * 確保が 30 分を過ぎて別の実行に取り直されていた語の数（結果を捨てた）
   */
  lostClaimCount: number
  readyCount: number
  /**
   * 失敗したが上限に達していないので次の実行に回した語の数
   */
  retryLaterCount: number
}

type GenerateWordAudioRepo = {
  audioSynthesisUsageRepository: AudioSynthesisUsageRepository
  wordAudioRepository: WordAudioRepository
}

type GenerateWordAudioDeps = {
  /**
   * mp3 の保存先（読み上げと同じ。本番は S3、ローカルは .storage/audio/）
   */
  audioStorage: Storage
  ttsClient: TtsClient
}

/**
 * 1 語分の音声を作る（トランザクションの外）。見出し語のまま mp3 だけを作り、words/{text_hash}.mp3 に保存する。
 * 課金された文字数は word_audio_id つきで記録する（失敗した語の分も数える）。
 * 設定の誤り（isFatalAudioGenerationError。Polly の資格情報・権限・voice、保存先の権限・bucket など）は throw し、それ以外の失敗は failed の outcome にする
 */
const generateOneWordAudio = async (
  claim: ClaimedWordAudio,
  options: { now: () => Date; voiceId: string },
  repo: GenerateWordAudioRepo,
  deps: GenerateWordAudioDeps,
): Promise<WordAudioClaimOutcome> => {
  const textHash = calculateWordTextHash({ lemma: claim.lemma, voiceId: options.voiceId })
  const audioKey = buildWordAudioKey(textHash)
  const recordBilledCharacters = async (characters: number): Promise<void> => {
    /**
     * CHECK 制約（characters > 0）に合わせ、課金の無い応答は記録しない
     */
    if (characters <= 0) return
    await repo.audioSynthesisUsageRepository.record({ characters, now: options.now(), target: { wordAudioId: claim.id } })
  }
  try {
    const result = await deps.ttsClient.synthesizeAudio({ recordBilledCharacters, text: claim.lemma, voiceId: options.voiceId })
    await deps.audioStorage.save(audioKey, result.audio)
    return { audioKey, billedCharacters: result.billedCharacters, kind: "ready", textHash, voiceId: options.voiceId }
  } catch (error) {
    if (isFatalAudioGenerationError(error)) throw error
    return { error: describeAudioError(error), kind: "failed", maxAttempts: MAX_AUDIO_ATTEMPTS }
  }
}

/**
 * voice の変更で作り直して ready にしたら、前の mp3 を消す（キーが同じなら消さない）。保存先の設定の誤りは throw して止め、
 * それ以外の失敗は warn だけ（次に voice を変えるまで残るだけで、実害は無い）。lost_claim は何も消さない（取り直した実行が同じキーを使う）
 */
const deletePreviousWordAudio = async (
  claim: ClaimedWordAudio,
  outcome: WordAudioClaimOutcome,
  result: WordAudioClaimResult,
  deps: GenerateWordAudioDeps,
): Promise<void> => {
  if (outcome.kind !== "ready" || result !== "ready") return
  if (claim.previousAudioKey === null || claim.previousAudioKey === outcome.audioKey) return
  try {
    await deps.audioStorage.delete(claim.previousAudioKey)
  } catch (error) {
    if (isFatalAudioGenerationError(error)) {
      logger.error("failed to delete a word audio file because of a storage configuration error", error, { key: claim.previousAudioKey })
      throw error
    }
    logger.warn("failed to delete a word audio file", { error: describeAudioError(error), key: claim.previousAudioKey })
  }
}

/**
 * generate:word-audio の本体。単語帳に出うる見出し語の発音の音声を作る（vocabulary-pronunciation README「単語の音声の生成タスク」）。
 *
 * 1. generating のまま 30 分以上たった行を pending に戻す
 * 2. 作り直し待ち・voice の変更・まだ行の無い見出し語を確保する（短いトランザクション）
 * 3. 1 語ずつ、トランザクションの外で mp3 を作る。作る前に今月の課金文字数（読み上げと合算）+ 見出し語の文字数が月の上限を超えるなら、
 *    残りの確保を外して止める。1 語の失敗で他の語は止めない。設定の誤り（音声合成・保存先）はその語の確保を外して throw する
 * 4. 確保した時刻を条件に結果を書き、voice の変更で作り直したなら前の mp3 を消す
 */
export const generateWordAudio = async (
  input: GenerateWordAudioInput,
  repo: GenerateWordAudioRepo,
  deps: GenerateWordAudioDeps,
): Promise<GenerateWordAudioResult> => {
  const result: GenerateWordAudioResult = {
    failedCount: 0,
    isMonthlyLimitReached: false,
    lostClaimCount: 0,
    readyCount: 0,
    retryLaterCount: 0,
  }

  const now = input.now()
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MINUTES * MILLIS_PER_MINUTE)
  const releasedCount = await repo.wordAudioRepository.releaseStaleGenerating(staleBefore)
  if (releasedCount > 0) logger.warn("stale generating word audios were released", { releasedCount })

  const claims = await repo.wordAudioRepository.claimTargets({
    limit: input.maxWordsPerRun,
    maxAttempts: MAX_AUDIO_ATTEMPTS,
    now,
    staleBefore,
    voiceId: input.voiceId,
  })
  logger.info("word audio targets claimed", { count: claims.length })

  for (const [index, claim] of claims.entries()) {
    /**
     * Polly は文字数で課金するので、見出し語の文字数を見込みにする（SSML は使わない）
     */
    const usedCharacters = await repo.audioSynthesisUsageRepository.sumCharactersSinceFromPrimary(getBillingMonthStart(input.now()))
    if (usedCharacters + claim.lemma.length > input.monthlyCharacterLimit) {
      logger.error(
        "generate-word-audio stopped because the monthly Polly character limit would be exceeded (raise AUDIO_MONTHLY_CHARACTER_LIMIT to continue)",
        undefined,
        { lemma: claim.lemma, monthlyCharacterLimit: input.monthlyCharacterLimit, usedCharacters },
      )
      /**
       * この語と残りの確保を、失敗回数を増やさずに外す（generating は pending に戻り、ready のまま確保した行は前の音声のまま）
       */
      for (const remaining of claims.slice(index)) await repo.wordAudioRepository.releaseClaim(remaining)
      result.isMonthlyLimitReached = true
      break
    }

    let outcome: WordAudioClaimOutcome
    try {
      outcome = await generateOneWordAudio(claim, { now: input.now, voiceId: input.voiceId }, repo, deps)
    } catch (error) {
      /**
       * 資格情報・権限・voice・保存先の誤りは全語で同じく失敗するので、失敗回数を増やさずに戻して止める（他の確保済みの語は 30 分後に回収される）
       */
      await repo.wordAudioRepository.releaseClaim(claim)
      throw error
    }

    const claimResult = await repo.wordAudioRepository.completeClaim(claim, outcome, input.now())
    if (claimResult !== "ready") {
      logger.info("word audio processed", {
        claimedStatus: claim.claimedStatus,
        lemma: claim.lemma,
        result: claimResult,
        ...(outcome.kind === "failed" ? { error: outcome.error } : {}),
      })
    }
    await deletePreviousWordAudio(claim, outcome, claimResult, deps)

    if (claimResult === "failed") result.failedCount++
    if (claimResult === "lost_claim") {
      result.lostClaimCount++
      logger.warn("word audio was reclaimed by another run; the result was discarded", { lemma: claim.lemma })
    }
    if (claimResult === "ready") result.readyCount++
    if (claimResult === "retry_later") result.retryLaterCount++
  }
  return result
}
