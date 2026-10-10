import { Memo } from "@repo/domain"
import { FakeEventTracker } from "@repo/events"

import { CreateMemoInput, MemoRepository } from "../../../src/repository"
import { createMemo } from "../../../src/service/memo-service"

// モック
const mockCreate = vi.fn<(_0: CreateMemoInput) => Promise<Memo>>()

const mockMemoRepository: MemoRepository = {
  create: mockCreate,
  deleteById: vi.fn(),
  findAll: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
}

const eventTracker = new FakeEventTracker()

describe("createMemo", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("メモを作成して ok: true で返す", async () => {
    // Arrange
    const input: CreateMemoInput = {
      body: "New Body",
      title: "New Title",
    }

    const mockMemo: Memo = {
      body: "New Body",
      createdAt: new Date(),
      id: 1,
      title: "New Title",
      updatedAt: new Date(),
    }

    mockCreate.mockResolvedValue(mockMemo)

    // Act
    const result = await createMemo(input, { memoRepository: mockMemoRepository }, { eventTracker, userId: 1 })

    // Assert
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual(mockMemo)
    }
    expect(mockCreate).toHaveBeenCalledWith(input)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it("データベースエラー時にエラーをスローする", async () => {
    // Arrange
    const input: CreateMemoInput = {
      body: "New Body",
      title: "New Title",
    }

    const mockError = new Error("Database connection failed")
    mockCreate.mockRejectedValue(mockError)

    // Act & Assert
    await expect(createMemo(input, { memoRepository: mockMemoRepository }, { eventTracker, userId: 1 })).rejects.toThrow(
      "Database connection failed"
    )
    expect(mockCreate).toHaveBeenCalledWith(input)
  })
})
