import type { PassageAudio, PassageAudioManifest } from "@repo/domain"

export const AUDIO_TEXT_HASH = "3dd12695a4c5039773bbd6cb2e2f0223c3e95233ad3ae35986420cb1656f7565"

/**
 * PASSAGE_BLOCKS（見出し・段落・段落・code・段落）のマニフェスト。code のブロック（3）は含まない。第 2 段落は 2 パート
 */
export const buildAudioManifest = (passageId = 1): PassageAudioManifest => {
  const keyPrefix = `passages/${passageId}/${AUDIO_TEXT_HASH}`
  return {
    blocks: [
      { blockIndex: 0, parts: [{ durationMs: 1200, key: `${keyPrefix}/0-0.mp3`, words: [[0, 600, 0, 13], [600, 1200, 14, 18]] }] },
      { blockIndex: 1, parts: [{ durationMs: 2400, key: `${keyPrefix}/1-0.mp3`, words: [[0, 2400, 0, 7]] }] },
      {
        blockIndex: 2,
        parts: [
          { durationMs: 900, key: `${keyPrefix}/2-0.mp3`, words: [[0, 900, 0, 2]] },
          { durationMs: 700, key: `${keyPrefix}/2-1.mp3`, words: [[0, 700, 30, 36]] },
        ],
      },
      { blockIndex: 4, parts: [{ durationMs: 1500, key: `${keyPrefix}/4-0.mp3`, words: [] }] },
    ],
  }
}

/**
 * 作成済みの音声（問題の公開〈2026-10-12T03:00Z〉の 1 時間後に作った）
 */
export const buildPassageAudio = (overrides: Partial<PassageAudio> = {}): PassageAudio => ({
  id: 601,
  attemptCount: 0,
  billedCharacters: 4800,
  generatedAt: new Date("2026-10-12T04:00:00.000Z"),
  generationStartedAt: null,
  lastError: null,
  manifest: buildAudioManifest(),
  passageId: 1,
  regenerateRequestedAt: null,
  status: "ready",
  textHash: AUDIO_TEXT_HASH,
  voiceId: "Joanna",
  createdAt: new Date("2026-10-12T04:00:00.000Z"),
  updatedAt: new Date("2026-10-12T04:00:00.000Z"),
  ...overrides,
})
