import { and, asc, DrizzleClient, eq, inArray, isNull, lt, ne, or, sql, wordAudios } from "@repo/db"

import type {
  ClaimedWordAudio,
  WordAudioClaimOutcome,
  WordAudioClaimResult,
  WordAudioClaimStatus,
  WordAudioRepository,
} from "../word-audio-repository"

/**
 * まだ行が無い見出し語の候補（単語帳の出題の候補のうち、意味が用意できる語句。ユーザーは区別しない）。
 * api の VocabularyRepository の encounters と同じ正規化（lower(btrim(lemma))）と英和辞書の一致（headword = 見出し語）にそろえる。
 * 調べた単語（priority 0）を用語集（priority 1）より先に、それぞれ新しい順に並べる
 */
const buildNewLemmaQuery = (limit: number) => sql`
  WITH candidates AS (
    SELECT lower(btrim(l.lemma)) AS lemma, max(l.created_at) AS seen_at, 0 AS priority
      FROM attempt_word_lookups l
      JOIN dictionary_entries d ON d.headword = lower(btrim(l.lemma))
     GROUP BY 1
    UNION ALL
    SELECT lower(btrim(g.lemma)) AS lemma, max(p.published_at) AS seen_at, 1 AS priority
      FROM passage_glossary_entries g
      JOIN passages p ON p.id = g.passage_id AND p.status = 'published'
     GROUP BY 1
  )
  SELECT c.lemma
    FROM candidates c
   WHERE char_length(c.lemma) BETWEEN 1 AND 200
     AND NOT EXISTS (SELECT 1 FROM word_audios w WHERE w.lemma = c.lemma)
   GROUP BY c.lemma
   ORDER BY min(c.priority), max(c.seen_at) DESC NULLS LAST, c.lemma
   LIMIT ${limit}
`

/**
 * Drizzle 実装の WordAudioRepository
 */
export class DrizzleWordAudioRepository implements WordAudioRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  /**
   * ① の行は FOR UPDATE SKIP LOCKED でロックしてから更新する（別の実行がロック中の行は飛ばす）。② は候補を選んでから insert し、
   * ON CONFLICT (lemma) DO NOTHING で、別の実行が先に作った見出し語は確保しない（RETURNING で返った行だけを確保できたものとする）
   */
  public async claimTargets(input: {
    limit: number
    maxAttempts: number
    now: Date
    staleBefore: Date
    voiceId: string
  }): Promise<ClaimedWordAudio[]> {
    const isNotClaimedRecently = or(isNull(wordAudios.generationStartedAt), lt(wordAudios.generationStartedAt, input.staleBefore))
    return this._db.transaction(async (tx) => {
      const existing = await tx
        .select({ audioKey: wordAudios.audioKey, id: wordAudios.id, lemma: wordAudios.lemma, status: wordAudios.status })
        .from(wordAudios)
        .where(
          or(
            eq(wordAudios.status, "pending"),
            and(
              eq(wordAudios.status, "ready"),
              ne(wordAudios.voiceId, input.voiceId),
              isNotClaimedRecently,
              lt(wordAudios.attemptCount, input.maxAttempts),
            ),
          ),
        )
        .orderBy(asc(wordAudios.id))
        .limit(input.limit)
        .for("update", { skipLocked: true })

      const claims: ClaimedWordAudio[] = []
      const toClaim = (row: { audioKey: string | null; id: number; lemma: string }, claimedStatus: WordAudioClaimStatus): ClaimedWordAudio => ({
        claimedStatus,
        generationStartedAt: input.now,
        id: row.id,
        lemma: row.lemma,
        previousAudioKey: row.audioKey,
      })

      const pendingRows = existing.filter((row) => row.status === "pending")
      if (pendingRows.length > 0) {
        await tx
          .update(wordAudios)
          .set({ generationStartedAt: input.now, status: "generating", updatedAt: input.now, voiceId: input.voiceId })
          .where(and(inArray(wordAudios.id, pendingRows.map((row) => row.id)), eq(wordAudios.status, "pending")))
        claims.push(...pendingRows.map((row) => toClaim(row, "generating")))
      }
      const readyRows = existing.filter((row) => row.status === "ready")
      if (readyRows.length > 0) {
        await tx
          .update(wordAudios)
          .set({ generationStartedAt: input.now, updatedAt: input.now })
          .where(and(inArray(wordAudios.id, readyRows.map((row) => row.id)), eq(wordAudios.status, "ready")))
        claims.push(...readyRows.map((row) => toClaim(row, "ready")))
      }

      const remaining = input.limit - claims.length
      if (remaining <= 0) return claims
      const candidates = await tx.execute<{ lemma: string }>(buildNewLemmaQuery(remaining))
      if (candidates.rows.length === 0) return claims
      const inserted = await tx
        .insert(wordAudios)
        .values(
          candidates.rows.map((row) => ({
            generationStartedAt: input.now,
            lemma: row.lemma,
            status: "generating" as const,
            updatedAt: input.now,
            voiceId: input.voiceId,
          })),
        )
        .onConflictDoNothing({ target: wordAudios.lemma })
        .returning({ id: wordAudios.id, lemma: wordAudios.lemma })
      claims.push(...inserted.map((row) => toClaim({ ...row, audioKey: null }, "generating")))
      return claims
    })
  }

  public async completeClaim(claim: ClaimedWordAudio, outcome: WordAudioClaimOutcome, now: Date): Promise<WordAudioClaimResult> {
    return this._db.transaction(async (tx) => {
      const [claimed] = await tx
        .select({ attemptCount: wordAudios.attemptCount })
        .from(wordAudios)
        .where(this._buildClaimCondition(claim))
        .for("update")
      if (!claimed) return "lost_claim"

      if (outcome.kind === "ready") {
        await tx
          .update(wordAudios)
          .set({
            attemptCount: 0,
            audioKey: outcome.audioKey,
            billedCharacters: outcome.billedCharacters,
            generatedAt: now,
            generationStartedAt: null,
            lastError: null,
            status: "ready",
            textHash: outcome.textHash,
            updatedAt: now,
            voiceId: outcome.voiceId,
          })
          .where(eq(wordAudios.id, claim.id))
        return "ready"
      }

      const attemptCount = claimed.attemptCount + 1
      const isExhausted = attemptCount >= outcome.maxAttempts
      /**
       * ready のまま確保した行は ready のまま前の音声を出し続ける（上限に達したら voice の変更でも取らなくなる）
       */
      const status = claim.claimedStatus === "ready" ? "ready" : isExhausted ? "failed" : "pending"
      await tx
        .update(wordAudios)
        .set({ attemptCount, generationStartedAt: null, lastError: outcome.error, status, updatedAt: now })
        .where(eq(wordAudios.id, claim.id))
      return isExhausted ? "failed" : "retry_later"
    })
  }

  public async releaseClaim(claim: ClaimedWordAudio): Promise<void> {
    await this._db
      .update(wordAudios)
      .set(claim.claimedStatus === "generating" ? { generationStartedAt: null, status: "pending" } : { generationStartedAt: null })
      .where(this._buildClaimCondition(claim))
  }

  public async releaseStaleGenerating(startedBefore: Date): Promise<number> {
    const rows = await this._db
      .update(wordAudios)
      .set({ generationStartedAt: null, status: "pending" })
      .where(and(eq(wordAudios.status, "generating"), lt(wordAudios.generationStartedAt, startedBefore)))
      .returning({ id: wordAudios.id })
    return rows.length
  }

  /**
   * 確保した行か（状態と確保した時刻が確保したときのまま）
   */
  private _buildClaimCondition(claim: ClaimedWordAudio) {
    return and(
      eq(wordAudios.id, claim.id),
      eq(wordAudios.status, claim.claimedStatus),
      eq(wordAudios.generationStartedAt, claim.generationStartedAt),
    )
  }
}
