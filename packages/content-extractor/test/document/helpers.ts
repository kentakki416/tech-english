import { readFileSync } from "node:fs"
import path from "node:path"

import type { DocumentBlock } from "../../src/document/convert-mdast-to-blocks"

/**
 * test/fixtures/document/ の fixture を読む
 */
export const readFixture = (name: string): string =>
  readFileSync(path.join(__dirname, "../fixtures/document", name), "utf8")

/**
 * 英単語をちょうど count 語並べた文（"word" を空白でつなぐ。文字数は 5 * count - 1）
 */
export const buildWords = (count: number): string => Array.from({ length: count }, () => "word").join(" ")

export const buildParagraph = (wordCount: number): DocumentBlock => ({ text: buildWords(wordCount), type: "paragraph" })

export const buildHeading = (text: string, depth: number): DocumentBlock => ({ headingDepth: depth, text, type: "heading" })

/**
 * 1 語の見出しと段落で、見出しを含めてちょうど wordCount 語の節を作る
 */
export const buildSection = (title: string, wordCount: number, depth = 2): DocumentBlock[] => [
  buildHeading(title, depth),
  buildParagraph(wordCount - 1),
]
