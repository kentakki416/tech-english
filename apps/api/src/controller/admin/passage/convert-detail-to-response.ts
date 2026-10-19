import type { AdminPassageDetailResponse, AdminPassageListItemResponse, UpdateAdminPassageRequest } from "@repo/api-schema"
import {
  calculateQuestionCount,
  PASSAGE_DIFFICULTIES,
  READING_WPM_BY_DIFFICULTY,
  SECONDS_PER_QUESTION,
  TIME_LIMIT_ROUNDING_SECONDS,
} from "@repo/domain"

import type { AdminPassageEditInput } from "../../../lib/admin-passage-edit"
import { resolveAudioStatus } from "../../../lib/passage-audio"
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
 * 読み上げの音声の状態。音声の行があるか公開中なら返し（公開中で行がまだ無ければ pending）、それ以外（下書きなどで行も無い）は null。
 * generating はそのまま返す。非公開に戻した問題の ready は、本文を直したかもしれないので pending にする（resolveAudioStatus。再公開すると生成タスクが確かめる）
 */
const convertAudioToResponse = ({ audio, passage }: AdminPassageDetail): AdminPassageDetailResponse["audio"] => {
  if (!audio && passage.status !== "published") return null
  return {
    generated_at: audio?.generatedAt?.toISOString() ?? null,
    last_error: audio?.lastError ?? null,
    regenerate_requested_at: audio?.regenerateRequestedAt?.toISOString() ?? null,
    status: resolveAudioStatus(audio, passage),
  }
}

/**
 * 問題の全情報（詳細と保存のレスポンス。ドメイン → snake_case、日時は ISO 8601）
 */
export const convertAdminPassageDetailToResponse = (detail: AdminPassageDetail): AdminPassageDetailResponse => {
  const { passage } = detail
  return {
    id: passage.id,
    attempt_count: detail.attemptCount,
    attention_reasons: passage.attentionReasons,
    audio: convertAudioToResponse(detail),
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
      choices_ja: question.choicesJa,
      correct_choice_index: question.correctChoiceIndex,
      evidence: { block_index: question.evidenceBlockIndex, quote: question.evidenceQuote },
      explanation_ja: question.explanationJa,
      order_index: question.orderIndex,
      prompt: question.prompt,
      prompt_ja: question.promptJa,
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
    choicesJa: question.choices_ja,
    correctChoiceIndex: question.correct_choice_index,
    evidenceBlockIndex: question.evidence.block_index,
    evidenceQuote: question.evidence.quote,
    explanationJa: question.explanation_ja,
    prompt: question.prompt,
    promptJa: question.prompt_ja,
    targetGlossaryIndex: question.target_glossary_index,
    type: question.type,
  })),
  timeLimitSeconds: request.time_limit_seconds,
  title: request.title,
})
