import { eq, reminderSettings, sql, users } from "@repo/db"

import { DrizzleReminderSettingRepository } from "../../src/repository/drizzle/reminder-setting-repository"
import { PrismaReminderSettingRepository } from "../../src/repository/prisma/reminder-setting-repository"
import type { ReminderSettingRepository } from "../../src/repository/reminder-setting-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb, testPrisma } from "../controller/setup"
import { insertAttemptUser } from "../fixture/passage"
import { insertReminderSetting, selectReminderSettingRows } from "../fixture/reminder"

/**
 * Prisma / Drizzle の両実装が ReminderSettingRepository として同じ振る舞いをすることを確かめる。
 * DI で使うのは Drizzle 実装だが、Prisma 実装へ戻せる状態を保つために両方を検証する
 */
const drizzleRepository = new DrizzleReminderSettingRepository(testDb)
const prismaRepository = new PrismaReminderSettingRepository(testPrisma)

const implementations: [string, ReminderSettingRepository][] = [
  ["Drizzle", drizzleRepository],
  ["Prisma", prismaRepository],
]

const REMINDER_INPUT = {
  isEnabled: true,
  time: "21:15",
  weekdays: [1, 3, 5],
}

/**
 * updated_at が進んだことを確かめるため、行の updated_at を過去に戻すときの値
 */
const PAST_UPDATED_AT = new Date("2026-01-01T00:00:00.000Z")

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe.each(implementations)("%s ReminderSettingRepository", (_name, reminderSettingRepository) => {
  describe("findByUserId", () => {
    describe("正常系", () => {
      it("そのユーザーの設定を返す（time は \"HH:mm\"）", async () => {
        const user = await insertAttemptUser()
        const otherUser = await insertAttemptUser()
        const row = await insertReminderSetting(user.id, { isEnabled: false, time: "07:45", weekdays: [2, 4, 6] })
        await insertReminderSetting(otherUser.id, { time: "22:00", weekdays: [7] })

        expect(await reminderSettingRepository.findByUserId(user.id)).toEqual({
          id: row.id,
          isEnabled: false,
          time: "07:45",
          userId: user.id,
          weekdays: [2, 4, 6],
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      })
    })

    describe("異常系", () => {
      it("設定の無いユーザーは null", async () => {
        const user = await insertAttemptUser()
        const otherUser = await insertAttemptUser()
        await insertReminderSetting(otherUser.id)

        expect(await reminderSettingRepository.findByUserId(user.id)).toBeNull()
      })

      it("users の行を消すと cascade で設定も消え、null になる", async () => {
        const user = await insertAttemptUser()
        await reminderSettingRepository.upsertByUserId(user.id, REMINDER_INPUT)

        await testDb.delete(users).where(eq(users.id, user.id))

        expect(await reminderSettingRepository.findByUserId(user.id)).toBeNull()
        expect(await testDb.$count(reminderSettings)).toBe(0)
      })
    })
  })

  describe("upsertByUserId", () => {
    describe("正常系", () => {
      it("行が無ければ作成し、findByUserId で同じ値が取れる（time は \"HH:mm\"、weekdays は渡した配列）", async () => {
        const user = await insertAttemptUser()

        const saved = await reminderSettingRepository.upsertByUserId(user.id, REMINDER_INPUT)

        expect(saved).toEqual({
          id: expect.any(Number),
          ...REMINDER_INPUT,
          userId: user.id,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
        expect(await reminderSettingRepository.findByUserId(user.id)).toEqual(saved)
        const rows = await selectReminderSettingRows(user.id)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ id: saved.id, isEnabled: true, time: "21:15:00", userId: user.id, weekdays: [1, 3, 5] })
      })

      it("2 回目は同じ行を上書きし（id が同じ・行は 1 つのまま）、updatedAt が進む", async () => {
        const user = await insertAttemptUser()
        const first = await reminderSettingRepository.upsertByUserId(user.id, REMINDER_INPUT)
        await testDb.update(reminderSettings).set({ updatedAt: PAST_UPDATED_AT }).where(eq(reminderSettings.id, first.id))

        const second = await reminderSettingRepository.upsertByUserId(user.id, {
          isEnabled: false,
          time: "07:00",
          weekdays: [6, 7],
        })

        expect(second).toEqual({
          id: first.id,
          isEnabled: false,
          time: "07:00",
          userId: user.id,
          weekdays: [6, 7],
          createdAt: first.createdAt,
          updatedAt: expect.any(Date),
        })
        expect(second.updatedAt.getTime()).toBeGreaterThan(PAST_UPDATED_AT.getTime())
        const rows = await selectReminderSettingRows(user.id)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ id: first.id, isEnabled: false, time: "07:00:00", weekdays: [6, 7] })
        expect(rows[0].updatedAt.getTime()).toBeGreaterThan(PAST_UPDATED_AT.getTime())
      })

      it.each(["00:00", "23:45"])("time の境界 %s が往復で変わらない", async (time) => {
        const user = await insertAttemptUser()

        const saved = await reminderSettingRepository.upsertByUserId(user.id, { ...REMINDER_INPUT, time })

        expect(saved.time).toBe(time)
        expect((await reminderSettingRepository.findByUserId(user.id))?.time).toBe(time)
        expect((await selectReminderSettingRows(user.id))[0]).toMatchObject({ time: `${time}:00` })
      })

      it("他のユーザーの設定は変えない", async () => {
        const user = await insertAttemptUser()
        const otherUser = await insertAttemptUser()
        const others = await insertReminderSetting(otherUser.id, { time: "22:00", weekdays: [7] })

        await reminderSettingRepository.upsertByUserId(user.id, REMINDER_INPUT)

        expect(await selectReminderSettingRows(otherUser.id)).toEqual([others])
      })
    })

    describe("異常系", () => {
      it("存在しない userId は外部キー違反で throw し、行を作らない", async () => {
        await expect(reminderSettingRepository.upsertByUserId(999_999, REMINDER_INPUT)).rejects.toThrow()
        expect(await testDb.$count(reminderSettings)).toBe(0)
      })
    })
  })
})

describe("Prisma ReminderSettingRepository の weekdays の検証", () => {
  describe("異常系", () => {
    it.each([
      ["配列でない", { day: 1 }],
      ["範囲外の値（0）", [0, 1]],
      ["範囲外の値（8）", [8]],
      ["整数でない", [1.5]],
      ["文字列", ["1"]],
    ])("DB の weekdays が曜日番号の配列でない（%s）と findByUserId が throw する", async (_label, weekdays) => {
      const user = await insertAttemptUser()
      await testDb.insert(reminderSettings).values({
        isEnabled: true,
        time: "21:00",
        userId: user.id,
        /**
         * API を通さずに不正な値を入れる（DB には weekdays の値域の制約が無い）
         */
        weekdays: sql`${JSON.stringify(weekdays)}::jsonb`,
      })

      await expect(prismaRepository.findByUserId(user.id)).rejects.toThrow()
    })
  })
})

describe("ReminderSettingRepository の実装間の互換性", () => {
  describe("正常系", () => {
    it.each(["21:15", "00:00", "23:45"])("Drizzle で保存した %s を Prisma で読んでも同じ値になる", async (time) => {
      const user = await insertAttemptUser()

      const saved = await drizzleRepository.upsertByUserId(user.id, { ...REMINDER_INPUT, time })

      expect(await prismaRepository.findByUserId(user.id)).toEqual(saved)
    })

    it.each(["21:15", "00:00", "23:45"])("Prisma で保存した %s を Drizzle で読んでも同じ値になる", async (time) => {
      const user = await insertAttemptUser()

      const saved = await prismaRepository.upsertByUserId(user.id, { ...REMINDER_INPUT, time })

      expect(await drizzleRepository.findByUserId(user.id)).toEqual(saved)
    })
  })
})
