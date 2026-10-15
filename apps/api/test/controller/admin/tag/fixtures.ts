import { contentSources, contentSourceTags, tags } from "@repo/db"

import { testDb } from "../../setup"

type TagInsert = typeof tags.$inferInsert

/**
 * admin のタグ API のインテグレーションテストで共有する DB への投入
 */
export const insertTag = async (overrides: Partial<TagInsert> = {}) => {
  const [row] = await testDb
    .insert(tags)
    .values({ color: "blue", name: "React", ...overrides })
    .returning()
  return row
}

export const insertSource = async (repository: string) => {
  const [row] = await testDb
    .insert(contentSources)
    .values({
      branch: "main",
      excludeGlobs: [],
      fetchType: "github_repository",
      includeGlobs: ["docs/**/*.md"],
      kind: "docs",
      licenseSpdx: "MIT",
      licenseUrl: "https://example.com/LICENSE",
      name: repository,
      publicUrlStripPrefix: "",
      publicUrlTemplate: "https://example.com/{path}",
      repository,
    })
    .returning()
  return row
}

export const attachTag = async (contentSourceId: number, tagId: number) => {
  await testDb.insert(contentSourceTags).values({ contentSourceId, tagId })
}
