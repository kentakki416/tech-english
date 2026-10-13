import type {
  AttemptPassage,
  ExpiredAttempt,
  InProgressAttempt,
  PassageAttributionResponse,
  PassageSegmentResponse,
} from "@repo/api-schema"

import type { PassageAttribution } from "../../lib/build-attribution"
import type { PassageSegment } from "../../lib/segment-passage"
import type { AttemptPassageView, ExpiredAttemptView, InProgressAttemptView } from "../../service/attempt-service"

/**
 * 挑戦の domain の形 → API の snake_case の形。開始・取得・提出（reading-practice step4）で共有する
 */

const convertAttributionToResponse = (attribution: PassageAttribution): PassageAttributionResponse => ({
  commit_sha: attribution.commitSha,
  license_spdx: attribution.licenseSpdx,
  license_url: attribution.licenseUrl,
  page_url: attribution.pageUrl,
  permalink_url: attribution.permalinkUrl,
  retrieved_at: attribution.retrievedAt.toISOString(),
  source_kind: attribution.sourceKind,
  source_name: attribution.sourceName,
})

const convertAttemptPassageToResponse = (passage: AttemptPassageView): AttemptPassage => ({
  id: passage.id,
  difficulty: passage.difficulty,
  title: passage.title,
  word_count: passage.wordCount,
})

/**
 * glossary_entry_id は用語集の語句のときだけ付ける（キーごと省く）
 */
const convertSegmentToResponse = (segment: PassageSegment): PassageSegmentResponse =>
  segment.glossaryEntryId === undefined
    ? { kind: segment.kind, text: segment.text }
    : { glossary_entry_id: segment.glossaryEntryId, kind: segment.kind, text: segment.text }

/**
 * 解答中の挑戦。設問は正解・解説・根拠を持たない形のまま、出してよい列だけを詰め替える
 */
export const convertInProgressAttemptToResponse = (view: InProgressAttemptView): InProgressAttempt => ({
  id: view.id,
  attribution: convertAttributionToResponse(view.attribution),
  blocks: view.blocks.map((block) => ({
    lang: block.lang,
    paragraph_number: block.paragraphNumber,
    segments: block.segments.map(convertSegmentToResponse),
    text: block.text,
    translation_ja: block.translationJa,
    type: block.type,
  })),
  expires_at: view.expiresAt.toISOString(),
  glossary: view.glossary.map((entry) => ({
    id: entry.id,
    lemma: entry.lemma,
    meaning_ja: entry.meaningJa,
    note_ja: entry.noteJa,
    part_of_speech: entry.partOfSpeech,
    surface: entry.surface,
  })),
  passage: convertAttemptPassageToResponse(view.passage),
  questions: view.questions.map((question) => ({
    id: question.id,
    choices: question.choices,
    order_index: question.orderIndex,
    prompt: question.prompt,
    type: question.type,
  })),
  server_now: view.serverNow.toISOString(),
  started_at: view.startedAt.toISOString(),
  status: view.status,
  time_limit_seconds: view.timeLimitSeconds,
})

/**
 * 期限切れの挑戦
 */
export const convertExpiredAttemptToResponse = (view: ExpiredAttemptView): ExpiredAttempt => ({
  id: view.id,
  passage: convertAttemptPassageToResponse(view.passage),
  started_at: view.startedAt.toISOString(),
  status: view.status,
})
