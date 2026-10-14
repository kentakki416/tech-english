import { createDrizzleClient, DrizzleClient } from "@repo/db"

import { DrizzleAudioSynthesisUsageRepository } from "../../../src/repository/drizzle"

const NOW = new Date("2026-10-13T03:00:00.000Z")

/**
 * 記録したクエリを SQL の文字列にする。接続しない（Pool は最初のクエリまで接続しない）実物の client の toSQL を使う
 */
const renderClient = createDrizzleClient({ url: "postgresql://user:password@127.0.0.1:1/unused" })

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
 * db 直下（replica に流れる）と $primary の select / insert を分けて記録する偽物
 */
const createFakeDb = (result: unknown) => {
  const queries: { calls: RecordedCall[]; target: "primary" | "replica" }[] = []
  const startQuery = (target: "primary" | "replica", method: string) => (...args: unknown[]) => {
    const calls: RecordedCall[] = [{ args, method }]
    queries.push({ calls, target })
    return createRecordingQuery(result, calls)
  }
  const db = {
    $primary: { insert: startQuery("primary", "insert"), select: startQuery("primary", "select") },
    insert: startQuery("replica", "insert"),
    select: startQuery("replica", "select"),
  }
  return { db: db as unknown as DrizzleClient, queries }
}

/**
 * 記録した呼び出しを実物の client で組み立て直して SQL にする（バインド変数の番号は $? にそろえる）
 */
const renderQuery = (calls: RecordedCall[] | undefined) => {
  if (!calls) throw new Error("query was not recorded")
  const builder = calls.reduce<unknown>((current, call) => {
    const method = (current as Record<string, ((...args: unknown[]) => unknown) | undefined>)[call.method]
    if (!method) throw new Error(`unknown method: ${call.method}`)
    return method.apply(current, call.args)
  }, renderClient) as { toSQL: () => { params: unknown[]; sql: string } }
  const query = builder.toSQL()
  return { params: query.params, sql: query.sql.replace(/\$\d+/g, "$?") }
}

describe("DrizzleAudioSynthesisUsageRepository", () => {
  afterAll(async () => {
    await renderClient.$disconnect()
  })

  describe("record", () => {
    describe("正常系", () => {
      it("読み上げの課金：課金された文字数・問題・時刻（created_at と updated_at）を 1 行書き、word_audio_id は null", async () => {
        const fake = createFakeDb([])

        await new DrizzleAudioSynthesisUsageRepository(fake.db).record({ characters: 2400, now: NOW, target: { passageId: 42 } })

        const insert = fake.queries[0]
        expect(insert?.calls.find((call) => call.method === "values")?.args[0]).toEqual({
          characters: 2400,
          createdAt: NOW,
          passageId: 42,
          updatedAt: NOW,
          wordAudioId: null,
        })
        expect(renderQuery(insert?.calls).sql).toContain("insert into \"audio_synthesis_usages\"")
      })

      it("単語の発音の課金：word_audio_id で 1 行書き、passage_id は null", async () => {
        const fake = createFakeDb([])

        await new DrizzleAudioSynthesisUsageRepository(fake.db).record({ characters: 9, now: NOW, target: { wordAudioId: 7 } })

        expect(fake.queries[0]?.calls.find((call) => call.method === "values")?.args[0]).toEqual({
          characters: 9,
          createdAt: NOW,
          passageId: null,
          updatedAt: NOW,
          wordAudioId: 7,
        })
      })
    })
  })

  describe("sumCharactersSinceFromPrimary", () => {
    describe("正常系", () => {
      it("since 以降の文字数の合計を primary から読み、文字列で返る SUM を数値にする", async () => {
        const fake = createFakeDb([{ total: "123456" }])

        const total = await new DrizzleAudioSynthesisUsageRepository(fake.db).sumCharactersSinceFromPrimary(new Date("2026-10-01T00:00:00.000Z"))

        expect(total).toBe(123456)
        expect(fake.queries[0]?.target).toBe("primary")
        const { params, sql } = renderQuery(fake.queries[0]?.calls)
        expect(sql).toBe([
          "select COALESCE(SUM(\"characters\"), 0) from \"audio_synthesis_usages\"",
          " where \"audio_synthesis_usages\".\"created_at\" >= $?",
        ].join(""))
        expect(params).toEqual(["2026-10-01T00:00:00.000Z"])
      })
    })

    describe("異常系", () => {
      it("行が返らなければ 0", async () => {
        const fake = createFakeDb([])

        expect(await new DrizzleAudioSynthesisUsageRepository(fake.db).sumCharactersSinceFromPrimary(NOW)).toBe(0)
      })
    })
  })
})
