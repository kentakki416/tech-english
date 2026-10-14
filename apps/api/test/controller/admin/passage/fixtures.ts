import type { AdminPassageDetailResponse, UpdateAdminPassageRequest } from "@repo/api-schema"

/**
 * admin の問題 API のインテグレーションテストで共有する変換。DB への投入は test/fixture/passage.ts を使う
 */

/**
 * 詳細のレスポンスを、そのまま保存し直す PUT のボディにする（対象の語句は glossary の index で指す）
 */
export const convertDetailResponseToUpdateBody = (detail: AdminPassageDetailResponse): UpdateAdminPassageRequest => ({
  blocks: detail.blocks.map((block) => ({ text: block.text, translation_ja: block.translation_ja })),
  difficulty: detail.difficulty ?? 2,
  glossary: detail.glossary.map((entry) => ({
    id: entry.id,
    block_index: entry.block_index,
    lemma: entry.lemma,
    meaning_ja: entry.meaning_ja,
    note_ja: entry.note_ja,
    part_of_speech: entry.part_of_speech,
    surface: entry.surface,
  })),
  questions: detail.questions.map((question) => ({
    id: question.id,
    choices: question.choices,
    correct_choice_index: question.correct_choice_index,
    evidence: question.evidence,
    explanation_ja: question.explanation_ja,
    prompt: question.prompt,
    target_glossary_index: question.target_glossary_entry_id === null
      ? null
      : detail.glossary.findIndex((entry) => entry.id === question.target_glossary_entry_id),
    type: question.type,
  })),
  time_limit_seconds: detail.time_limit_seconds ?? 180,
  title: detail.title,
})
