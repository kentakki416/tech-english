import type { PassageAudioPart } from "@repo/domain"
import { logger } from "@repo/logger"
import type { Storage } from "@repo/storage"

import { isFatalTtsError, type TtsClient } from "../../client/polly"
import { POLLY_MAX_BILLED_CHARACTERS } from "../../const/audio"
import {
  buildAudioKey,
  buildSpeechText,
  calculateAudioTextHash,
  convertSpeechMarksToWordTimings,
  listReadAloudBlocks,
  listUnusedAudioKeys,
  measureMp3DurationMs,
  splitSpeechText,
} from "../../lib/audio"
import type {
  AudioClaimOutcome,
  AudioClaimResult,
  CalculateTextHash,
  ClaimedAudioTarget,
  PassageAudioRepository,
} from "../../repository"

/**
 * generating のままこの分数を超えた行は、前回の実行が途中で落ちたものとして pending に戻す
 */
const STALE_GENERATING_MINUTES = 30

/**
 * 失敗がこの回数に達したら failed にする（管理者が再試行するまで自動では作り直さない）
 */
const MAX_AUDIO_ATTEMPTS = 3

const MILLIS_PER_MINUTE = 60 * 1000

export type GenerateAudioInput = {
  /**
   * 停止指示を受けたか。各件の頭で見て、true なら残りを処理せずに終える（確保済みの残りは 30 分後に回収される）
   */
  isShuttingDown: () => boolean
  maxPassagesPerRun: number
  now: () => Date
  voiceId: string
}

export type GenerateAudioResult = {
  /**
   * 失敗が上限に達して failed にした件数。retryLaterCount と合わせて 1 件でもあれば task が exit 1 で終える
   */
  failedCount: number
  /**
   * 確保が 30 分を過ぎて別の実行に取り直されていた件数（結果を捨てた）
   */
  lostClaimCount: number
  readyCount: number
  /**
   * 失敗したが上限に達していないので pending に戻した件数（次の実行でやり直す）
   */
  retryLaterCount: number
  /**
   * 生成中に本文が変わったので pending に戻した件数（次の実行で作り直す）
   */
  textChangedCount: number
  unchangedCount: number
}

type GenerateAudioRepo = {
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
 * last_error に残す「種類: メッセージ」
 */
const describeError = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error)
  const kind = error.name === "Error" ? error.constructor.name : error.name
  return `${kind}: ${error.message}`
}

/**
 * 1 件分の音声を作る（トランザクションの外）。ready だった行で本文のハッシュが同じなら作り直さない。
 * 読み上げるブロック → パートの順に、音声合成 → 長さ・単語の時刻 → mp3 の保存をする。
 * 設定の誤り（isFatalTtsError）は throw し、それ以外の失敗は failed の outcome にする
 */
const buildPassageAudio = async (
  target: ClaimedAudioTarget,
  options: { calculateTextHash: CalculateTextHash; voiceId: string },
  deps: GenerateAudioDeps,
): Promise<AudioClaimOutcome> => {
  const textHash = options.calculateTextHash(target.blocks)
  if (target.previous?.status === "ready" && target.previous.textHash === textHash) return { kind: "unchanged", textHash }

  try {
    let billedCharacters = 0
    const blocks: { blockIndex: number; parts: PassageAudioPart[] }[] = []
    for (const block of listReadAloudBlocks(target.blocks)) {
      const speech = buildSpeechText(block.text)
      const parts: PassageAudioPart[] = []
      for (const [partIndex, part] of splitSpeechText(speech.speechText, POLLY_MAX_BILLED_CHARACTERS).entries()) {
        const result = await deps.ttsClient.synthesize({ text: part.text, voiceId: options.voiceId })
        const durationMs = measureMp3DurationMs(result.audio)
        const words = convertSpeechMarksToWordTimings({ durationMs, marks: result.marks, part, speech })
        const key = buildAudioKey({ blockIndex: block.blockIndex, partIndex, passageId: target.passageId, textHash })
        await deps.audioStorage.save(key, result.audio)
        billedCharacters += result.billedCharacters
        parts.push({ durationMs, key, words })
      }
      blocks.push({ blockIndex: block.blockIndex, parts })
    }
    return { billedCharacters, kind: "ready", manifest: { blocks }, textHash, voiceId: options.voiceId }
  } catch (error) {
    if (isFatalTtsError(error)) throw error
    return { error: describeError(error), kind: "failed", maxAttempts: MAX_AUDIO_ATTEMPTS }
  }
}

/**
 * 使わなくなった mp3 を消す。失敗しても warn だけ（残っても実害は無い）
 */
const deleteAudioKeys = async (keys: string[], passageId: number, audioStorage: Storage): Promise<void> => {
  for (const key of keys) {
    try {
      await audioStorage.delete(key)
    } catch (error) {
      logger.warn("failed to delete an unused audio file", { error: describeError(error), key, passageId })
    }
  }
}

/**
 * completeClaim の結果に応じた後始末。ready は前の hash の mp3 を、生成中に本文が変わったときは今回作った mp3 を消す。
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
 * 2. 対象を古い順に generating にしながら取る（短いトランザクション。FOR UPDATE SKIP LOCKED）
 * 3. 1 件ずつ、トランザクションの外で音声を作る。1 件の失敗で他の件は止めない。設定の誤りはその行を pending に戻して throw する
 * 4. 確保した時刻を条件に結果を書き、使わなくなった mp3 を消す
 */
export const generateAudio = async (
  input: GenerateAudioInput,
  repo: GenerateAudioRepo,
  deps: GenerateAudioDeps,
): Promise<GenerateAudioResult> => {
  const result: GenerateAudioResult = {
    failedCount: 0,
    lostClaimCount: 0,
    readyCount: 0,
    retryLaterCount: 0,
    textChangedCount: 0,
    unchangedCount: 0,
  }
  const calculateTextHash: CalculateTextHash = (blocks) => calculateAudioTextHash({ blocks, voiceId: input.voiceId })

  const now = input.now()
  const releasedCount = await repo.passageAudioRepository.releaseStaleGenerating(
    new Date(now.getTime() - STALE_GENERATING_MINUTES * MILLIS_PER_MINUTE),
  )
  if (releasedCount > 0) logger.warn("stale generating audios were released", { releasedCount })

  const targets = await repo.passageAudioRepository.claimTargets({
    calculateTextHash,
    limit: input.maxPassagesPerRun,
    now,
    voiceId: input.voiceId,
  })
  logger.info("audio targets claimed", { count: targets.length, passageIds: targets.map((target) => target.passageId) })

  for (const target of targets) {
    if (input.isShuttingDown()) break
    let outcome: AudioClaimOutcome
    try {
      outcome = await buildPassageAudio(target, { calculateTextHash, voiceId: input.voiceId }, deps)
    } catch (error) {
      /**
       * 資格情報・権限・voice の誤りは全件で同じく失敗するので、失敗回数を増やさずに戻して止める（他の確保済みの行は 30 分後に回収される）
       */
      await repo.passageAudioRepository.releaseClaim(target)
      throw error
    }

    const claimResult = await repo.passageAudioRepository.completeClaim(target, outcome, { calculateTextHash, now: input.now() })
    await cleanUpAudioFiles(target, outcome, claimResult, deps)
    logger.info("passage audio processed", { passageId: target.passageId, result: claimResult, ...summarizeOutcome(outcome) })

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
