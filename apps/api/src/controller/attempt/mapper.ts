import type {
  AttemptBlock,
  AttemptGlossaryEntry,
  AttemptPassage,
  AttemptQuestion,
  ExpiredAttempt,
  InProgressAttempt,
  PassageSegmentResponse,
  SubmittedAttempt,
} from "@repo/api-schema"

import type { PassageSegment } from "../../lib/segment-passage"
import type {
  AttemptBlockView,
  AttemptGlossaryEntryView,
  AttemptPassageView,
  AttemptQuestionView,
  ExpiredAttemptView,
  InProgressAttemptView,
  SubmittedAttemptView,
} from "../../service/attempt-service"
import { convertAttributionToResponse } from "../passage/mapper"

/**
 * 挑戦の domain の形 → API の snake_case の形。開始・取得・提出（reading-practice step4）で共有する
 */

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

const convertBlockToResponse = (block: AttemptBlockView): AttemptBlock => ({
  lang: block.lang,
  paragraph_number: block.paragraphNumber,
  segments: block.segments.map(convertSegmentToResponse),
  text: block.text,
  translation_ja: block.translationJa,
  type: block.type,
})

const convertGlossaryEntryToResponse = (entry: AttemptGlossaryEntryView): AttemptGlossaryEntry => ({
  id: entry.id,
  lemma: entry.lemma,
  meaning_ja: entry.meaningJa,
  note_ja: entry.noteJa,
  part_of_speech: entry.partOfSpeech,
  surface: entry.surface,
})

/**
 * 設問の、解答中にも出してよい列だけを詰め替える（正解・解説・根拠を持たない）
 */
const convertQuestionToResponse = (question: AttemptQuestionView): AttemptQuestion => ({
  id: question.id,
  choices: question.choices,
  order_index: question.orderIndex,
  prompt: question.prompt,
  type: question.type,
})

/**
 * 解答中の挑戦
 */
export const convertInProgressAttemptToResponse = (view: InProgressAttemptView): InProgressAttempt => ({
  id: view.id,
  attribution: convertAttributionToResponse(view.attribution),
  blocks: view.blocks.map(convertBlockToResponse),
  expires_at: view.expiresAt.toISOString(),
  glossary: view.glossary.map(convertGlossaryEntryToResponse),
  passage: convertAttemptPassageToResponse(view.passage),
  questions: view.questions.map(convertQuestionToResponse),
  server_now: view.serverNow.toISOString(),
  started_at: view.startedAt.toISOString(),
  status: view.status,
  time_limit_seconds: view.timeLimitSeconds,
})

/**
 * 提出済みの挑戦（結果の形）。提出 API と、提出済みの挑戦の取得で共有する
 */
export const convertSubmittedAttemptToResponse = (view: SubmittedAttemptView): SubmittedAttempt => ({
  id: view.id,
  attribution: convertAttributionToResponse(view.attribution),
  blocks: view.blocks.map(convertBlockToResponse),
  correct_count: view.correctCount,
  elapsed_seconds: view.elapsedSeconds,
  glossary: view.glossary.map(convertGlossaryEntryToResponse),
  is_overtime: view.isOvertime,
  passage: convertAttemptPassageToResponse(view.passage),
  question_count: view.questionCount,
  questions: view.questions.map((question) => ({
    ...convertQuestionToResponse(question),
    correct_choice_index: question.correctChoiceIndex,
    evidence: question.evidence === null
      ? null
      : {
        block_index: question.evidence.blockIndex,
        quote: question.evidence.quote,
        segment_end: question.evidence.segmentEnd,
        segment_start: question.evidence.segmentStart,
      },
    explanation_ja: question.explanationJa,
    is_answer_key_changed: question.isAnswerKeyChanged,
    is_correct: question.isCorrect,
    selected_choice_index: question.selectedChoiceIndex,
  })),
  started_at: view.startedAt.toISOString(),
  status: view.status,
  study_date: view.studyDate,
  submitted_at: view.submittedAt.toISOString(),
  time_limit_seconds: view.timeLimitSeconds,
  translated_block_count: view.translatedBlockCount,
  word_lookup_count: view.wordLookupCount,
  word_lookups: view.wordLookups.map((lookup) => ({
    lemma: lookup.lemma,
    meaning_ja: lookup.meaningJa,
    source: lookup.source,
    surface: lookup.surface,
  })),
  words_per_minute: view.wordsPerMinute,
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
