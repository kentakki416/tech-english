import type { PrismaClient } from "@repo/db"

import { PrismaAudioSynthesisUsageRepository } from "../../../src/repository/prisma"

const NOW = new Date("2026-10-13T03:00:00.000Z")

const createFakePrisma = (sum: number | null = null) => {
  const create = vi.fn(async (_args: unknown) => ({}))
  const aggregate = vi.fn(async (_args: unknown) => ({ _sum: { characters: sum } }))
  const tx = { audioSynthesisUsage: { aggregate } }
  const transaction = vi.fn(async (callback: (_tx: unknown) => Promise<unknown>) => callback(tx))
  return {
    aggregate,
    create,
    prisma: { $transaction: transaction, audioSynthesisUsage: { aggregate, create } } as unknown as PrismaClient,
    transaction,
  }
}

describe("PrismaAudioSynthesisUsageRepository", () => {
  describe("record", () => {
    describe("正常系", () => {
      it("課金された文字数・問題・時刻（created_at と updated_at）を 1 行書く", async () => {
        const fake = createFakePrisma()

        await new PrismaAudioSynthesisUsageRepository(fake.prisma).record({ characters: 2400, now: NOW, passageId: 42 })

        expect(fake.create).toHaveBeenCalledWith({ data: { characters: 2400, createdAt: NOW, passageId: 42, updatedAt: NOW } })
      })
    })
  })

  describe("sumCharactersSinceFromPrimary", () => {
    describe("正常系", () => {
      it("$transaction（primary）の中で since 以降の文字数を合計する", async () => {
        const fake = createFakePrisma(123456)
        const since = new Date("2026-10-01T00:00:00.000Z")

        const total = await new PrismaAudioSynthesisUsageRepository(fake.prisma).sumCharactersSinceFromPrimary(since)

        expect(total).toBe(123456)
        expect(fake.transaction).toHaveBeenCalledTimes(1)
        expect(fake.aggregate).toHaveBeenCalledWith({ _sum: { characters: true }, where: { createdAt: { gte: since } } })
      })
    })

    describe("異常系", () => {
      it("記録が無ければ（SUM が null）0", async () => {
        const fake = createFakePrisma(null)

        expect(await new PrismaAudioSynthesisUsageRepository(fake.prisma).sumCharactersSinceFromPrimary(NOW)).toBe(0)
      })
    })
  })
})
