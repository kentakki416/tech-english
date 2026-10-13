import { createDrizzleClient, DrizzleClient } from "@repo/db"
import type { PassageAudioManifest, PassageBlock } from "@repo/domain"

import type { AudioClaim } from "../../../src/repository"
import { DrizzlePassageAudioRepository } from "../../../src/repository/drizzle"

const NOW = new Date("2026-10-13T03:00:00.000Z")

const CLAIM: AudioClaim = { generationStartedAt: new Date("2026-10-13T02:50:00.123Z"), passageId: 42 }

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
 * トランザクション（と db 直下）の select / insert / update を記録する偽物。results はクエリを始めた順に返す値
 */
const createFakeDb = (results: unknown[]) => {
  const queries: RecordedCall[][] = []
  const startQuery = (method: string) => (...args: unknown[]) => {
    const calls: RecordedCall[] = [{ args, method }]
    const result = results[queries.length] ?? []
    queries.push(calls)
    return createRecordingQuery(result, calls)
  }
  const tx = { insert: startQuery("insert"), select: startQuery("select"), update: startQuery("update") }
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

describe("DrizzlePassageAudioRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await renderClient.$disconnect()
  })

  describe("claimTargets", () => {
    describe("正常系", () => {
      it("公開済みで、行が無い・pending・公開し直された ready・voice が今と違う ready の問題を古い順に FOR UPDATE OF passages SKIP LOCKED で選ぶ", async () => {
        const fake = createFakeDb([[]])

        const claimed = await new DrizzlePassageAudioRepository(fake.db).claimTargets({ calculateTextHash, limit: 20, now: NOW, voiceId: "Joanna" })

        expect(claimed).toEqual([])
        expect(fake.transaction).toHaveBeenCalledTimes(1)
        const { params, sql } = renderQuery(fake.queries[0])
        expect(sql).toContain("from \"passages\" left join \"passage_audios\" on \"passage_audios\".\"passage_id\" = \"passages\".\"id\"")
        expect(sql).toContain([
          "where ((\"passages\".\"status\" = $?) and ((((\"passage_audios\".\"id\" is null)) or (\"passage_audios\".\"status\" = $?)",
          " or (((\"passage_audios\".\"status\" = $?) and (\"passage_audios\".\"updated_at\" < \"passages\".\"published_at\")))",
          " or (((\"passage_audios\".\"status\" = $?) and (\"passage_audios\".\"voice_id\" <> $?))))))",
        ].join(""))
        expect(sql).toContain("order by \"passages\".\"published_at\" asc, \"passages\".\"id\" asc limit $? for update of \"passages\" skip locked")
        expect(params).toEqual(["published", "pending", "ready", "ready", "Joanna", 20])
        /**
         * 対象が無ければ insert しない
         */
        expect(fake.queries).toHaveLength(1)
      })

      it("取れた行を insert し、既にある行は pending / ready のときだけ generating にする（manifest と text_hash は触らない）", async () => {
        const fake = createFakeDb([
          [
            { blocks: BLOCKS, passageId: 7, previousManifest: null, previousStatus: null, previousTextHash: null },
            { blocks: BLOCKS, passageId: 8, previousManifest: MANIFEST, previousStatus: "ready", previousTextHash: "old" },
          ],
          [{ passageId: 8 }, { passageId: 7 }],
        ])

        await new DrizzlePassageAudioRepository(fake.db).claimTargets({ calculateTextHash, limit: 20, now: NOW, voiceId: "Joanna" })

        expect(findArgs(fake.queries[1], "values")?.[0]).toEqual([
          { generationStartedAt: NOW, passageId: 7, status: "generating", textHash: `hash:${BLOCKS[0]?.text}`, updatedAt: NOW, voiceId: "Joanna" },
          { generationStartedAt: NOW, passageId: 8, status: "generating", textHash: `hash:${BLOCKS[0]?.text}`, updatedAt: NOW, voiceId: "Joanna" },
        ])
        const { params, sql } = renderQuery(fake.queries[1])
        expect(sql).toContain([
          "on conflict (\"passage_id\") do update set \"generation_started_at\" = $?, \"status\" = $?, \"updated_at\" = $?",
          " where \"passage_audios\".\"status\" in ($?, $?)",
        ].join(""))
        expect(sql).toContain("returning \"passage_id\"")
        expect(sql).not.toContain("\"manifest\" =")
        expect(sql).not.toContain("\"text_hash\" =")
        expect(params.slice(-5)).toEqual(["2026-10-13T03:00:00.000Z", "generating", "2026-10-13T03:00:00.000Z", "pending", "ready"])
      })

      it("RETURNING で返った行だけを、select の順（published_at → id）で前の行と確保の時刻付きで返す", async () => {
        const fake = createFakeDb([
          [
            { blocks: BLOCKS, passageId: 7, previousManifest: null, previousStatus: null, previousTextHash: null },
            { blocks: BLOCKS, passageId: 8, previousManifest: MANIFEST, previousStatus: "ready", previousTextHash: "old" },
            { blocks: BLOCKS, passageId: 9, previousManifest: null, previousStatus: "pending", previousTextHash: "h9" },
          ],
          /**
           * 8 は select と insert の間に別の実行が確保した（conflict の更新の条件に当たらず返らない）
           */
          [{ passageId: 9 }, { passageId: 7 }],
        ])

        const claimed = await new DrizzlePassageAudioRepository(fake.db).claimTargets({ calculateTextHash, limit: 20, now: NOW, voiceId: "Joanna" })

        expect(claimed).toEqual([
          { blocks: BLOCKS, generationStartedAt: NOW, passageId: 7, previous: null },
          { blocks: BLOCKS, generationStartedAt: NOW, passageId: 9, previous: { manifest: null, status: "pending", textHash: "h9" } },
        ])
      })
    })
  })

  describe("completeClaim", () => {
    describe("正常系", () => {
      it("ready：claim のガード付きで FOR UPDATE で読み、本文の hash が同じなら ready とマニフェストを書く", async () => {
        const fake = createFakeDb([[{ id: 1 }], [{ blocks: BLOCKS }], []])

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
          status: "ready",
          textHash: `hash:${BLOCKS[0]?.text}`,
          updatedAt: NOW,
          voiceId: "Joanna",
        })
        expect(renderQuery(fake.queries[2]).sql).toContain(CLAIM_CONDITION_SQL)
      })

      it("unchanged：status を ready にして updated_at を進め、失敗の回数とエラーを消す（manifest・text_hash・generated_at は前の成功のまま）", async () => {
        const fake = createFakeDb([[{ id: 1 }], [{ blocks: BLOCKS }], []])

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
          status: "ready",
          updatedAt: NOW,
        })
        expect(renderQuery(fake.queries[2]).sql).toContain(CLAIM_CONDITION_SQL)
      })

      it("今の本文の hash が違えば ready にせず pending に戻して text_changed", async () => {
        const fake = createFakeDb([[{ id: 1 }], [{ blocks: [{ text: "Edited.", type: "paragraph" }] }], []])

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
        const fake = createFakeDb([[{ id: 1 }], [{ status: "failed" }]])

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
        const fake = createFakeDb([[{ id: 1 }], [{ status: "pending" }]])

        const result = await new DrizzlePassageAudioRepository(fake.db).completeClaim(
          CLAIM,
          { error: "e", kind: "failed", maxAttempts: 3 },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("retry_later")
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
