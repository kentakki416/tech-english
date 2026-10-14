import { DrizzleClient, type SQL, sql } from "@repo/db"
import { type PassageBlock, VOCABULARY_MASTERED_STAGE } from "@repo/domain"

import type { DueVocabularyCard, VocabularyCounts, VocabularyEncounter, VocabularyRepository } from "../vocabulary-repository"

/**
 * encounters に passages と用語集の行を join した 1 行（列名は SQL の snake_case のまま）
 */
type EncounterRow = {
  dictionary_meaning_ja: string | null
  glossary_block_index: number | null
  glossary_end_offset: number | null
  glossary_id: number | null
  glossary_meaning_ja: string | null
  glossary_note_ja: string | null
  glossary_part_of_speech: string | null
  glossary_start_offset: number | null
  glossary_surface: string | null
  lemma: string
  passage_blocks: PassageBlock[] | null
  passage_id: number
  passage_title: string
  surface: string
}

type DueCardRow = EncounterRow & { card_due_date: string | null; card_id: number; card_stage: number }

type SummaryRow = {
  due_count: number
  learning_count: number
  mastered_count: number
  new_count: number
  next_due_date: string | null
}

/**
 * 用語集の列は glossary_id が NULL でなければすべてある（LEFT JOIN の行があるとき）
 */
const requireGlossaryValue = <T>(value: T | null, column: string, lemma: string): T => {
  if (value === null) throw new Error(`Glossary row has null ${column}: lemma=${lemma}`)
  return value
}

const convertEncounterRowToDomain = (row: EncounterRow): VocabularyEncounter => ({
  dictionaryMeaningJa: row.dictionary_meaning_ja,
  glossary: row.glossary_id === null
    ? null
    : {
      blockIndex: requireGlossaryValue(row.glossary_block_index, "block_index", row.lemma),
      endOffset: requireGlossaryValue(row.glossary_end_offset, "end_offset", row.lemma),
      id: row.glossary_id,
      meaningJa: requireGlossaryValue(row.glossary_meaning_ja, "meaning_ja", row.lemma),
      noteJa: row.glossary_note_ja,
      partOfSpeech: row.glossary_part_of_speech,
      startOffset: requireGlossaryValue(row.glossary_start_offset, "start_offset", row.lemma),
      surface: requireGlossaryValue(row.glossary_surface, "surface", row.lemma),
    },
  lemma: row.lemma,
  passage: { blocks: row.passage_blocks, id: row.passage_id, title: row.passage_title },
  surface: row.surface,
})

/**
 * Drizzle 実装の VocabularyRepository。候補の集め方が DISTINCT ON と UNION ALL を重ねる形なので、クエリビルダではなく sql で書く。
 * 日付は ::text、件数は ::int で受け取る（execute の結果はドライバの既定の変換を通るため、date が Date に、count が文字列になるのを避ける）
 */
export class DrizzleVocabularyRepository implements VocabularyRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findDueCards(userId: number, today: string, limit: number): Promise<DueVocabularyCard[]> {
    const result = await this._db.execute<DueCardRow>(sql`
      ${this._buildEncountersCte(userId)}
      SELECT c.id AS card_id, c.stage AS card_stage, c.due_date::text AS card_due_date, ${this._selectEncounterColumns()}
        FROM vocabulary_cards c
        JOIN encounters e ON e.lemma = c.lemma
        JOIN passages p ON p.id = e.passage_id
        LEFT JOIN passage_glossary_entries g ON g.id = e.usable_glossary_id
       WHERE c.user_id = ${userId} AND c.due_date <= ${today}
       ORDER BY c.due_date, c.id
       LIMIT ${limit}
    `)
    return result.rows.map((row) => ({
      card: { dueDate: row.card_due_date, id: row.card_id, lemma: row.lemma, stage: row.card_stage },
      encounter: convertEncounterRowToDomain(row),
    }))
  }

  public async findNewEncounters(userId: number, limit: number): Promise<VocabularyEncounter[]> {
    const result = await this._db.execute<EncounterRow>(sql`
      ${this._buildEncountersCte(userId)}
      SELECT ${this._selectEncounterColumns()}
        FROM encounters e
        JOIN passages p ON p.id = e.passage_id
        LEFT JOIN passage_glossary_entries g ON g.id = e.usable_glossary_id
       WHERE NOT EXISTS (SELECT 1 FROM vocabulary_cards c WHERE c.user_id = ${userId} AND c.lemma = e.lemma)
       ORDER BY e.origin_rank, e.encountered_at DESC, e.block_index, e.start_offset, e.tie_id DESC
       LIMIT ${limit}
    `)
    return result.rows.map(convertEncounterRowToDomain)
  }

  public async summarize(userId: number, today: string): Promise<VocabularyCounts> {
    const result = await this._db.execute<SummaryRow>(sql`
      ${this._buildEncountersCte(userId)}
      SELECT
        (SELECT count(*)::int FROM vocabulary_cards c JOIN encounters e ON e.lemma = c.lemma
          WHERE c.user_id = ${userId} AND c.due_date <= ${today}) AS due_count,
        (SELECT count(*)::int FROM encounters e
          WHERE NOT EXISTS (SELECT 1 FROM vocabulary_cards c WHERE c.user_id = ${userId} AND c.lemma = e.lemma)) AS new_count,
        (SELECT count(*)::int FROM vocabulary_cards WHERE user_id = ${userId} AND stage < ${VOCABULARY_MASTERED_STAGE}) AS learning_count,
        (SELECT count(*)::int FROM vocabulary_cards WHERE user_id = ${userId} AND stage = ${VOCABULARY_MASTERED_STAGE}) AS mastered_count,
        (SELECT min(due_date)::text FROM vocabulary_cards WHERE user_id = ${userId} AND due_date > ${today}) AS next_due_date
    `)
    const [row] = result.rows
    return {
      dueCount: row.due_count,
      learningCount: row.learning_count,
      masteredCount: row.mastered_count,
      newCount: row.new_count,
      nextDueDate: row.next_due_date,
    }
  }

  /**
   * 見出し語ごとの、意味が用意できる最後に出会った場所（encounters）までの CTE。
   *
   * 1. candidates：調べた単語（origin_rank 0）と、提出した挑戦の公開中の問題の用語集（origin_rank 1）を並べる
   * 2. resolved：用語集の行が使えるか（残っていて問題が公開中）と、辞書の意味を付け、どちらも無い行を捨てる
   * 3. encounters：見出し語ごとに、調べた単語を優先し、その中で新しいもの（用語集は本文に出てくる順）を 1 つ選ぶ
   *
   * 意味の無い行を捨ててから選ぶので、最後に調べた場所に意味が無くても、別の場所に意味があればそちらを使う
   */
  private _buildEncountersCte(userId: number): SQL {
    return sql`
      WITH candidates AS (
        SELECT lower(btrim(l.lemma)) AS lemma, l.surface, l.passage_id, l.glossary_entry_id,
               0 AS origin_rank, l.created_at AS encountered_at, 0 AS block_index, 0 AS start_offset, l.id AS tie_id
          FROM attempt_word_lookups l
         WHERE l.user_id = ${userId}
        UNION ALL
        SELECT lower(btrim(g.lemma)), g.surface, g.passage_id, g.id,
               1, a.submitted_at, g.block_index, g.start_offset, g.id
          FROM reading_attempts a
          JOIN passages p ON p.id = a.passage_id AND p.status = 'published'
          JOIN passage_glossary_entries g ON g.passage_id = a.passage_id
         WHERE a.user_id = ${userId} AND a.status = 'submitted'
      ),
      resolved AS (
        SELECT c.*, g.id AS usable_glossary_id, d.meaning_ja AS dictionary_meaning_ja
          FROM candidates c
          JOIN passages p ON p.id = c.passage_id
          LEFT JOIN passage_glossary_entries g ON g.id = c.glossary_entry_id AND p.status = 'published'
          LEFT JOIN dictionary_entries d ON d.headword = c.lemma
         WHERE g.id IS NOT NULL OR d.id IS NOT NULL
      ),
      encounters AS (
        SELECT DISTINCT ON (lemma) *
          FROM resolved
         ORDER BY lemma, origin_rank, encountered_at DESC, block_index, start_offset, tie_id DESC
      )
    `
  }

  /**
   * encounters の 1 行を中身の材料に変える列（呼び出し側が FROM encounters e に passages p と用語集 g を join して使う）
   */
  private _selectEncounterColumns(): SQL {
    return sql`
      e.lemma, e.surface, e.dictionary_meaning_ja,
      p.id AS passage_id, p.title AS passage_title,
      CASE WHEN p.status = 'published' THEN p.blocks END AS passage_blocks,
      g.id AS glossary_id, g.block_index AS glossary_block_index, g.start_offset AS glossary_start_offset,
      g.end_offset AS glossary_end_offset, g.surface AS glossary_surface, g.meaning_ja AS glossary_meaning_ja,
      g.note_ja AS glossary_note_ja, g.part_of_speech AS glossary_part_of_speech
    `
  }
}
