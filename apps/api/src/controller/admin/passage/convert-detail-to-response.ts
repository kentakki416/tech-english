import type { AdminPassageDetailResponse, AdminPassageListItemResponse, UpdateAdminPassageRequest } from "@repo/api-schema"
import {
  calculateQuestionCount,
  PASSAGE_DIFFICULTIES,
  READING_WPM_BY_DIFFICULTY,
  SECONDS_PER_QUESTION,
  TIME_LIMIT_ROUNDING_SECONDS,
} from "@repo/domain"

import type { AdminPassageEditInput } from "../../../lib/admin-passage-edit"
import type { AdminPassageDetail, AdminPassageListItem } from "../../../repository"

/**
 * 「計算式で再計算」に使う定数（admin は @repo/domain を import できないため API から渡す）
 */
const TIME_LIMIT_FORMULA: AdminPassageDetailResponse["time_limit_formula"] = {
  rounding_seconds: TIME_LIMIT_ROUNDING_SECONDS,
  seconds_per_question: SECONDS_PER_QUESTION,
  wpm_by_difficulty: PASSAGE_DIFFICULTIES.map((difficulty) => ({ difficulty, wpm: READING_WPM_BY_DIFFICULTY[difficulty] })),
}

/**
 * 一覧の 1 行（ドメイン → snake_case、日時は ISO 8601）
 */
export const convertAdminPassageListItemToResponse = (item: AdminPassageListItem): AdminPassageListItemResponse => ({
  id: item.passage.id,
  attempt_count: item.attemptCount,
  attention_reasons: item.passage.attentionReasons,
  difficulty: item.passage.difficulty,
  generation_error: item.passage.generationError,
  needs_attention: item.passage.needsAttention,
  question_count: item.questionCount,
  reject_reason: item.passage.rejectReason,
  source: item.source,
  status: item.passage.status,
  title: item.passage.title,
  word_count: item.passage.wordCount,
  updated_at: item.passage.updatedAt.toISOString(),
})

/**
 * 問題の全情報（詳細と保存のレスポンス。ドメイン → snake_case、日時は ISO 8601）
 */
export const convertAdminPassageDetailToResponse = (detail: AdminPassageDetail): AdminPassageDetailResponse => {
  const { passage } = detail
  return {
    id: passage.id,
    attempt_count: detail.attemptCount,
    attention_reasons: passage.attentionReasons,
    blocks: passage.blocks.map((block) => ({
      lang: block.lang ?? null,
      text: block.text,
      translation_ja: block.translationJa ?? null,
      type: block.type,
    })),
    difficulty: passage.difficulty,
    generated_at: passage.generatedAt?.toISOString() ?? null,
    generation_error: passage.generationError,
    generation_model: passage.generationModel,
    generation_prompt_version: passage.generationPromptVersion,
    glossary: detail.glossary.map((entry) => ({
      id: entry.id,
      block_index: entry.blockIndex,
      end_offset: entry.endOffset,
      lemma: entry.lemma,
      meaning_ja: entry.meaningJa,
      note_ja: entry.noteJa,
      part_of_speech: entry.partOfSpeech,
      start_offset: entry.startOffset,
      surface: entry.surface,
    })),
    needs_attention: passage.needsAttention,
    published_at: passage.publishedAt?.toISOString() ?? null,
    question_count: detail.questions.length,
    questions: detail.questions.map((question) => ({
      id: question.id,
      choices: question.choices,
      correct_choice_index: question.correctChoiceIndex,
      evidence: { block_index: question.evidenceBlockIndex, quote: question.evidenceQuote },
      explanation_ja: question.explanationJa,
      order_index: question.orderIndex,
      prompt: question.prompt,
      target_glossary_entry_id: question.targetGlossaryEntryId,
      type: question.type,
      verification_choice_index: question.verificationChoiceIndex,
    })),
    recommended_question_count: calculateQuestionCount(passage.wordCount),
    reject_reason: passage.rejectReason,
    reviewed_at: passage.reviewedAt?.toISOString() ?? null,
    source: {
      id: detail.source.id,
      commit_sha: passage.sourceCommitSha,
      name: detail.source.name,
      path: passage.sourcePath,
      retrieved_at: passage.sourceRetrievedAt.toISOString(),
    },
    status: passage.status,
    time_limit_formula: TIME_LIMIT_FORMULA,
    time_limit_seconds: passage.timeLimitSeconds,
    title: passage.title,
    word_count: passage.wordCount,
    updated_at: passage.updatedAt.toISOString(),
  }
}

/**
 * 保存のリクエスト（snake_case）→ service の入力（camelCase）
 */
export const convertUpdateAdminPassageRequestToInput = (request: UpdateAdminPassageRequest): AdminPassageEditInput => ({
  blocks: request.blocks.map((block) => ({ text: block.text, translationJa: block.translation_ja })),
  difficulty: request.difficulty,
  glossary: request.glossary.map((entry) => ({
    id: entry.id,
    blockIndex: entry.block_index,
    lemma: entry.lemma,
    meaningJa: entry.meaning_ja,
    noteJa: entry.note_ja,
    partOfSpeech: entry.part_of_speech,
    surface: entry.surface,
  })),
  questions: request.questions.map((question) => ({
    id: question.id,
    choices: question.choices,
    correctChoiceIndex: question.correct_choice_index,
    evidenceBlockIndex: question.evidence.block_index,
    evidenceQuote: question.evidence.quote,
    explanationJa: question.explanation_ja,
    prompt: question.prompt,
    targetGlossaryIndex: question.target_glossary_index,
    type: question.type,
  })),
  timeLimitSeconds: request.time_limit_seconds,
  title: request.title,
})
