import { authAccounts, eq, users } from "@repo/db"

import { DrizzleUserRepository } from "../../src/repository/drizzle/user-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"
import { createSubmittedAttempt } from "../fixture/learning-record"
import { insertGeneratedPassage, insertReadingAttempt } from "../fixture/passage"
import { insertVocabularyCard, insertVocabularyReview } from "../fixture/vocabulary"

const userRepository = new DrizzleUserRepository(testDb)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("UserRepository", () => {
  describe("正常系", () => {
    it("create したユーザーを findById / findByEmail で取得できる", async () => {
      const created = await userRepository.create({
        avatarUrl: "https://example.com/avatar.jpg",
        email: "test@example.com",
        name: "Test User",
      })

      expect(await userRepository.findById(created.id)).toEqual(created)
      expect(await userRepository.findByEmail("test@example.com")).toEqual(created)
    })

    it("省略した項目は null で保存される", async () => {
      const created = await userRepository.create({})

      expect(created).toMatchObject({ avatarUrl: null, email: null, name: null })
    })

    it("timezone を省略して作ると Asia/Tokyo になる", async () => {
      const created = await userRepository.create({ email: "tz@example.com" })

      expect(created.timezone).toBe("Asia/Tokyo")
      expect(await userRepository.findById(created.id)).toEqual(created)
    })

    it("create に timezone を渡すと保存される", async () => {
      const created = await userRepository.create({ email: "tz@example.com", timezone: "America/New_York" })

      expect(created.timezone).toBe("America/New_York")
      expect(await userRepository.findById(created.id)).toEqual(created)
    })

    it("updateProfile は名前とアイコンだけが変わり、メールとタイムゾーンは変わらない", async () => {
      const created = await userRepository.create({
        avatarUrl: "https://example.com/old.png",
        email: "profile@example.com",
        name: "Old Name",
        timezone: "UTC",
      })

      const updated = await userRepository.updateProfile(created.id, {
        avatarUrl: "https://example.com/new.png",
        name: "New Name",
      })

      expect(updated).toMatchObject({
        id: created.id,
        avatarUrl: "https://example.com/new.png",
        email: "profile@example.com",
        name: "New Name",
        timezone: "UTC",
      })
      expect(await userRepository.findById(created.id)).toEqual(updated)
    })

    it("updateProfile で avatarUrl に null を渡すとアイコンが消える", async () => {
      const created = await userRepository.create({ avatarUrl: "https://example.com/old.png", name: "Name" })

      const updated = await userRepository.updateProfile(created.id, { avatarUrl: null, name: "Name" })

      expect(updated.avatarUrl).toBeNull()
      expect(await userRepository.findById(created.id)).toEqual(updated)
    })

    it("updateTimezone でタイムゾーンだけが変わる", async () => {
      const created = await userRepository.create({ email: "tz@example.com", name: "Name" })

      const updated = await userRepository.updateTimezone(created.id, "Asia/Kolkata")

      expect(updated).toMatchObject({
        id: created.id,
        email: "tz@example.com",
        name: "Name",
        timezone: "Asia/Kolkata",
      })
      expect(await userRepository.findById(created.id)).toEqual(updated)
    })

    it("deleteById で削除され、findById が null を返し、紐づく auth_accounts も cascade で消える", async () => {
      const created = await userRepository.create({ email: "delete@example.com" })
      const other = await userRepository.create({ email: "other@example.com" })
      await testDb.insert(authAccounts).values([
        { provider: "github", providerAccountId: "github-1", userId: created.id },
        { provider: "github", providerAccountId: "github-2", userId: other.id },
      ])

      await userRepository.deleteById(created.id)

      expect(await userRepository.findById(created.id)).toBeNull()
      expect(await testDb.select().from(authAccounts).where(eq(authAccounts.userId, created.id))).toEqual([])
      /** 別のユーザーと、その auth_accounts は残る */
      expect(await userRepository.findById(other.id)).toEqual(other)
      expect(await testDb.select().from(authAccounts).where(eq(authAccounts.userId, other.id))).toHaveLength(1)
    })
  })

  describe("異常系", () => {
    it("存在しない id / email では null を返す", async () => {
      expect(await userRepository.findById(999999)).toBeNull()
      expect(await userRepository.findByEmail("missing@example.com")).toBeNull()
    })

    it("email が重複すると throw する", async () => {
      await userRepository.create({ email: "dup@example.com" })

      await expect(userRepository.create({ email: "dup@example.com" })).rejects.toThrow()
    })

    it("存在しない id の updateProfile / updateTimezone は throw する", async () => {
      await expect(userRepository.updateProfile(999999, { avatarUrl: null, name: "Name" })).rejects.toThrow()
      await expect(userRepository.updateTimezone(999999, "UTC")).rejects.toThrow()
    })

    it("存在しない id の deleteById は何もしない", async () => {
      await expect(userRepository.deleteById(999999)).resolves.toBeUndefined()
    })
  })
})

describe("UserRepository.findForAdmin", () => {
  const query = { limit: 50, offset: 0, order: "desc" as const, sort: "created_at" as const }

  /**
   * 登録日時を決めてユーザーを入れる
   */
  const insertUser = async (values: { createdAt: string; email?: string | null; name?: string | null }) => {
    const [user] = await testDb
      .insert(users)
      .values({ createdAt: new Date(values.createdAt), email: values.email === undefined ? `user-${values.createdAt}@example.com` : values.email, name: values.name === undefined ? "User" : values.name })
      .returning()
    return user
  }

  describe("正常系", () => {
    it("解いた回数は提出済みだけ、最後に学習した日は問題と単語帳の新しい方、ログイン方法は名前順の配列", async () => {
      const passage = await insertGeneratedPassage({ status: "published" })
      const questionIds = passage.questions.map((question) => question.id)
      const user = await insertUser({ createdAt: "2026-10-01T00:00:00.000Z", email: "alice@example.com", name: "alice" })
      await createSubmittedAttempt({ passageId: passage.passage.id, questionIds, studyDate: "2026-10-10", userId: user.id })
      await createSubmittedAttempt({ passageId: passage.passage.id, questionIds, studyDate: "2026-10-11", userId: user.id })
      await insertReadingAttempt(passage.passage.id, { userId: user.id })
      const card = await insertVocabularyCard(user.id, { lemma: "effect" })
      await insertVocabularyReview(user.id, card.id, { studyDate: "2026-10-13" })
      await testDb.insert(authAccounts).values([
        { provider: "google", providerAccountId: "g-1", userId: user.id },
        { provider: "github", providerAccountId: "h-1", userId: user.id },
      ])

      const result = await userRepository.findForAdmin(query)

      expect(result).toEqual({
        items: [
          {
            avatarUrl: null,
            createdAt: new Date("2026-10-01T00:00:00.000Z"),
            email: "alice@example.com",
            id: user.id,
            lastStudiedDate: "2026-10-13",
            name: "alice",
            providers: ["github", "google"],
            solvedAttempts: 2,
            timezone: "Asia/Tokyo",
            updatedAt: expect.any(Date),
          },
        ],
        total: 1,
      })
    })

    it("学習していないユーザーは解いた回数 0・最後に学習した日 null・ログイン方法は空の配列", async () => {
      await insertUser({ createdAt: "2026-10-01T00:00:00.000Z" })

      expect((await userRepository.findForAdmin(query)).items[0]).toMatchObject({ lastStudiedDate: null, providers: [], solvedAttempts: 0 })
    })

    it("名前・メールアドレスの部分一致で絞り込み、大文字・小文字を区別せず、% は文字として扱う", async () => {
      await insertUser({ createdAt: "2026-10-01T00:00:00.000Z", email: "alice@example.com", name: "Alice" })
      await insertUser({ createdAt: "2026-10-02T00:00:00.000Z", email: "bob@alice.dev", name: "bob" })
      await insertUser({ createdAt: "2026-10-03T00:00:00.000Z", email: "carol@example.com", name: "100%carol" })

      expect((await userRepository.findForAdmin({ ...query, q: "ALICE" })).items.map((item) => item.name)).toEqual(["bob", "Alice"])
      expect((await userRepository.findForAdmin({ ...query, q: "%" })).items.map((item) => item.name)).toEqual(["100%carol"])
    })

    it("並べ替え：最後に学習した日の新しい順で、学習していない人は最後（NULLS LAST）。同じ値は ID の順。offset と total", async () => {
      const passage = await insertGeneratedPassage({ status: "published" })
      const questionIds = passage.questions.map((question) => question.id)
      const never = await insertUser({ createdAt: "2026-10-01T00:00:00.000Z", name: "never" })
      const old = await insertUser({ createdAt: "2026-10-02T00:00:00.000Z", name: "old" })
      const recent = await insertUser({ createdAt: "2026-10-03T00:00:00.000Z", name: "recent" })
      await createSubmittedAttempt({ passageId: passage.passage.id, questionIds, studyDate: "2026-10-05", userId: old.id })
      await createSubmittedAttempt({ passageId: passage.passage.id, questionIds, studyDate: "2026-10-12", userId: recent.id })

      const sorted = await userRepository.findForAdmin({ ...query, sort: "last_studied_date" })
      expect(sorted.items.map((item) => item.id)).toEqual([recent.id, old.id, never.id])

      const ascending = await userRepository.findForAdmin({ ...query, order: "asc", sort: "last_studied_date" })
      expect(ascending.items.map((item) => item.id)).toEqual([old.id, recent.id, never.id])

      expect(await userRepository.findForAdmin({ ...query, limit: 1, offset: 1 })).toMatchObject({ items: [{ id: old.id }], total: 3 })
    })
  })

  describe("異常系", () => {
    it("範囲外のページは空の配列で、total は全体の件数", async () => {
      await insertUser({ createdAt: "2026-10-01T00:00:00.000Z" })
      await insertUser({ createdAt: "2026-10-02T00:00:00.000Z" })

      expect(await userRepository.findForAdmin({ ...query, offset: 50 })).toEqual({ items: [], total: 2 })
    })

    it("ユーザーがいなければ空の配列と 0", async () => {
      expect(await userRepository.findForAdmin(query)).toEqual({ items: [], total: 0 })
    })
  })
})
