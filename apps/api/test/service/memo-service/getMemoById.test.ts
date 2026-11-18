import { Memo } from "@repo/domain"

import { MemoRepository } from "../../../src/repository"
import { getMemoById } from "../../../src/service/memo-service"

const mockFindById = vi.fn<(_0: number) => Promise<Memo | null>>()

const mockMemoRepository: MemoRepository = {
  create: vi.fn(),
  deleteById: vi.fn(),
  findAll: vi.fn(),
  findById: mockFindById,
  update: vi.fn(),
}

describe("getMemoById", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("メモが存在する場合、ok: true とメモを返す", async () => {
    const mockMemo: Memo = {
      body: "Test Body",
      createdAt: new Date(),
      id: 1,
      title: "Test Title",
      updatedAt: new Date(),
    }

    mockFindById.mockResolvedValue(mockMemo)

    const result = await getMemoById(1, { memoRepository: mockMemoRepository })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual(mockMemo)
    }
    expect(mockFindById).toHaveBeenCalledWith(1)
    expect(mockFindById).toHaveBeenCalledTimes(1)
  })

  it("メモが存在しない場合、ok: false と NOT_FOUND エラーを返す", async () => {
    mockFindById.mockResolvedValue(null)

    const result = await getMemoById(999, { memoRepository: mockMemoRepository })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe("NOT_FOUND")
      expect(result.error.statusCode).toBe(404)
      expect(result.error.message).toBe("Memo not found")
    }
    expect(mockFindById).toHaveBeenCalledWith(999)
    expect(mockFindById).toHaveBeenCalledTimes(1)
  })

  it("データベースエラー時にエラーをスローする", async () => {
    const mockError = new Error("Database connection failed")
    mockFindById.mockRejectedValue(mockError)

    await expect(getMemoById(1, { memoRepository: mockMemoRepository })).rejects.toThrow(
      "Database connection failed"
    )
    expect(mockFindById).toHaveBeenCalledWith(1)
  })
})
