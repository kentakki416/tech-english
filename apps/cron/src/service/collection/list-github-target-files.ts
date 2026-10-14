import type { GitHubRepositorySource } from "@repo/domain"
import { logger } from "@repo/logger"

import type { GitHubTreeEntry, IGitHubContentClient } from "../../client/github"
import { MAX_MARKDOWN_FILE_BYTES } from "../../const/collection"
import { findGlobBaseDirectories, isTargetPath } from "../../lib/path-filter"

export type GitHubTargetFiles = {
  /**
   * 対象のファイル（blob）を path の昇順で。path はリポジトリのルートからのパス
   */
  files: GitHubTreeEntry[]
  /**
   * false はツリーが切り詰められて、対象のファイルを全部は列挙できなかった（commit SHA を更新しない）
   */
  isComplete: boolean
}

const MARKDOWN_EXTENSION_PATTERN = /\.mdx?$/i

const comparePath = (a: GitHubTreeEntry, b: GitHubTreeEntry): number => {
  if (a.path === b.path) return 0
  return a.path < b.path ? -1 : 1
}

/**
 * blob で、拡張子が .md / .mdx で、対象パスに合い、大きすぎないものに絞って path の昇順にする
 */
const filterTargetFiles = (entries: GitHubTreeEntry[], source: GitHubRepositorySource): GitHubTreeEntry[] =>
  entries
    .filter(
      (entry) =>
        entry.type === "blob" &&
        MARKDOWN_EXTENSION_PATTERN.test(entry.path) &&
        isTargetPath(entry.path, source) &&
        (entry.size ?? 0) <= MAX_MARKDOWN_FILE_BYTES,
    )
    .sort(comparePath)

/**
 * コミットのルートの tree から、ディレクトリのセグメントを非再帰でたどって tree の SHA を求める。無ければ null
 */
const findSubtreeSha = async (
  input: { commitSha: string; directory: string; repository: string },
  deps: { githubContentClient: IGitHubContentClient },
): Promise<string | null> => {
  let treeSha = input.commitSha
  for (const segment of input.directory.split("/")) {
    const { entries } = await deps.githubContentClient.getTree(input.repository, treeSha, { isRecursive: false })
    const entry = entries.find((candidate) => candidate.path === segment && candidate.type === "tree")
    if (!entry) return null
    treeSha = entry.sha
  }
  return treeSha
}

/**
 * コミットのファイル一覧を trees API で取り、対象のファイルに絞る。
 *
 * trees API は巨大なリポジトリで結果が切り詰められる（truncated）ので、そのときは対象パスの glob の固定部分の
 * ディレクトリごとにサブツリーを取り直す。固定部分が無い glob（`**` で始まるもの）がある、または取り直しても
 * 切り詰められた場合は、取れた分だけを返して isComplete: false にする
 */
export const listGitHubTargetFiles = async (
  input: { commitSha: string; source: GitHubRepositorySource },
  deps: { githubContentClient: IGitHubContentClient },
): Promise<GitHubTargetFiles> => {
  const { commitSha, source } = input
  const tree = await deps.githubContentClient.getTree(source.repository, commitSha, { isRecursive: true })
  if (!tree.isTruncated) return { files: filterTargetFiles(tree.entries, source), isComplete: true }

  const directories = findGlobBaseDirectories(source.includeGlobs)
  if (directories.includes("")) {
    logger.warn("GitHub tree is truncated and include globs have no base directory", {
      includeGlobs: source.includeGlobs,
      sourceId: source.id,
    })
    return { files: filterTargetFiles(tree.entries, source), isComplete: false }
  }

  let isComplete = true
  const entries: GitHubTreeEntry[] = []
  for (const directory of directories) {
    const subtreeSha = await findSubtreeSha({ commitSha, directory, repository: source.repository }, deps)
    if (subtreeSha === null) continue
    const subtree = await deps.githubContentClient.getTree(source.repository, subtreeSha, { isRecursive: true })
    if (subtree.isTruncated) {
      logger.warn("GitHub subtree is truncated", { directory, sourceId: source.id })
      isComplete = false
    }
    entries.push(...subtree.entries.map((entry) => ({ ...entry, path: `${directory}/${entry.path}` })))
  }
  return { files: filterTargetFiles(entries, source), isComplete }
}
