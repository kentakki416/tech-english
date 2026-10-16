import type { PassageAudioPart } from "@repo/domain"
import { logger } from "@repo/logger"
import type { Storage } from "@repo/storage"

import type { TtsClient } from "../../client/polly"
import { MAX_AUDIO_ATTEMPTS, POLLY_MAX_BILLED_CHARACTERS, STALE_CLAIM_MINUTES } from "../../const/audio"
import {
  buildAudioKey,
  buildSpeechText,
  calculateAudioTextHash,
  convertSpeechMarksToWordTimings,
  describeAudioError,
  estimateBilledCharacters,
  getBillingMonthStart,
  isFatalAudioGenerationError,
  listReadAloudBlocks,
  listUnusedAudioKeys,
  measureMp3DurationMs,
  splitSpeechText,
} from "../../lib/audio"
import type {
  AudioClaimOutcome,
  AudioClaimResult,
  AudioSynthesisUsageRepository,
  CalculateTextHash,
  ClaimedAudioTarget,
  PassageAudioRepository,
} from "../../repository"

const MILLIS_PER_MINUTE = 60 * 1000

export type GenerateAudioInput = {
  maxPassagesPerRun: number
  /**
   * 今月（UTC の暦月）に Polly で課金してよい文字数（AUDIO_MONTHLY_CHARACTER_LIMIT）
   */
  monthlyCharacterLimit: number
  now: () => Date
  /**
   * passage_audios.voice_id と text_hash に入れる voice（buildAudioVoiceId の値。fake は `fake:<voice>`）。音声合成にもそのまま渡す（FakeTtsClient は voice を見ない）
   */
  voiceId: string
}

export type GenerateAudioResult = {
  /**
   * 失敗が上限に達した件数（generating で確保した行は failed にし、ready のまま確保した行は前の音声のまま）。retryLaterCount と合わせて 1 件でもあれば task が exit 1 で終える
   */
  failedCount: number
  /**
   * 月の上限（monthlyCharacterLimit）に達して止めたか。true なら task が exit 1 で終える
   */
  isMonthlyLimitReached: boolean
  /**
   * 確保が 30 分を過ぎて別の実行に取り直されていた件数（結果を捨てた）
   */
  lostClaimCount: number
  /**
   * 却下された問題の音声（mp3 と行）を消した件数
   */
  purgedCount: number
  readyCount: number
  /**
   * 失敗したが上限に達していないので次の実行に回した件数
   */
  retryLaterCount: number
  /**
   * 生成中に本文が変わったので pending に戻した件数（次の実行で作り直す）
   */
  textChangedCount: number
  unchangedCount: number
}

type GenerateAudioRepo = {
  audioSynthesisUsageRepository: AudioSynthesisUsageRepository
  passageAudioRepository: PassageAudioRepository
}

type GenerateAudioDeps = {
  /**
   * mp3 の保存先（本番は S3、ローカルは .storage/audio/）。save の戻り値の URL は使わない（マニフェストにはキーだけを保存する）
   */
  audioStorage: Storage
  ttsClient: TtsClient
}

/**
 * 1 件の処理の方針。unchanged は Polly を呼ばない。generate は Polly で作る（estimatedCharacters は月の上限の判定に使う見込みの課金文字数）
 */
type AudioPlan =
  | { kind: "unchanged"; textHash: string }
  | { estimatedCharacters: number; keyRevision: number | undefined; kind: "generate"; textHash: string }

/**
 * 1 件の処理の方針を決める。前の成功のマニフェストがあり、その本文のハッシュ（voice と AUDIO_TEXT_VERSION を含む）が今と同じで、
 * 作り直しの依頼も無ければ、行の状態を問わず作り直さない（admin の再試行・手動の UPDATE などで pending に戻された ready の行でも Polly を呼ばない）。
 * manifest がある行の text_hash はその manifest のもので、その mp3 は別の生成が成功して置き換わるまで消さないので、そのまま使える。
 * 作り直しの依頼で hash が同じときは、保存キーに確保の時刻を入れて前の mp3 と別のキーにする（CDN の長期キャッシュに前の音声が残らないように）
 */
const planPassageAudio = (target: ClaimedAudioTarget, calculateTextHash: CalculateTextHash): AudioPlan => {
  const textHash = calculateTextHash(target.blocks)
  const hasSameText = target.previous !== null && target.previous.manifest !== null && target.previous.textHash === textHash
  if (hasSameText && !target.isRegenerationRequested) return { kind: "unchanged", textHash }
  return {
    estimatedCharacters: estimateBilledCharacters(target.blocks),
    keyRevision: hasSameText ? target.generationStartedAt.getTime() : undefined,
    kind: "generate",
    textHash,
  }
}

/**
 * 1 件分の音声を作る（トランザクションの外）。読み上げるブロック → パートの順に、音声合成 → 長さ・単語の時刻 → mp3 の保存をする。
 * 課金された文字数は Polly のリクエストごとに audio_synthesis_usages に記録する（失敗した問題の分も数える）。
 * 設定の誤り（isFatalAudioGenerationError。Polly の資格情報・権限・voice、保存先の権限・bucket など）は throw し、それ以外の失敗は failed の outcome にする
 */
const generatePassageAudio = async (
  target: ClaimedAudioTarget,
  plan: Extract<AudioPlan, { kind: "generate" }>,
  options: { now: () => Date; voiceId: string },
  repo: GenerateAudioRepo,
  deps: GenerateAudioDeps,
): Promise<AudioClaimOutcome> => {
  const recordBilledCharacters = async (characters: number): Promise<void> => {
    /**
     * CHECK 制約（characters > 0）に合わせ、課金の無い応答（RequestCharacters が無い）は記録しない
     */
    if (characters <= 0) return
    await repo.audioSynthesisUsageRepository.record({ characters, now: options.now(), target: { passageId: target.passageId } })
  }

  try {
    let billedCharacters = 0
    const blocks: { blockIndex: number; parts: PassageAudioPart[] }[] = []
    for (const block of listReadAloudBlocks(target.blocks)) {
      const speech = buildSpeechText(block.text)
      const parts: PassageAudioPart[] = []
      for (const [partIndex, part] of splitSpeechText(speech.speechText, POLLY_MAX_BILLED_CHARACTERS).entries()) {
        const result = await deps.ttsClient.synthesize({ recordBilledCharacters, text: part.text, voiceId: options.voiceId })
        const durationMs = measureMp3DurationMs(result.audio)
        const words = convertSpeechMarksToWordTimings({ durationMs, marks: result.marks, part, speech })
        const key = buildAudioKey({
          blockIndex: block.blockIndex,
          partIndex,
          passageId: target.passageId,
          revision: plan.keyRevision,
          textHash: plan.textHash,
        })
        await deps.audioStorage.save(key, result.audio)
        billedCharacters += result.billedCharacters
        parts.push({ durationMs, key, words })
      }
      blocks.push({ blockIndex: block.blockIndex, parts })
    }
    return { billedCharacters, kind: "ready", manifest: { blocks }, textHash: plan.textHash, voiceId: options.voiceId }
  } catch (error) {
    if (isFatalAudioGenerationError(error)) throw error
    return { error: describeAudioError(error), kind: "failed", maxAttempts: MAX_AUDIO_ATTEMPTS }
  }
}

/**
 * 保存先の mp3 を消す。保存先の設定の誤り（isFatalAudioGenerationError。権限・bucket など）は throw して実行を止める
 * （以降の問題でも同じく消せず、mp3 が残り続けるのに気づけないため）。それ以外の失敗は warn を出して false を返す
 */
const deleteAudioKeys = async (keys: string[], passageId: number, audioStorage: Storage): Promise<boolean> => {
  let isAllDeleted = true
  for (const key of keys) {
    try {
      await audioStorage.delete(key)
    } catch (error) {
      if (isFatalAudioGenerationError(error)) {
        logger.error("failed to delete an audio file because of a storage configuration error", error, { key, passageId })
        throw error
      }
      logger.warn("failed to delete an audio file", { error: describeAudioError(error), key, passageId })
      isAllDeleted = false
    }
  }
  return isAllDeleted
}

/**
 * completeClaim の結果に応じた後始末。ready は前の mp3 を、生成中に本文が変わったときは今回作った mp3 を消す（残っても実害は無いので失敗は warn だけ）。
 * lost_claim は何も消さない（取り直した実行が同じキーに書いているかもしれないため）
 */
const cleanUpAudioFiles = async (
  target: ClaimedAudioTarget,
  outcome: AudioClaimOutcome,
  result: AudioClaimResult,
  deps: GenerateAudioDeps,
): Promise<void> => {
  if (outcome.kind !== "ready") return
  const previousManifest = target.previous?.manifest ?? null
  if (result === "ready") {
    await deleteAudioKeys(listUnusedAudioKeys(previousManifest, outcome.manifest), target.passageId, deps.audioStorage)
  }
  if (result === "text_changed") {
    await deleteAudioKeys(listUnusedAudioKeys(outcome.manifest, previousManifest), target.passageId, deps.audioStorage)
  }
}

/**
 * 却下（rejected）された問題の音声を消す（ライセンスなどで取り下げた問題の mp3 を残さないため）。mp3 をすべて消せたら行を消す。
 * 消せなかった mp3 があれば行を残し、次の実行でやり直す（行のマニフェストが残りのキーを指すため）。非公開（draft）の問題は、
 * 再公開で同じ本文なら作り直さずに使うので消さない。確保中（generation_started_at が staleBefore 以降）の行は、確保が終わってから消す
 */
const purgeRejectedAudios = async (staleBefore: Date, repo: GenerateAudioRepo, deps: GenerateAudioDeps): Promise<number> => {
  let purgedCount = 0
  for (const audio of await repo.passageAudioRepository.findRejected(staleBefore)) {
    const keys = listUnusedAudioKeys(audio.manifest, null)
    if (!await deleteAudioKeys(keys, audio.passageId, deps.audioStorage)) continue
    await repo.passageAudioRepository.deleteByPassageId(audio.passageId)
    logger.info("audio of a rejected passage was deleted", { keyCount: keys.length, passageId: audio.passageId })
    purgedCount++
  }
  return purgedCount
}

/**
 * 今月の課金文字数にこの問題の見込みを足すと上限を超えるか
 */
const isOverMonthlyLimit = async (
  plan: Extract<AudioPlan, { kind: "generate" }>,
  input: GenerateAudioInput,
  repo: GenerateAudioRepo,
): Promise<{ isOver: boolean; usedCharacters: number }> => {
  const usedCharacters = await repo.audioSynthesisUsageRepository.sumCharactersSinceFromPrimary(getBillingMonthStart(input.now()))
  return { isOver: usedCharacters + plan.estimatedCharacters > input.monthlyCharacterLimit, usedCharacters }
}

/**
 * ログに出すパート数・課金文字数
 */
const summarizeOutcome = (outcome: AudioClaimOutcome) => {
  if (outcome.kind === "ready") {
    return {
      billedCharacters: outcome.billedCharacters,
      partCount: outcome.manifest.blocks.reduce((total, block) => total + block.parts.length, 0),
    }
  }
  if (outcome.kind === "failed") return { error: outcome.error }
  return {}
}

/**
 * generate:audio の本体。公開済みの問題の読み上げの音声を作る。
 *
 * 1. generating のまま 30 分以上たった行を pending に戻す
 * 2. 却下された問題の音声（mp3 と行）を消す
 * 3. 対象を古い順に確保する（短いトランザクション。FOR UPDATE SKIP LOCKED）。voice の変更・作り直しの依頼の ready の行は ready のまま確保する
 * 4. 1 件ずつ、トランザクションの外で音声を作る。作る前に今月の課金文字数 + 見込みが月の上限を超えるなら、残りの確保を外して止める。
 *    1 件の失敗で他の件は止めない。設定の誤り（音声合成・保存先）はその行の確保を外して throw する
 * 5. 確保した時刻を条件に結果を書き、使わなくなった mp3 を消す。削除で保存先の設定の誤りが起きたら throw する（結果は書き終えているので行は戻さない）
 */
export const generateAudio = async (
  input: GenerateAudioInput,
  repo: GenerateAudioRepo,
  deps: GenerateAudioDeps,
): Promise<GenerateAudioResult> => {
  const result: GenerateAudioResult = {
    failedCount: 0,
    isMonthlyLimitReached: false,
    lostClaimCount: 0,
    purgedCount: 0,
    readyCount: 0,
    retryLaterCount: 0,
    textChangedCount: 0,
    unchangedCount: 0,
  }
  const calculateTextHash: CalculateTextHash = (blocks) => calculateAudioTextHash({ blocks, voiceId: input.voiceId })

  const now = input.now()
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MINUTES * MILLIS_PER_MINUTE)
  const releasedCount = await repo.passageAudioRepository.releaseStaleGenerating(staleBefore)
  if (releasedCount > 0) logger.warn("stale generating audios were released", { releasedCount })

  result.purgedCount = await purgeRejectedAudios(staleBefore, repo, deps)

  const targets = await repo.passageAudioRepository.claimTargets({
    calculateTextHash,
    limit: input.maxPassagesPerRun,
    maxAttempts: MAX_AUDIO_ATTEMPTS,
    now,
    staleBefore,
    voiceId: input.voiceId,
  })
  logger.info("audio targets claimed", {
    count: targets.length,
    targets: targets.map((target) => ({ claimedStatus: target.claimedStatus, passageId: target.passageId })),
  })

  for (const [index, target] of targets.entries()) {
    const plan = planPassageAudio(target, calculateTextHash)
    let outcome: AudioClaimOutcome
    if (plan.kind === "unchanged") {
      outcome = { kind: "unchanged", textHash: plan.textHash }
    } else {
      const usage = await isOverMonthlyLimit(plan, input, repo)
      if (usage.isOver) {
        logger.error(
          "generate-audio stopped because the monthly Polly character limit would be exceeded (raise AUDIO_MONTHLY_CHARACTER_LIMIT to continue)",
          undefined,
          {
            estimatedCharacters: plan.estimatedCharacters,
            monthlyCharacterLimit: input.monthlyCharacterLimit,
            passageId: target.passageId,
            usedCharacters: usage.usedCharacters,
          },
        )
        /**
         * この問題と残りの確保を、失敗回数を増やさずに外す（generating は pending に戻り、ready のまま確保した行は前の音声のまま）
         */
        for (const remaining of targets.slice(index)) await repo.passageAudioRepository.releaseClaim(remaining)
        result.isMonthlyLimitReached = true
        break
      }
      try {
        outcome = await generatePassageAudio(target, plan, { now: input.now, voiceId: input.voiceId }, repo, deps)
      } catch (error) {
        /**
         * 資格情報・権限・voice・保存先の誤りは全件で同じく失敗するので、失敗回数を増やさずに戻して止める（他の確保済みの行は 30 分後に回収される）
         */
        await repo.passageAudioRepository.releaseClaim(target)
        throw error
      }
    }

    const claimResult = await repo.passageAudioRepository.completeClaim(target, outcome, { calculateTextHash, now: input.now() })
    logger.info("passage audio processed", {
      claimedStatus: target.claimedStatus,
      passageId: target.passageId,
      result: claimResult,
      ...summarizeOutcome(outcome),
    })
    /**
     * 削除で保存先の設定の誤りが起きたら throw して止める。この行の結果は書き終えているので戻さない（他の確保済みの行は 30 分後に回収される）
     */
    await cleanUpAudioFiles(target, outcome, claimResult, deps)

    if (claimResult === "failed") result.failedCount++
    if (claimResult === "lost_claim") {
      result.lostClaimCount++
      logger.warn("passage audio was reclaimed by another run; the result was discarded", { passageId: target.passageId })
    }
    if (claimResult === "ready") result.readyCount++
    if (claimResult === "retry_later") result.retryLaterCount++
    if (claimResult === "text_changed") result.textChangedCount++
    if (claimResult === "unchanged") result.unchangedCount++
  }
  return result
}
