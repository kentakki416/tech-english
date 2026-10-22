import type { PassageChunk } from "@repo/content-extractor"

import type { FetchedPage } from "../../src/client/page-fetcher"

/**
 * URL の取り込みの service のユニットテストと Controller のインテグレーションテストで共有する、取得・抽出したページの値
 */
export const buildChunk = (overrides: Partial<PassageChunk> = {}): PassageChunk => ({
  blocks: [
    { text: "Getting started", type: "heading" },
    { text: "In this tutorial, you'll get a brief introduction to Go programming.", type: "paragraph" },
  ],
  contentHash: "hash-getting-started",
  rejectReasons: [],
  title: "Getting started",
  wordCount: 150,
  ...overrides,
})

export const buildFetchedPage = (overrides: Partial<FetchedPage> = {}): FetchedPage => ({
  chunks: [buildChunk()],
  contentHash: "hash-page",
  extractionVersion: "2026-10-18",
  normalizedUrl: "https://go.dev/doc/tutorial/getting-started",
  path: "/doc/tutorial/getting-started",
  title: "Tutorial: Get started with Go",
  wordCount: 900,
  ...overrides,
})
