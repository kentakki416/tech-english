import type { Tag } from "@repo/domain"

import type { TagRepository } from "../../../src/repository"

/**
 * tag-service のユニットテストで共有する Repository のモックと値
 */
export const createMockTagRepository = () => ({
  create: vi.fn<TagRepository["create"]>(),
  delete: vi.fn<TagRepository["delete"]>(),
  findAll: vi.fn<TagRepository["findAll"]>(),
  findByIds: vi.fn<TagRepository["findByIds"]>(),
  findColors: vi.fn<TagRepository["findColors"]>(),
  update: vi.fn<TagRepository["update"]>(),
})

export const buildTag = (overrides: Partial<Tag> = {}): Tag => ({
  id: 1,
  color: "blue",
  name: "React",
  createdAt: new Date("2026-10-10T00:00:00.000Z"),
  updatedAt: new Date("2026-10-10T00:00:00.000Z"),
  ...overrides,
})
