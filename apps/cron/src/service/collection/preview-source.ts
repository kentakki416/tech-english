import type { DocumentPreview, SourcePreview } from "../../lib/format-dry-run"

import { extractGitHubFile } from "./extract-github-file"
import { listGitHubTargetFiles } from "./list-github-target-files"
import type { CollectionDeps, CollectionRepo } from "./types"

/**
 * コミットの SHA の表示に使う先頭の文字数
 */
const SHORT_COMMIT_SHA_LENGTH = 7

/**
 * 試し実行（--dry-run）。ソースの文書を先頭から maxDocuments 件取得し、抽出と切り分けの結果を返す。
 *
 * 無効のソースも対象にする（登録直後に本文が取れるかを確かめてから有効にするため）。
 * GitHub は blob SHA に関係なく最新コミットの対象ファイルの先頭から取る。Repository の書き込みメソッドは呼ばない
 */
export const previewSource = async (
  input: { maxDocuments: number; sourceId: number },
  repo: CollectionRepo,
  deps: CollectionDeps,
): Promise<SourcePreview> => {
  const source = await repo.contentSourceRepository.findById(input.sourceId)
  if (!source) throw new Error(`Content source not found: id=${input.sourceId}`)
  if (source.fetchType === "website") {
    throw new Error(`Dry run for website sources is not supported yet: id=${source.id}`)
  }

  const commitSha = await deps.githubContentClient.getLatestCommitSha(source.repository, source.branch)
  const { files, isComplete } = await listGitHubTargetFiles({ commitSha, source }, deps)
  const documents: DocumentPreview[] = []
  for (const file of files.slice(0, input.maxDocuments)) {
    if (deps.isShuttingDown()) break
    const content = await deps.githubContentClient.getFileContent(source.repository, file.path, commitSha)
    try {
      documents.push({ document: extractGitHubFile(file.path, content), path: file.path, status: "extracted" })
    } catch (error) {
      documents.push({
        errorMessage: error instanceof Error ? error.message : String(error),
        path: file.path,
        status: "failed",
      })
    }
  }

  return {
    documents,
    fetchedFrom: `${source.repository} @ ${commitSha.slice(0, SHORT_COMMIT_SHA_LENGTH)}`,
    isComplete,
    sourceId: source.id,
    sourceName: source.name,
    targetDocumentCount: files.length,
  }
}
