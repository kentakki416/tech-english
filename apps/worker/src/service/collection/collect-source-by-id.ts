import { checkSourceCollectability, type GitHubRepositorySource } from "@repo/domain"

import { collectGitHubSource } from "./collect-github-source"
import { SourceNotCollectableError } from "./errors"
import type { CollectionDeps, CollectionRepo, SourceCollectionResult } from "./types"

export type CollectSourceByIdInput = {
  githubMinRateLimitRemaining: number
  maxDocuments: number
  maxPassages: number
  now: Date
  sourceId: number
}

const findCollectableSource = async (sourceId: number, repo: CollectionRepo): Promise<GitHubRepositorySource> => {
  const collectability = checkSourceCollectability(await repo.sourceRepository.findById(sourceId))
  if (!collectability.isCollectable) throw new SourceNotCollectableError(collectability.reason, sourceId)
  return collectability.source
}

/**
 * 1 ソースを収集する。収集できないソースは GitHub API を呼ばずに SourceNotCollectableError を throw する
 */
export const collectSourceById = async (
  input: CollectSourceByIdInput,
  repo: CollectionRepo,
  deps: CollectionDeps,
): Promise<SourceCollectionResult> => {
  const source = await findCollectableSource(input.sourceId, repo)
  return collectGitHubSource(
    {
      maxDocuments: input.maxDocuments,
      maxPassages: input.maxPassages,
      minRateLimitRemaining: input.githubMinRateLimitRemaining,
      now: input.now,
      source,
    },
    repo,
    deps,
  )
}
