# step1-packages-collection

共有パッケージ `@repo/collection`（`packages/collection`）を作り、`apps/cron` の収集の処理を移す。cron の `collect:passages` の挙動は変えない。仕様と理由は [README](../README.md#収集の処理の共有パッケージ)。

## 対応内容

### 移すファイル

| cron（移す前） | `packages/collection`（移した後） |
| --- | --- |
| `src/client/github/github-content-client.ts`・`errors.ts`・`index.ts` | `src/github/github-content-client.ts`・`errors.ts`・`index.ts` |
| `src/const/collection.ts` | `src/const.ts` |
| `src/service/collection/*.ts`（`collect-passages`・`collect-github-source`・`extract-github-file`・`list-github-target-files`・`preview-source`・`reject-out-of-target-passages`・`replace-passage-candidates`・`types`・`index`） | `src/service/*.ts` |
| `src/repository/source-repository.ts`・`source-document-repository.ts` | `src/repository/source-repository.ts`・`source-document-repository.ts` |
| `src/repository/drizzle/source-repository.ts`・`source-document-repository.ts` | `src/repository/drizzle/source-repository.ts`・`source-document-repository.ts` |
| `src/repository/passage-repository.ts` の `findGeneratedOrGeneratingTitles`・`insertIgnoringDuplicates`・`rejectCollected` と `CreatePassageInput` | `src/repository/passage-repository.ts`（`CollectionPassageRepository`） |
| `src/repository/drizzle/passage-repository.ts` の上の 3 つの実装 | `src/repository/drizzle/passage-repository.ts`（`DrizzleCollectionPassageRepository`） |
| `test/service/collection/*`・`test/client/github/*`・`test/repository/drizzle/source*-repository.test.ts`・passage の Repository の上の 3 つのテスト | `test/` の同じ並び |

cron に残すもの：`src/task/collect-passages.ts`・`src/lib/parse-collect-args.ts`・`src/lib/format-dry-run.ts`、問題の生成の `PassageRepository`（収集の 3 つを除く）。

### パッケージの設定

`package.json`（`@repo/content-extractor` と同じ形）：

```json
{
  "name": "@repo/collection",
  "version": "1.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "sideEffects": false,
  "scripts": {
    "build": "tsc --project tsconfig.build.json",
    "clean": "rm -rf dist",
    "dev": "tsc --project tsconfig.build.json --watch",
    "lint": "eslint 'src/**/*.ts' 'test/**/*.ts'",
    "lint:fix": "eslint 'src/**/*.ts' 'test/**/*.ts' --fix",
    "test": "vitest run",
    "test:ci": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@repo/content-extractor": "workspace:^",
    "@repo/db": "workspace:^",
    "@repo/domain": "workspace:^",
    "@repo/logger": "workspace:^",
    "drizzle-orm": "<cron と同じ版>",
    "picomatch": "<cron と同じ版>",
    "zod": "<cron と同じ版>"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:^",
    "@repo/typescript-config": "workspace:^",
    "@types/node": "^24.10.1",
    "eslint": "^9.39.1",
    "typescript": "^5.9.3",
    "vitest": "^4.1.5"
  }
}
```

- `dependencies` は移したファイルが import しているものだけにする（cron の `package.json` から写し、cron で使わなくなったものは cron から外す）
- `tsconfig.json`・`tsconfig.build.json`・`vitest.config.ts` は `packages/content-extractor` と同じ
- `eslint.config.js` は cron と同じく `db-boundary` を入れる

```js
const baseConfig = require("@repo/eslint-config")
const dbBoundary = require("@repo/eslint-config/db-boundary")

module.exports = [
  ...baseConfig,
  ...dbBoundary,
  {
    ignores: ["dist/**", "vitest.config.ts"],
  },
]
```

### 公開する API（`src/index.ts`）

```ts
export * from "./const"
export { createGitHubContentClient, GitHubNotFoundError, GitHubRateLimitError } from "./github"
export type { GitHubTreeEntry, IGitHubContentClient } from "./github"
export { createCollectionRepositories } from "./repository"
export type { CollectionRepo } from "./repository"
export { collectPassages, collectSourceById, previewSource, SourceNotCollectableError } from "./service"
export type {
  CollectionDeps,
  CollectPassagesInput,
  CollectPassagesResult,
  CollectSourceByIdInput,
  DocumentPreview,
  SourcePreview,
  SourceCollectionResult,
  SourceCollectionStatus,
} from "./service"
```

- Repository の実装クラスは export しない。`createCollectionRepositories(db)` だけを export する

```ts
export const createCollectionRepositories = (db: DrizzleClient): CollectionRepo => ({
  passageRepository: new DrizzleCollectionPassageRepository(db),
  sourceDocumentRepository: new DrizzleSourceDocumentRepository(db),
  sourceRepository: new DrizzleSourceRepository(db),
})
```

- `CollectionRepo` は今の `service/collection/types.ts` のものを `src/repository/index.ts` に移す（`passageRepository` は `CollectionPassageRepository` そのもの。`Pick` は要らなくなる）

### GitHub の client の factory と閾値

`src/github/index.ts`：

```ts
export const createGitHubContentClient = (input: { contactUrl: string | undefined; token: string | undefined }): IGitHubContentClient =>
  new GitHubContentClient({ token: input.token, userAgent: buildCollectorUserAgent(input.contactUrl) })
```

`src/const.ts` に足す：

```ts
export const DEFAULT_MAX_DOCUMENTS_PER_SOURCE = 100

export const DEFAULT_MAX_PASSAGES_PER_RUN = 200

export const selectGitHubMinRateLimitRemaining = (token: string | undefined): number =>
  token ? GITHUB_MIN_RATE_LIMIT_REMAINING : GITHUB_UNAUTHENTICATED_MIN_RATE_LIMIT_REMAINING
```

- `selectGitHubMinRateLimitRemaining` は関数なので、`const.ts` ではなく `src/github/rate-limit.ts` に置いてもよい（`index.ts` から export する）
- cron の `src/env.ts` の `COLLECT_MAX_DOCUMENTS_PER_SOURCE`・`COLLECT_MAX_PASSAGES_PER_RUN` の既定値をこの 2 つの定数にする

### 1 ソースの収集の入口

`src/service/collect-source-by-id.ts`：

```ts
export type CollectSourceByIdInput = {
  githubMinRateLimitRemaining: number
  maxDocuments: number
  maxPassages: number
  now: Date
  sourceId: number
}

export class SourceNotCollectableError extends Error {
  constructor(
    public readonly reason: "disabled" | "not_found" | "website",
    sourceId: number,
  ) {
    super(`Source is not collectable: id=${sourceId} reason=${reason}`)
    this.name = "SourceNotCollectableError"
  }
}

export const findCollectableSource = async (sourceId: number, repo: CollectionRepo): Promise<GitHubRepositorySource> => {
  const source = await repo.sourceRepository.findById(sourceId)
  if (!source) throw new SourceNotCollectableError("not_found", sourceId)
  if (source.fetchType === "website") throw new SourceNotCollectableError("website", sourceId)
  if (!source.isEnabled) throw new SourceNotCollectableError("disabled", sourceId)
  return source
}

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
```

- `collectPassages` の `findTargetSources` の `--source-id` の分岐は `findCollectableSource` を使う（今の 3 つの `throw new Error(...)` を置き換える）。cron で `--source-id` に無効・サイトのソースを指定したときに exit 1 になるのは今までどおり
- `SourceNotCollectableError` の `reason` は worker が失敗の理由（`error` の列）に使う
- `findCollectableSource` はパッケージの外に export しない

### cron

`src/task/collect-passages.ts`：

```ts
import {
  collectPassages,
  createCollectionRepositories,
  createGitHubContentClient,
  DRY_RUN_MAX_DOCUMENTS,
  previewSource,
  selectGitHubMinRateLimitRemaining,
} from "@repo/collection"
import { logger } from "@repo/logger"

import { env } from "../env"
import { formatDryRun } from "../lib/format-dry-run"
import { parseCollectArgs } from "../lib/parse-collect-args"
import { runTask } from "../run-task"

runTask("collect-passages", async ({ db }) => {
  const args = parseCollectArgs(process.argv.slice(2))
  if (!env.GITHUB_CONTENT_TOKEN) {
    logger.warn("GITHUB_CONTENT_TOKEN is not set; GitHub API is used without authentication (60 req/h)")
  }

  const repo = createCollectionRepositories(db)
  const deps = {
    githubContentClient: createGitHubContentClient({ contactUrl: env.COLLECT_WEB_CONTACT_URL, token: env.GITHUB_CONTENT_TOKEN }),
  }

  if (args.dryRun && args.sourceId !== null) {
    const preview = await previewSource({ maxDocuments: DRY_RUN_MAX_DOCUMENTS, sourceId: args.sourceId }, repo, deps)
    process.stdout.write(formatDryRun(preview))
    return
  }

  const result = await collectPassages(
    {
      githubMinRateLimitRemaining: selectGitHubMinRateLimitRemaining(env.GITHUB_CONTENT_TOKEN),
      maxDocumentsPerSource: env.COLLECT_MAX_DOCUMENTS_PER_SOURCE,
      maxPassagesPerRun: env.COLLECT_MAX_PASSAGES_PER_RUN,
      now: new Date(),
      sourceId: args.sourceId,
    },
    repo,
    deps,
  )
})
```

- ログ（`collect-passages started`・`completed`）と `failedSourceIds` の throw は今のまま残す（上の例では省略）
- `src/service/index.ts` から `collection` を外す。`src/repository/index.ts`・`drizzle/index.ts` から移した Repository を外す
- 試し実行の結果の型（`SourcePreview`・`DocumentPreview`。今は `lib/format-dry-run.ts` にあり、`preview-source.ts` が import している）は、パッケージの `src/service/preview-source.ts` に移す。`lib/format-dry-run.ts` は `@repo/collection` から import する
- `package.json` に `"@repo/collection": "workspace:^"` を足す

### ドキュメント

| ファイル | 直すところ |
| --- | --- |
| `packages/collection/README.md`（新規） | 何を持つか（収集の service・GitHub の client・収集の Repository）、公開する API、cron と worker からの使い方、env を知らないこと、抽出の版を上げる規則は `@repo/content-extractor` の README |
| `apps/cron/CLAUDE.md` | 「collect:passages（英文の収集）」のファイルの表を、`@repo/collection` に移したことと、cron に残るもの（task・引数・試し実行の表示）に直す。冪等・rate limit・抽出の版などの規則の正本はパッケージの README に移し、cron からはリンクにする |
| ルートの `CLAUDE.md` | Packages に `packages/collection` を足す |
| `docs/spec/content-collection/README.md` | cron のファイルの説明があれば、パッケージに移したことを書く |

## 動作確認

```bash
pnpm install
pnpm --filter @repo/collection build
pnpm --filter @repo/collection test
pnpm --filter cron test
pnpm --filter cron exec tsc --noEmit
pnpm lint:fix
cd apps/cron && pnpm collect:passages --source-id=<GitHub のソースの id> --dry-run
cd apps/cron && pnpm collect:passages --source-id=<GitHub のソースの id>
cd apps/cron && pnpm build && node -e "require('@repo/collection')"
```

- [ ] 移したテストが `packages/collection` で通り、cron のテストの件数が移した分だけ減っている（テストを消していない）
- [ ] `--source-id` に無効・サイトのソースを指定すると、今までどおり exit 1
- [ ] 試し実行の表示が今までと同じ
- [ ] `apps/cron/src` に `client/github`・`service/collection`・`const/collection.ts` が残っていない（`git grep -n "service/collection\|client/github" apps/cron`）

テストの追加（`test/service/collect-source-by-id.test.ts`）：

| ケース | 期待 |
| --- | --- |
| 有効な GitHub のソース | `collectGitHubSource` と同じ結果を返す |
| ソースが無い・サイト・無効 | `SourceNotCollectableError`（`reason` が `not_found`・`website`・`disabled`）を throw し、GitHub API を呼ばない |
