# step4-worker-collect-source

worker に `collect-source` のジョブを足す。記録を実行中にし、`@repo/collection` の `collectSourceById` で 1 ソースを収集して、結果を記録に書く。仕様と理由は [README](../README.md#api-が-queue-に積みworker-が実行する)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/worker/package.json` | `@repo/collection`・`@repo/content-extractor`（`@repo/collection` が使う）を足す |
| `apps/worker/src/env.ts` | `GITHUB_CONTENT_TOKEN`・`COLLECT_MAX_DOCUMENTS_PER_SOURCE`・`COLLECT_MAX_PASSAGES_PER_RUN`・`COLLECT_WEB_CONTACT_URL`（cron と同じ定義。既定値は `@repo/collection` の定数） |
| `apps/worker/src/repository/source-collection-run-repository.ts`（新規）・`drizzle/source-collection-run-repository.ts`（新規）・`index.ts` | 実行中にする・結果を書く |
| `apps/worker/src/runtime/collection.ts`（新規） | `@repo/collection` を使うときに読み、Repository と GitHub の client を 1 回だけ作る |
| `apps/worker/src/jobs/collect-source.ts`（新規） | ジョブのハンドラ |
| `apps/worker/src/workers/collect-source-worker.ts`（新規） | BullMQ との結線 |
| `apps/worker/src/index.ts` | `consumers` に足す |
| `apps/worker/CLAUDE.md` | 「含まれる Worker」の表・環境変数の表 |

### Repository

```ts
export type SourceCollectionRunClaim = {
  runId: number
  sourceId: number
  startedAt: Date
}

export interface SourceCollectionRunRepository {
  claim(runId: number, now: Date): Promise<SourceCollectionRunClaim | null>
  finish(
    claim: SourceCollectionRunClaim,
    input:
      | { createdPassageCount: number; fetchedDocumentCount: number; status: SourceCollectionResultStatus }
      | { error: string; status: "failed" },
    now: Date,
  ): Promise<boolean>
}
```

- `claim`：`UPDATE ... SET status = 'running', started_at = now WHERE id = ? AND status IN ('queued', 'running') RETURNING source_id, started_at`。0 行なら null（時間切れで `failed` に片付けられた・もう終わった）。`running` も取り直すのは、worker が落ちて BullMQ が同じジョブを渡し直したとき（stalled）に続きを実行するため
- `finish`：`WHERE id = ? AND status = 'running' AND started_at = ?`（claim の時刻をトークンにする）。0 行なら false（別の実行に取り直された・片付けられた）。`finished_at = now`、件数・`error` を書く

### 収集の部品を使うときに読む

`runtime/collection.ts`：

```ts
export type CollectionRuntime = {
  collectSourceById: typeof import("@repo/collection").collectSourceById
  deps: CollectionDeps
  repo: CollectionRepo
  SourceNotCollectableError: typeof import("@repo/collection").SourceNotCollectableError
  GitHubNotFoundError: typeof import("@repo/collection").GitHubNotFoundError
  GitHubRateLimitError: typeof import("@repo/collection").GitHubRateLimitError
}

export const createCollectionRuntimeLoader = (input: { contactUrl: string | undefined; db: DrizzleClient; token: string | undefined }) => {
  let runtime: Promise<CollectionRuntime> | null = null
  return (): Promise<CollectionRuntime> => {
    runtime ??= import("@repo/collection").then((collection) => ({
      collectSourceById: collection.collectSourceById,
      deps: { githubContentClient: collection.createGitHubContentClient({ contactUrl: input.contactUrl, token: input.token }) },
      GitHubNotFoundError: collection.GitHubNotFoundError,
      GitHubRateLimitError: collection.GitHubRateLimitError,
      repo: collection.createCollectionRepositories(input.db),
      SourceNotCollectableError: collection.SourceNotCollectableError,
    }))
    return runtime
  }
}
```

- 何度呼んでも 1 回しか読まない（GitHub の client の rate limit の残りを、ジョブをまたいで持つため）。`import type` は起動時に読まれないので、型は通常どおり import してよい
- 実装の形は、api の `client/page-fetcher.ts`（使うときに `import()`）にそろえて調整してよい

### ジョブのハンドラ

`jobs/collect-source.ts`：

```ts
export type CollectSourceDeps = {
  githubToken: string | undefined
  limits: { maxDocuments: number; maxPassages: number }
  loadCollectionRuntime: () => Promise<CollectionRuntime>
  now: () => Date
  sourceCollectionRunRepository: SourceCollectionRunRepository
}

export const collectSource = (deps: CollectSourceDeps): JobProcessor<CollectSourceJobData> =>
  async (message) => {
    const claim = await deps.sourceCollectionRunRepository.claim(message.data.runId, deps.now())
    if (!claim) {
      logger.warn("collectSource: run is not claimable", { jobId: message.id, runId: message.data.runId })
      return
    }
    const runtime = await deps.loadCollectionRuntime()
    const outcome = await runCollection(claim, deps, runtime)
    const isWritten = await deps.sourceCollectionRunRepository.finish(claim, outcome, deps.now())
    if (!isWritten) logger.warn("collectSource: run was taken over; the result is not written", { runId: claim.runId })
  }
```

`runCollection`（同じファイルの内部関数）：

```ts
const runCollection = async (claim: SourceCollectionRunClaim, deps: CollectSourceDeps, runtime: CollectionRuntime): Promise<CollectionOutcome> => {
  try {
    const result = await runtime.collectSourceById(
      {
        githubMinRateLimitRemaining: selectGitHubMinRateLimitRemaining(deps.githubToken),
        maxDocuments: deps.limits.maxDocuments,
        maxPassages: deps.limits.maxPassages,
        now: deps.now(),
        sourceId: claim.sourceId,
      },
      runtime.repo,
      runtime.deps,
    )
    return result
  } catch (error) {
    if (error instanceof runtime.GitHubRateLimitError) return { createdPassageCount: 0, fetchedDocumentCount: 0, status: "rate_limited" }
    if (error instanceof runtime.SourceNotCollectableError) return { error: NOT_COLLECTABLE_MESSAGES[error.reason], status: "failed" }
    if (error instanceof runtime.GitHubNotFoundError) return { error: "GitHub にリポジトリかブランチが無い", status: "failed" }
    logger.error("collectSource: collection failed", error instanceof Error ? error : new Error(String(error)), { runId: claim.runId })
    return { error: `収集に失敗した: ${error instanceof Error ? error.message : String(error)}`, status: "failed" }
  }
}

const NOT_COLLECTABLE_MESSAGES = {
  disabled: "ソースが無効になっていた",
  not_found: "ソースが無かった",
  website: "サイトのソースは収集しない",
} satisfies Record<SourceNotCollectableError["reason"], string>
```

- 収集の失敗は記録に書いて正常に終える（BullMQ のリトライに回さない）。`claim`・`finish` の DB の失敗だけが throw され、BullMQ のリトライ（3 回）になる
- `selectGitHubMinRateLimitRemaining`・`SourceNotCollectableError` の型は `@repo/collection` から import する（値として使う関数は `runtime` から取る。`selectGitHubMinRateLimitRemaining` は軽いので `runtime` に入れてもよい）
- `collectSourceById` は `last_collected_at` を更新する（cron と同じ）

### Worker の結線・起動

- `workers/collect-source-worker.ts`：`startBullMQWorker(redis, { concurrency: 1, processor: collectSource(...), queueName: COLLECT_SOURCE_QUEUE_NAME })`。同時に 1 つだけ（GitHub の rate limit は token 単位で、worker の中で並べても速くならない。api 側でソースごとに 1 つに絞っているので、別のソースの収集は順番待ちになる）
- `src/index.ts`：`createCollectionRuntimeLoader({ contactUrl: env.COLLECT_WEB_CONTACT_URL, db, token: env.GITHUB_CONTENT_TOKEN })` を作り、`consumers` に足す。`GITHUB_CONTENT_TOKEN` が無ければ cron と同じ warn を起動時に出す
- graceful shutdown は今のまま（`JobConsumer.close()` が実行中の収集を待つ。ECS の停止の猶予を過ぎて殺されたら、BullMQ の stalled で次の worker が同じジョブを取り直し、`claim` が `running` を取り直して続きから収集する）

## 動作確認

```bash
pnpm --filter worker test
pnpm --filter worker exec tsc --noEmit
pnpm dev   # api・worker・admin を起動
curl -X POST -H "Authorization: Bearer <admin の token>" http://localhost:8080/api/admin/source/<id>/collection-runs
```

テスト（`test/jobs/collect-source.test.ts`。Repository と runtime は偽物）：

| ケース | 期待 |
| --- | --- |
| `claim` が null | 収集しない・`finish` を呼ばない |
| 収集が `completed` を返す | `finish` に件数と `completed` |
| 収集が `limit_reached` / `up_to_date` を返す | そのまま `finish` |
| `GitHubRateLimitError` | `rate_limited`（件数 0） |
| `SourceNotCollectableError`（3 つの理由） | `failed` と理由の文 |
| `GitHubNotFoundError`・ほかの例外 | `failed`。ジョブは throw しない |
| `claim` / `finish` が throw | ジョブが throw する（BullMQ のリトライ） |
| `finish` が false | warn を出して throw しない |

Repository のテスト（`test/repository/drizzle/source-collection-run-repository.test.ts`）：worker のテストは DB を mock する方針（`apps/worker/CLAUDE.md`）なので、SQL の文字列と引数までを確かめ、実 DB ではローカルで次を手で確かめる。

- [ ] `queued` の記録を `claim` すると `running` と `started_at` が入る
- [ ] `failed` の記録は `claim` できない
- [ ] 古い `started_at` で `finish` しても書かれない
- [ ] `pnpm dev` で admin から依頼すると、worker のログに `collect-source` が出て、記録が `completed` になり、本文候補が増える（同じ commit なら 2 回目は `up_to_date`）
