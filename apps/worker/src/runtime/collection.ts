import type { DrizzleClient } from "@repo/db"

import { GitHubContentClient } from "../client/github"
import {
  DrizzlePassageRepository,
  DrizzleSourceDocumentRepository,
  DrizzleSourceRepository,
} from "../repository/drizzle"
import type { CollectSourceByIdInput } from "../service/collection/collect-source-by-id"
import type { SourceCollectionResult } from "../service/collection/types"

/**
 * 収集の service を、Repository と GitHub の client を結線した形で使う
 */
export type CollectionRuntime = {
  collectSourceById: (input: CollectSourceByIdInput) => Promise<SourceCollectionResult>
}

/**
 * 収集の service（@repo/content-extractor を値として読む）を、collect-source のジョブで初めて使うときに import() で読む。
 * @repo/content-extractor の index は jsdom（サイトの取得）も読むので、起動時に読むと worker の他のジョブと起動が重くなり、メモリも使い続けるため。
 * 返す関数は何度呼んでも import() を 1 回しかしない（2 回目からは同じ Promise を返す）
 */
export const createCollectionRuntimeLoader = (input: {
  contactUrl: string | undefined
  db: DrizzleClient
  token: string | undefined
}): (() => Promise<CollectionRuntime>) => {
  let runtime: Promise<CollectionRuntime> | null = null
  return async () => {
    runtime ??= Promise.all([import("../service/collection/collect-source-by-id.js"), import("@repo/content-extractor")]).then(
      ([collection, contentExtractor]) => {
        const repo = {
          passageRepository: new DrizzlePassageRepository(input.db),
          sourceDocumentRepository: new DrizzleSourceDocumentRepository(input.db),
          sourceRepository: new DrizzleSourceRepository(input.db),
        }
        const deps = {
          githubContentClient: new GitHubContentClient({
            token: input.token,
            userAgent: contentExtractor.buildCollectorUserAgent(input.contactUrl),
          }),
        }
        return { collectSourceById: async (collectInput) => collection.collectSourceById(collectInput, repo, deps) }
      },
    )
    return runtime
  }
}
