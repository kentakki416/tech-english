import { createDrizzleClient, DrizzleClient } from "@repo/db"
import type { PassageAudioManifest, PassageBlock } from "@repo/domain"

import type { AudioClaim } from "../../../src/repository"
import { DrizzlePassageAudioRepository } from "../../../src/repository/drizzle"

const NOW = new Date("2026-10-13T03:00:00.000Z")

const CLAIM: AudioClaim = { claimedStatus: "generating", generationStartedAt: new Date("2026-10-13T02:50:00.123Z"), passageId: 42 }

const READY_CLAIM: AudioClaim = { ...CLAIM, claimedStatus: "ready" }

const STALE_BEFORE = new Date("2026-10-13T02:30:00.000Z")

const CLAIM_INPUT = { limit: 20, maxAttempts: 3, now: NOW, staleBefore: STALE_BEFORE, voiceId: "Joanna" }

const BLOCKS: PassageBlock[] = [{ text: "Effects are an escape hatch.", type: "paragraph" }]

const MANIFEST: PassageAudioManifest = {
  blocks: [{ blockIndex: 0, parts: [{ durationMs: 1800, key: "passages/42/new/0-0.mp3", words: [[0, 300, 0, 7]] }] }],
}

const calculateTextHash = vi.fn((blocks: PassageBlock[]) => `hash:${blocks.map((block) => block.text).join("|")}`)

/**
 * 記録したクエリを SQL の文字列にする。接続しない（Pool は最初のクエリまで接続しない）実物の client の toSQL を使う
 */
const renderClient = createDrizzleClient({ url: "postgresql://user:password@127.0.0.1:1/unused" })

/**
 * バインド変数の番号（$1, $2, ...）は値の数で変わるので $? にそろえる
 */
const normalizeParams = (text: string): string => text.replace(/\$\d+/g, "$?")

type RecordedCall = { args: unknown[]; method: string }

/**
 * クエリビルダーのメソッドの呼び出しを記録し、await すると result を返す偽物（select / insert / update のどの連鎖にも使える）
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
 * トランザクション（と db 直下）の select / insert / update / delete を記録する偽物。results はクエリを始めた順に返す値
 */
const createFakeDb = (results: unknown[]) => {
  const queries: RecordedCall[][] = []
  const startQuery = (method: string) => (...args: unknown[]) => {
    const calls: RecordedCall[] = [{ args, method }]
    const result = results[queries.length] ?? []
    queries.push(calls)
    return createRecordingQuery(result, calls)
  }
  const tx = { delete: startQuery("delete"), insert: startQuery("insert"), select: startQuery("select"), update: startQuery("update") }
  const transaction = vi.fn(async (callback: (_tx: unknown) => Promise<unknown>) => callback(tx))
  return { db: { ...tx, transaction } as unknown as DrizzleClient, queries, transaction }
}

/**
 * 記録した呼び出しを実物の client で組み立て直して SQL にする
 */
const renderQuery = (calls: RecordedCall[] | undefined) => {
  if (!calls) throw new Error("query was not recorded")
  const builder = calls.reduce<unknown>((current, call) => {
    const method = (current as Record<string, ((...args: unknown[]) => unknown) | undefined>)[call.method]
    if (!method) throw new Error(`unknown method: ${call.method}`)
    return method.apply(current, call.args)
  }, renderClient) as { toSQL: () => { params: unknown[]; sql: string } }
  const query = builder.toSQL()
  return { params: query.params, sql: normalizeParams(query.sql) }
}

/**
 * update の SQL の SET 句（where より前）
 */
const readSetClause = (sql: string): string => sql.slice(0, sql.indexOf(" where "))

/**
 * 記録した呼び出しのうち、指定のメソッドの引数
 */
const findArgs = (calls: RecordedCall[] | undefined, method: string): unknown[] | undefined =>
  calls?.find((call) => call.method === method)?.args

/**
 * claim のガード（passage_id・状態・確保の時刻）
 */
const CLAIM_CONDITION_SQL = [
  "where ((\"passage_audios\".\"passage_id\" = $?) and (\"passage_audios\".\"status\" = $?)",
  " and (\"passage_audios\".\"generation_started_at\" = $?))",
].join("")

const CLAIM_CONDITION_PARAMS = [42, "generating", "2026-10-13T02:50:00.123Z"]

const READY_CLAIM_CONDITION_PARAMS = [42, "ready", "2026-10-13T02:50:00.123Z"]

/**
 * 確保中でない（generation_started_at が無いか staleBefore より前）
 */
const NOT_CLAIMED_RECENTLY_SQL = "(((\"passage_audios\".\"generation_started_at\" is null)) or (\"passage_audios\".\"generation_started_at\" < $?))"

/**
 * select の候補の行（passage_audios の列は行が無ければ null）
 */
const buildCandidate = (overrides: Record<string, unknown> = {}) => ({
  blocks: BLOCKS,
  passageId: 7,
  previousManifest: null,
  previousRegenerateRequestedAt: null,
  previousStatus: null,
  previousTextHash: null,
  previousUpdatedAt: null,
  publishedAt: new Date("2026-10-12T03:00:00.000Z"),
  ...overrides,
})

describe("DrizzlePassageAudioRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await renderClient.$disconnect()
  })

  describe("claimTargets", () => {
    describe("正常系", () => {
      it("公開済みで、行が無い・pending・確保中でない ready（公開し直された・voice が今と違う・作り直しの依頼があり失敗が上限未満）の問題を古い順に FOR UPDATE OF passages SKIP LOCKED で選ぶ", async () => {
        const fake = createFakeDb([[]])

        const claimed = await new DrizzlePassageAudioRepository(fake.db).claimTargets({ calculateTextHash, ...CLAIM_INPUT })

        expect(claimed).toEqual([])
        expect(fake.transaction).toHaveBeenCalledTimes(1)
        const { params, sql } = renderQuery(fake.queries[0])
        expect(sql).toContain("\"passage_audios\".\"regenerate_requested_at\", \"passage_audios\".\"status\", \"passage_audios\".\"text_hash\", \"passage_audios\".\"updated_at\", \"passages\".\"published_at\"")
        expect(sql).toContain("from \"passages\" left join \"passage_audios\" on \"passage_audios\".\"passage_id\" = \"passages\".\"id\"")
        expect(sql).toContain([
          "where ((\"passages\".\"status\" = $?) and ((((\"passage_audios\".\"id\" is null)) or (\"passage_audios\".\"status\" = $?)",
          " or (((\"passage_audios\".\"status\" = $?) and (", NOT_CLAIMED_RECENTLY_SQL, ")",
          " and (((\"passage_audios\".\"updated_at\" < \"passages\".\"published_at\")",
          " or (((((\"passage_audios\".\"voice_id\" <> $?) or ((\"passage_audios\".\"regenerate_requested_at\" is not null))))",
          " and (\"passage_audios\".\"attempt_count\" < $?))))))))))",
        ].join(""))
        expect(sql).toContain("order by \"passages\".\"published_at\" asc, \"passages\".\"id\" asc limit $? for update of \"passages\" skip locked")
        expect(params).toEqual(["published", "pending", "ready", "2026-10-13T02:30:00.000Z", "Joanna", 3, 20])
        /**
         * 対象が無ければ insert も update もしない
         */
        expect(fake.queries).toHaveLength(1)
      })

      it("行が無い・pending・公開し直された ready は insert し、既にある行は pending か確保中でない ready のときだけ generating にする（manifest と text_hash は触らない）", async () => {
        const fake = createFakeDb([
          [
            buildCandidate({ passageId: 7 }),
            buildCandidate({ passageId: 8, previousStatus: "pending", previousTextHash: "h8" }),
            buildCandidate({
              passageId: 9,
              previousManifest: MANIFEST,
              previousStatus: "ready",
              previousTextHash: "old",
              previousUpdatedAt: new Date("2026-10-12T02:00:00.000Z"),
            }),
          ],
          [{ passageId: 9 }, { passageId: 8 }, { passageId: 7 }],
        ])

        await new DrizzlePassageAudioRepository(fake.db).claimTargets({ calculateTextHash, ...CLAIM_INPUT })

        expect(findArgs(fake.queries[1], "values")?.[0]).toEqual([7, 8, 9].map((passageId) => ({
          generationStartedAt: NOW,
          passageId,
          status: "generating",
          textHash: `hash:${BLOCKS[0]?.text}`,
          updatedAt: NOW,
          voiceId: "Joanna",
        })))
        const { params, sql } = renderQuery(fake.queries[1])
        expect(sql).toContain([
          "on conflict (\"passage_id\") do update set \"generation_started_at\" = $?, \"status\" = $?, \"updated_at\" = $?",
          " where ((\"passage_audios\".\"status\" = $?) or (((\"passage_audios\".\"status\" = $?) and (", NOT_CLAIMED_RECENTLY_SQL, "))))",
        ].join(""))
        expect(sql).toContain("returning \"passage_id\"")
        expect(sql).not.toContain("\"manifest\" =")
        expect(sql).not.toContain("\"text_hash\" =")
        expect(params.slice(-6)).toEqual([
          "2026-10-13T03:00:00.000Z", "generating", "2026-10-13T03:00:00.000Z", "pending", "ready", "2026-10-13T02:30:00.000Z",
        ])
        /**
         * ready のまま確保する行が無ければ update しない
         */
        expect(fake.queries).toHaveLength(2)
      })

      it("公開し直されていない ready（voice の変更・作り直しの依頼）は、ready のまま generation_started_at だけを入れ、updated_at は今の値のままにする", async () => {
        const fake = createFakeDb([
          [buildCandidate({
            passageId: 8,
            previousManifest: MANIFEST,
            previousStatus: "ready",
            previousTextHash: "old",
            previousUpdatedAt: new Date("2026-10-12T04:00:00.000Z"),
          })],
          [{ passageId: 8 }],
        ])

        const claimed = await new DrizzlePassageAudioRepository(fake.db).claimTargets({ calculateTextHash, ...CLAIM_INPUT })

        expect(fake.queries[1]?.[0]?.method).toBe("update")
        const { params, sql } = renderQuery(fake.queries[1])
        expect(sql).toContain("set \"generation_started_at\" = $?, \"updated_at\" = \"passage_audios\".\"updated_at\"")
        expect(sql).toContain([
          "where ((\"passage_audios\".\"passage_id\" in ($?)) and (\"passage_audios\".\"status\" = $?) and (", NOT_CLAIMED_RECENTLY_SQL, ")",
          " and (((((\"passage_audios\".\"voice_id\" <> $?) or ((\"passage_audios\".\"regenerate_requested_at\" is not null))))",
          " and (\"passage_audios\".\"attempt_count\" < $?)))) returning \"passage_id\"",
        ].join(""))
        expect(readSetClause(sql)).not.toContain("\"status\"")
        expect(params).toEqual(["2026-10-13T03:00:00.000Z", 8, "ready", "2026-10-13T02:30:00.000Z", "Joanna", 3])
        expect(claimed).toEqual([{
          blocks: BLOCKS,
          claimedStatus: "ready",
          generationStartedAt: NOW,
          isRegenerationRequested: false,
          passageId: 8,
          previous: { manifest: MANIFEST, status: "ready", textHash: "old" },
        }])
      })

      it("RETURNING で返った行だけを、select の順（published_at → id）で確保したときの状態・作り直しの依頼・前の行つきで返す", async () => {
        const fake = createFakeDb([
          [
            buildCandidate({ passageId: 7 }),
            buildCandidate({
              passageId: 8,
              previousManifest: MANIFEST,
              previousRegenerateRequestedAt: new Date("2026-10-13T01:00:00.000Z"),
              previousStatus: "ready",
              previousTextHash: "old",
              previousUpdatedAt: new Date("2026-10-12T04:00:00.000Z"),
            }),
            buildCandidate({ passageId: 9, previousStatus: "pending", previousTextHash: "h9" }),
            buildCandidate({
              passageId: 10,
              previousManifest: MANIFEST,
              previousStatus: "ready",
              previousTextHash: "h10",
              previousUpdatedAt: new Date("2026-10-12T05:00:00.000Z"),
            }),
          ],
          /**
           * insert：7・9 とも返った
           */
          [{ passageId: 9 }, { passageId: 7 }],
          /**
           * update：8 だけ（10 は select と update の間に別の実行が ready のまま確保した）
           */
          [{ passageId: 8 }],
        ])

        const claimed = await new DrizzlePassageAudioRepository(fake.db).claimTargets({ calculateTextHash, ...CLAIM_INPUT })

        expect(claimed).toEqual([
          { blocks: BLOCKS, claimedStatus: "generating", generationStartedAt: NOW, isRegenerationRequested: false, passageId: 7, previous: null },
          {
            blocks: BLOCKS,
            claimedStatus: "ready",
            generationStartedAt: NOW,
            isRegenerationRequested: true,
            passageId: 8,
            previous: { manifest: MANIFEST, status: "ready", textHash: "old" },
          },
          {
            blocks: BLOCKS,
            claimedStatus: "generating",
            generationStartedAt: NOW,
            isRegenerationRequested: false,
            passageId: 9,
            previous: { manifest: null, status: "pending", textHash: "h9" },
          },
        ])
        expect(findArgs(fake.queries[1], "values")?.[0]).toEqual([
          expect.objectContaining({ passageId: 7 }),
          expect.objectContaining({ passageId: 9 }),
        ])
        expect(renderQuery(fake.queries[2]).params.slice(1, 3)).toEqual([8, 10])
      })
    })
  })

  describe("completeClaim", () => {
    describe("正常系", () => {
      it("ready：claim のガード付きで FOR UPDATE で読み、本文の hash が同じなら ready とマニフェストを書く（作り直しの依頼は無いまま）", async () => {
        const fake = createFakeDb([[{ regenerateRequestedAt: null }], [{ blocks: BLOCKS }], []])

        const result = await new DrizzlePassageAudioRepository(fake.db).completeClaim(
          CLAIM,
          { billedCharacters: 120, kind: "ready", manifest: MANIFEST, textHash: `hash:${BLOCKS[0]?.text}`, voiceId: "Joanna" },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("ready")
        const lock = renderQuery(fake.queries[0])
        expect(lock.sql).toContain(CLAIM_CONDITION_SQL)
        expect(lock.sql).toMatch(/for update$/)
        expect(lock.params).toEqual(CLAIM_CONDITION_PARAMS)
        expect(findArgs(fake.queries[2], "set")?.[0]).toEqual({
          attemptCount: 0,
          billedCharacters: 120,
          generatedAt: NOW,
          generationStartedAt: null,
          lastError: null,
          manifest: MANIFEST,
          regenerateRequestedAt: null,
          status: "ready",
          textHash: `hash:${BLOCKS[0]?.text}`,
          updatedAt: NOW,
          voiceId: "Joanna",
        })
        expect(renderQuery(fake.queries[2]).sql).toContain(CLAIM_CONDITION_SQL)
      })

      it.each([
        ["確保の時刻より前に出された作り直しの依頼は消す", new Date("2026-10-13T02:00:00.000Z"), null],
        ["確保の時刻ちょうどの依頼も消す", CLAIM.generationStartedAt, null],
        ["確保の後に出された依頼は残す（次の実行で作り直す）", new Date("2026-10-13T02:55:00.000Z"), new Date("2026-10-13T02:55:00.000Z")],
      ])("ready：%s", async (_label, requestedAt, expected) => {
        const fake = createFakeDb([[{ regenerateRequestedAt: requestedAt }], [{ blocks: BLOCKS }], []])

        await new DrizzlePassageAudioRepository(fake.db).completeClaim(
          READY_CLAIM,
          { billedCharacters: 120, kind: "ready", manifest: MANIFEST, textHash: `hash:${BLOCKS[0]?.text}`, voiceId: "Joanna" },
          { calculateTextHash, now: NOW },
        )

        expect(findArgs(fake.queries[2], "set")?.[0]).toMatchObject({ regenerateRequestedAt: expected, status: "ready" })
      })

      it("ready のまま確保した行は、確保したときの状態（ready）でガードして読み、書く", async () => {
        const fake = createFakeDb([[{ regenerateRequestedAt: null }], [{ blocks: BLOCKS }], []])

        const result = await new DrizzlePassageAudioRepository(fake.db).completeClaim(
          READY_CLAIM,
          { billedCharacters: 120, kind: "ready", manifest: MANIFEST, textHash: `hash:${BLOCKS[0]?.text}`, voiceId: "Joanna" },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("ready")
        expect(renderQuery(fake.queries[0]).params).toEqual(READY_CLAIM_CONDITION_PARAMS)
        expect(renderQuery(fake.queries[2]).params.slice(-3)).toEqual(READY_CLAIM_CONDITION_PARAMS)
      })

      it("unchanged：status を ready にして updated_at を進め、失敗の回数とエラーを消す（manifest・text_hash・generated_at は前の成功のまま）", async () => {
        const fake = createFakeDb([[{ regenerateRequestedAt: null }], [{ blocks: BLOCKS }], []])

        const result = await new DrizzlePassageAudioRepository(fake.db).completeClaim(
          CLAIM,
          { kind: "unchanged", textHash: `hash:${BLOCKS[0]?.text}` },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("unchanged")
        expect(findArgs(fake.queries[2], "set")?.[0]).toEqual({
          attemptCount: 0,
          generationStartedAt: null,
          lastError: null,
          regenerateRequestedAt: null,
          status: "ready",
          updatedAt: NOW,
        })
        expect(renderQuery(fake.queries[2]).sql).toContain(CLAIM_CONDITION_SQL)
      })

      it("今の本文の hash が違えば ready にせず pending に戻して text_changed", async () => {
        const fake = createFakeDb([[{ regenerateRequestedAt: null }], [{ blocks: [{ text: "Edited.", type: "paragraph" }] }], []])

        const result = await new DrizzlePassageAudioRepository(fake.db).completeClaim(
          CLAIM,
          { billedCharacters: 120, kind: "ready", manifest: MANIFEST, textHash: `hash:${BLOCKS[0]?.text}`, voiceId: "Joanna" },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("text_changed")
        expect(findArgs(fake.queries[2], "set")?.[0]).toEqual({ generationStartedAt: null, status: "pending", updatedAt: NOW })
        expect(fake.queries).toHaveLength(3)
      })

      it("failed：回数の +1 と上限での failed を 1 文で更新し、manifest と text_hash は更新しない", async () => {
        const fake = createFakeDb([[{ regenerateRequestedAt: null }], [{ status: "failed" }]])

        const result = await new DrizzlePassageAudioRepository(fake.db).completeClaim(
          CLAIM,
          { error: "ThrottlingException: Rate exceeded", kind: "failed", maxAttempts: 3 },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("failed")
        /**
         * 失敗では本文を読まない
         */
        expect(fake.queries).toHaveLength(2)
        const { params, sql } = renderQuery(fake.queries[1])
        expect(sql).toContain([
          "set \"attempt_count\" = \"passage_audios\".\"attempt_count\" + 1, \"generation_started_at\" = $?, \"last_error\" = $?,",
          " \"status\" = CASE WHEN \"passage_audios\".\"attempt_count\" + 1 >= $? THEN 'failed' ELSE 'pending' END, \"updated_at\" = $?",
        ].join(""))
        expect(sql).not.toContain("\"manifest\"")
        expect(sql).not.toContain("\"text_hash\"")
        expect(sql).toContain(CLAIM_CONDITION_SQL)
        expect(params.slice(0, 4)).toEqual([null, "ThrottlingException: Rate exceeded", 3, "2026-10-13T03:00:00.000Z"])
      })

      it("failed で上限に達していなければ retry_later", async () => {
        const fake = createFakeDb([[{ regenerateRequestedAt: null }], [{ status: "pending" }]])

        const result = await new DrizzlePassageAudioRepository(fake.db).completeClaim(
          CLAIM,
          { error: "e", kind: "failed", maxAttempts: 3 },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("retry_later")
      })

      it.each([
        [1, "retry_later"],
        [3, "failed"],
      ] as const)("ready のまま確保した行の失敗：状態は ready のまま回数を +1 し、updated_at は今の値のまま（更新後の回数 %i → %s）", async (attemptCount, expected) => {
        const fake = createFakeDb([[{ regenerateRequestedAt: null }], [{ attemptCount }]])

        const result = await new DrizzlePassageAudioRepository(fake.db).completeClaim(
          READY_CLAIM,
          { error: "ThrottlingException: Rate exceeded", kind: "failed", maxAttempts: 3 },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe(expected)
        const { params, sql } = renderQuery(fake.queries[1])
        expect(sql).toContain([
          "set \"attempt_count\" = \"passage_audios\".\"attempt_count\" + 1, \"generation_started_at\" = $?, \"last_error\" = $?,",
          " \"updated_at\" = \"passage_audios\".\"updated_at\"",
        ].join(""))
        expect(readSetClause(sql)).not.toContain("\"status\"")
        expect(sql).toContain("returning \"attempt_count\"")
        expect(params).toEqual([null, "ThrottlingException: Rate exceeded", ...READY_CLAIM_CONDITION_PARAMS])
      })
    })

    describe("異常系", () => {
      it("ガードに当たらなければ（確保が取り直されていた）lost_claim で何も書かない", async () => {
        const fake = createFakeDb([[]])

        const result = await new DrizzlePassageAudioRepository(fake.db).completeClaim(
          CLAIM,
          { billedCharacters: 120, kind: "ready", manifest: MANIFEST, textHash: "h", voiceId: "Joanna" },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("lost_claim")
        expect(fake.queries).toHaveLength(1)
      })
    })
  })

  describe("releaseClaim", () => {
    describe("正常系", () => {
      it("失敗回数を変えずに、claim のガード付きで pending に戻す", async () => {
        const fake = createFakeDb([[]])

        await new DrizzlePassageAudioRepository(fake.db).releaseClaim(CLAIM)

        expect(findArgs(fake.queries[0], "set")?.[0]).toEqual({ generationStartedAt: null, status: "pending" })
        const { params, sql } = renderQuery(fake.queries[0])
        expect(sql).toContain(CLAIM_CONDITION_SQL)
        expect(params.slice(-3)).toEqual(CLAIM_CONDITION_PARAMS)
      })
    })
  })

  describe("releaseClaim（ready のまま確保した行）", () => {
    describe("正常系", () => {
      it("ready のまま generation_started_at だけを null にし、updated_at は今の値のまま（ガードは ready）", async () => {
        const fake = createFakeDb([[]])

        await new DrizzlePassageAudioRepository(fake.db).releaseClaim(READY_CLAIM)

        const { params, sql } = renderQuery(fake.queries[0])
        expect(sql).toContain("set \"generation_started_at\" = $?, \"updated_at\" = \"passage_audios\".\"updated_at\"")
        expect(readSetClause(sql)).not.toContain("\"status\"")
        expect(params).toEqual([null, ...READY_CLAIM_CONDITION_PARAMS])
      })
    })
  })

  describe("findRejected", () => {
    describe("正常系", () => {
      it("却下された問題の音声のうち、確保中でない行の passage_id とマニフェストを passage_id の順に返す", async () => {
        const rows = [{ manifest: MANIFEST, passageId: 3 }]
        const fake = createFakeDb([rows])

        const found = await new DrizzlePassageAudioRepository(fake.db).findRejected(STALE_BEFORE)

        expect(found).toEqual(rows)
        const { params, sql } = renderQuery(fake.queries[0])
        expect(sql).toContain("from \"passage_audios\" inner join \"passages\" on \"passages\".\"id\" = \"passage_audios\".\"passage_id\"")
        expect(sql).toContain(["where ((\"passages\".\"status\" = $?) and (", NOT_CLAIMED_RECENTLY_SQL, "))"].join(""))
        expect(sql).toContain("order by \"passage_audios\".\"passage_id\" asc")
        expect(params).toEqual(["rejected", "2026-10-13T02:30:00.000Z"])
      })
    })
  })

  describe("deleteByPassageId", () => {
    describe("正常系", () => {
      it("問題の音声の行を消す", async () => {
        const fake = createFakeDb([[]])

        await new DrizzlePassageAudioRepository(fake.db).deleteByPassageId(42)

        const { params, sql } = renderQuery(fake.queries[0])
        expect(sql).toBe("delete from \"passage_audios\" where \"passage_audios\".\"passage_id\" = $?")
        expect(params).toEqual([42])
      })
    })
  })

  describe("releaseStaleGenerating", () => {
    describe("正常系", () => {
      it("generating のまま startedBefore より前に確保された行を pending に戻し、件数を返す", async () => {
        const fake = createFakeDb([[{ id: 1 }, { id: 2 }]])

        const count = await new DrizzlePassageAudioRepository(fake.db).releaseStaleGenerating(new Date("2026-10-13T02:30:00.000Z"))

        expect(count).toBe(2)
        expect(findArgs(fake.queries[0], "set")?.[0]).toEqual({ generationStartedAt: null, status: "pending" })
        const { params, sql } = renderQuery(fake.queries[0])
        expect(sql).toContain("where ((\"passage_audios\".\"status\" = $?) and (\"passage_audios\".\"generation_started_at\" < $?))")
        expect(params.slice(-2)).toEqual(["generating", "2026-10-13T02:30:00.000Z"])
      })
    })
  })
})
