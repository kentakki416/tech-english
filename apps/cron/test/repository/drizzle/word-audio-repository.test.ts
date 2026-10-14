import { createDrizzleClient, DrizzleClient } from "@repo/db"

import type { ClaimedWordAudio } from "../../../src/repository"
import { DrizzleWordAudioRepository } from "../../../src/repository/drizzle"

const NOW = new Date("2026-10-14T03:00:00.000Z")

const STARTED_AT = new Date("2026-10-14T02:50:00.123Z")

const STALE_BEFORE = new Date("2026-10-14T02:30:00.000Z")

const CLAIM_INPUT = { limit: 3, maxAttempts: 3, now: NOW, staleBefore: STALE_BEFORE, voiceId: "Joanna" }

const CLAIM: ClaimedWordAudio = { claimedStatus: "generating", generationStartedAt: STARTED_AT, id: 7, lemma: "escape hatch", previousAudioKey: null }

const READY_CLAIM: ClaimedWordAudio = { ...CLAIM, claimedStatus: "ready", previousAudioKey: "words/old.mp3" }

/**
 * 記録したクエリを SQL の文字列にする。接続しない（Pool は最初のクエリまで接続しない）実物の client の toSQL を使う
 */
const renderClient = createDrizzleClient({ url: "postgresql://user:password@127.0.0.1:1/unused" })

/**
 * 生の sql（tx.execute に渡すもの）を SQL の文字列にする dialect（drizzle の db が持つ）
 */
const renderDialect = (renderClient as unknown as { dialect: { sqlToQuery: (query: unknown) => { params: unknown[]; sql: string } } }).dialect

/**
 * バインド変数の番号（$1, $2, ...）は値の数で変わるので $? にそろえ、生の sql の改行と空白は 1 つの空白にする
 */
const normalizeSql = (text: string): string => text.replace(/\$\d+/g, "$?").replace(/\s+/g, " ").trim()

type RecordedCall = { args: unknown[]; method: string }

/**
 * クエリビルダーのメソッドの呼び出しを記録し、await すると result を返す偽物
 */
const createRecordingQuery = (result: unknown, calls: RecordedCall[]): object => {
  const query: object = new Proxy({}, {
    get: (_target, property) => {
      if (property === "then") {
        return async (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(onFulfilled, onRejected)
      }
      return (...args: unknown[]) => {
        calls.push({ args, method: String(property) })
        return query
      }
    },
  })
  return query
}

/**
 * トランザクション（と db 直下）の select / insert / update / execute を記録する偽物。results はクエリを始めた順に返す値
 */
const createFakeDb = (results: unknown[]) => {
  const queries: RecordedCall[][] = []
  const startQuery = (method: string) => (...args: unknown[]) => {
    const calls: RecordedCall[] = [{ args, method }]
    const result = results[queries.length] ?? []
    queries.push(calls)
    return createRecordingQuery(result, calls)
  }
  const tx = { execute: startQuery("execute"), insert: startQuery("insert"), select: startQuery("select"), update: startQuery("update") }
  const transaction = vi.fn(async (callback: (_tx: unknown) => Promise<unknown>) => callback(tx))
  return { db: { ...tx, transaction } as unknown as DrizzleClient, queries, transaction }
}

/**
 * 記録した呼び出しを実物の client で組み立て直して SQL にする（execute は生の sql を dialect で SQL にする）
 */
const renderQuery = (calls: RecordedCall[] | undefined) => {
  if (!calls) throw new Error("query was not recorded")
  if (calls[0]?.method === "execute") {
    const query = renderDialect.sqlToQuery(calls[0].args[0])
    return { params: query.params, sql: normalizeSql(query.sql) }
  }
  const builder = calls.reduce<unknown>((current, call) => {
    const method = (current as Record<string, ((...args: unknown[]) => unknown) | undefined>)[call.method]
    if (!method) throw new Error(`unknown method: ${call.method}`)
    return method.apply(current, call.args)
  }, renderClient) as { toSQL: () => { params: unknown[]; sql: string } }
  const query = builder.toSQL()
  return { params: query.params, sql: normalizeSql(query.sql) }
}

const findArgs = (calls: RecordedCall[] | undefined, method: string): unknown[] | undefined =>
  calls?.find((call) => call.method === method)?.args

/**
 * claim のガード（id・状態・確保の時刻）
 */
const CLAIM_CONDITION_SQL = [
  "where ((\"word_audios\".\"id\" = $?) and (\"word_audios\".\"status\" = $?)",
  " and (\"word_audios\".\"generation_started_at\" = $?))",
].join("")

describe("DrizzleWordAudioRepository", () => {
  afterAll(async () => {
    await renderClient.$disconnect()
  })

  describe("claimTargets", () => {
    describe("正常系", () => {
      it("① pending を id 順に FOR UPDATE SKIP LOCKED で選び、generating（今の voice）にして確保する", async () => {
        const fake = createFakeDb([[{ audioKey: null, id: 1, lemma: "cache" }], [], { rows: [] }, []])

        const claims = await new DrizzleWordAudioRepository(fake.db).claimTargets(CLAIM_INPUT)

        expect(claims).toEqual([{ claimedStatus: "generating", generationStartedAt: NOW, id: 1, lemma: "cache", previousAudioKey: null }])
        expect(fake.transaction).toHaveBeenCalledTimes(1)
        const pending = renderQuery(fake.queries[0])
        expect(pending.sql).toContain("where \"word_audios\".\"status\" = $? order by \"word_audios\".\"id\" asc limit $? for update skip locked")
        expect(pending.params).toEqual(["pending", 3])
        expect(findArgs(fake.queries[1], "set")?.[0]).toEqual({ generationStartedAt: NOW, status: "generating", updatedAt: NOW, voiceId: "Joanna" })
        expect(renderQuery(fake.queries[1]).sql).toContain("where ((\"word_audios\".\"id\" in ($?)) and (\"word_audios\".\"status\" = $?))")
        /**
         * 残りの枠（3 - 1 = 2）で、まだ行が無い見出し語を探す
         */
        expect(renderQuery(fake.queries[2]).params).toEqual([2])
      })

      it("② まだ行が無い見出し語を、調べた単語（英和辞書と一致）→ 公開中の問題の用語集の順に新しい順で選び、generating で insert して候補の順に確保する（重なったら作らない）", async () => {
        const fake = createFakeDb([
          [],
          { rows: [{ lemma: "server" }, { lemma: "escape hatch" }, { lemma: "queue" }] },
          [{ id: 12, lemma: "queue" }, { id: 11, lemma: "server" }],
          [],
        ])

        const claims = await new DrizzleWordAudioRepository(fake.db).claimTargets(CLAIM_INPUT)

        const candidates = renderQuery(fake.queries[1])
        expect(candidates.sql).toContain("SELECT lower(btrim(l.lemma)) AS lemma, max(l.created_at) AS seen_at, 0 AS priority FROM attempt_word_lookups l JOIN dictionary_entries d ON d.headword = lower(btrim(l.lemma))")
        expect(candidates.sql).toContain("FROM passage_glossary_entries g JOIN passages p ON p.id = g.passage_id AND p.status = 'published'")
        expect(candidates.sql).toContain("AND NOT EXISTS (SELECT 1 FROM word_audios w WHERE w.lemma = c.lemma)")
        expect(candidates.sql).toContain("ORDER BY min(c.priority), max(c.seen_at) DESC NULLS LAST, c.lemma LIMIT $?")
        expect(candidates.params).toEqual([3])
        expect(findArgs(fake.queries[2], "values")?.[0]).toEqual(["server", "escape hatch", "queue"].map((lemma) => ({
          generationStartedAt: NOW,
          lemma,
          status: "generating",
          updatedAt: NOW,
          voiceId: "Joanna",
        })))
        expect(renderQuery(fake.queries[2]).sql).toContain("on conflict (\"lemma\") do nothing returning \"id\", \"lemma\"")
        /**
         * RETURNING の順（queue → server）ではなく候補の順に並べ、別の実行が先に作った見出し語（escape hatch）は確保しない
         */
        expect(claims).toEqual([
          { claimedStatus: "generating", generationStartedAt: NOW, id: 11, lemma: "server", previousAudioKey: null },
          { claimedStatus: "generating", generationStartedAt: NOW, id: 12, lemma: "queue", previousAudioKey: null },
        ])
      })

      it("③ 残りの枠で、voice が今と違う確保中でない ready（失敗が上限未満）を id 順に FOR UPDATE SKIP LOCKED で選び、ready のまま generation_started_at だけを入れて確保する", async () => {
        const fake = createFakeDb([[], { rows: [] }, [{ audioKey: "words/old.mp3", id: 2, lemma: "queue" }], []])

        const claims = await new DrizzleWordAudioRepository(fake.db).claimTargets(CLAIM_INPUT)

        expect(claims).toEqual([{ claimedStatus: "ready", generationStartedAt: NOW, id: 2, lemma: "queue", previousAudioKey: "words/old.mp3" }])
        const voiceChanged = renderQuery(fake.queries[2])
        expect(voiceChanged.sql).toContain([
          "where ((\"word_audios\".\"status\" = $?) and (\"word_audios\".\"voice_id\" <> $?)",
          " and ((((\"word_audios\".\"generation_started_at\" is null)) or (\"word_audios\".\"generation_started_at\" < $?)))",
          " and (\"word_audios\".\"attempt_count\" < $?))",
        ].join(""))
        expect(voiceChanged.sql).toContain("order by \"word_audios\".\"id\" asc limit $? for update skip locked")
        expect(voiceChanged.params).toEqual(["ready", "Joanna", "2026-10-14T02:30:00.000Z", 3, 3])
        expect(findArgs(fake.queries[3], "set")?.[0]).toEqual({ generationStartedAt: NOW, updatedAt: NOW })
        expect(renderQuery(fake.queries[3]).params.slice(-2)).toEqual([2, "ready"])
      })
    })

    describe("異常系", () => {
      it("pending で枠が埋まったら、まだ行が無い見出し語も voice の変更も探さない", async () => {
        const fake = createFakeDb([[1, 2, 3].map((id) => ({ audioKey: null, id, lemma: `w${id}` })), []])

        const claims = await new DrizzleWordAudioRepository(fake.db).claimTargets(CLAIM_INPUT)

        expect(claims).toHaveLength(3)
        expect(fake.queries.map((calls) => calls[0]?.method)).toEqual(["select", "update"])
      })

      it("まだ行が無い見出し語で枠が埋まったら、voice の変更は探さない（新しい見出し語を先に作る）", async () => {
        const fake = createFakeDb([
          [],
          { rows: [{ lemma: "a" }, { lemma: "b" }, { lemma: "c" }] },
          [{ id: 1, lemma: "a" }, { id: 2, lemma: "b" }, { id: 3, lemma: "c" }],
        ])

        const claims = await new DrizzleWordAudioRepository(fake.db).claimTargets(CLAIM_INPUT)

        expect(claims.map((claim) => claim.lemma)).toEqual(["a", "b", "c"])
        expect(fake.queries.map((calls) => calls[0]?.method)).toEqual(["select", "execute", "insert"])
      })

      it("候補が無ければ insert しない", async () => {
        const fake = createFakeDb([[], { rows: [] }, []])

        await new DrizzleWordAudioRepository(fake.db).claimTargets(CLAIM_INPUT)

        expect(fake.queries.map((calls) => calls[0]?.method)).toEqual(["select", "execute", "select"])
      })
    })
  })

  describe("completeClaim", () => {
    describe("正常系", () => {
      it("確保したままの行を FOR UPDATE で読み、ready なら mp3 のキー・ハッシュ・voice・課金文字数を入れて失敗の記録を消す", async () => {
        const fake = createFakeDb([[{ attemptCount: 2 }], []])

        const result = await new DrizzleWordAudioRepository(fake.db).completeClaim(
          CLAIM,
          { audioKey: "words/new.mp3", billedCharacters: 12, kind: "ready", textHash: "new", voiceId: "Joanna" },
          NOW,
        )

        expect(result).toBe("ready")
        const guard = renderQuery(fake.queries[0])
        expect(guard.sql).toContain(`${CLAIM_CONDITION_SQL} for update`)
        expect(guard.params).toEqual([7, "generating", "2026-10-14T02:50:00.123Z"])
        expect(findArgs(fake.queries[1], "set")?.[0]).toEqual({
          attemptCount: 0,
          audioKey: "words/new.mp3",
          billedCharacters: 12,
          generatedAt: NOW,
          generationStartedAt: null,
          lastError: null,
          status: "ready",
          textHash: "new",
          updatedAt: NOW,
          voiceId: "Joanna",
        })
      })

      it.each([
        [0, "pending", "retry_later"],
        [2, "failed", "failed"],
      ] as const)("generating で確保した行の失敗（前の失敗 %d 回）は %s にして %s を返す（audio_key と text_hash は前のまま）", async (previous, status, expected) => {
        const fake = createFakeDb([[{ attemptCount: previous }], []])

        const result = await new DrizzleWordAudioRepository(fake.db).completeClaim(CLAIM, { error: "Error: boom", kind: "failed", maxAttempts: 3 }, NOW)

        expect(result).toBe(expected)
        expect(findArgs(fake.queries[1], "set")?.[0]).toEqual({
          attemptCount: previous + 1,
          generationStartedAt: null,
          lastError: "Error: boom",
          status,
          updatedAt: NOW,
        })
      })

      it("ready のまま確保した行の失敗は、上限に達しても ready のまま（前の音声を出し続ける）", async () => {
        const fake = createFakeDb([[{ attemptCount: 2 }], []])

        const result = await new DrizzleWordAudioRepository(fake.db).completeClaim(READY_CLAIM, { error: "Error: boom", kind: "failed", maxAttempts: 3 }, NOW)

        expect(result).toBe("failed")
        expect(findArgs(fake.queries[1], "set")?.[0]).toEqual(expect.objectContaining({ attemptCount: 3, status: "ready" }))
      })
    })

    describe("異常系", () => {
      it("確保が取り直されていたら（ガードに合う行が無い）lost_claim で何も書かない", async () => {
        const fake = createFakeDb([[]])

        const result = await new DrizzleWordAudioRepository(fake.db).completeClaim(CLAIM, { error: "x", kind: "failed", maxAttempts: 3 }, NOW)

        expect(result).toBe("lost_claim")
        expect(fake.queries).toHaveLength(1)
      })
    })
  })

  describe("releaseClaim", () => {
    describe("正常系", () => {
      it("generating で確保した行は、確保したままなら pending に戻す（失敗回数は増やさない）", async () => {
        const fake = createFakeDb([[]])

        await new DrizzleWordAudioRepository(fake.db).releaseClaim(CLAIM)

        expect(findArgs(fake.queries[0], "set")?.[0]).toEqual({ generationStartedAt: null, status: "pending" })
        expect(renderQuery(fake.queries[0]).sql).toContain(CLAIM_CONDITION_SQL)
      })

      it("ready のまま確保した行は、generation_started_at だけを外す", async () => {
        const fake = createFakeDb([[]])

        await new DrizzleWordAudioRepository(fake.db).releaseClaim(READY_CLAIM)

        expect(findArgs(fake.queries[0], "set")?.[0]).toEqual({ generationStartedAt: null })
        expect(renderQuery(fake.queries[0]).params.slice(-3)).toEqual([7, "ready", "2026-10-14T02:50:00.123Z"])
      })
    })
  })

  describe("releaseStaleGenerating", () => {
    describe("正常系", () => {
      it("generating のまま startedBefore より前に確保された行を pending に戻し、件数を返す", async () => {
        const fake = createFakeDb([[{ id: 1 }, { id: 2 }]])

        const count = await new DrizzleWordAudioRepository(fake.db).releaseStaleGenerating(STALE_BEFORE)

        expect(count).toBe(2)
        const { params, sql } = renderQuery(fake.queries[0])
        expect(sql).toContain("where ((\"word_audios\".\"status\" = $?) and (\"word_audios\".\"generation_started_at\" < $?)) returning \"id\"")
        expect(params.slice(-2)).toEqual(["generating", "2026-10-14T02:30:00.000Z"])
      })
    })

    describe("異常系", () => {
      it("戻す行が無ければ 0", async () => {
        const fake = createFakeDb([[]])

        expect(await new DrizzleWordAudioRepository(fake.db).releaseStaleGenerating(STALE_BEFORE)).toBe(0)
      })
    })
  })
})
