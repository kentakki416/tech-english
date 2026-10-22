# step3-worker-collect-source

収集の処理を `apps/cron` から `apps/worker` に移し、worker に `collect-source` のジョブを足す。cron の `collect:passages` は消す。仕様と理由は [README](../README.md#収集の処理を-worker-に移す)。

## 対応内容

### 移すファイル（cron → worker）

`git mv` で移し、import のパスだけを直す（処理は変えない）。

| cron | worker |
| --- | --- |
| `src/service/collection/collect-github-source.ts`・`extract-github-file.ts`・`list-github-target-files.ts`・`reject-out-of-target-passages.ts`・`replace-passage-candidates.ts`・`types.ts`・`index.ts` | `src/service/collection/` の同じ名前 |
| `src/client/github/*` | `src/client/github/*` |
| `src/const/collection.ts`（`DRY_RUN_MAX_DOCUMENTS` は消す） | `src/const/collection.ts` |
| `src/repository/source-repository.ts`・`source-document-repository.ts`・`drizzle/` の実装 | `src/repository/` の同じ名前 |
| `src/repository/passage-repository.ts` の `findGeneratedOrGeneratingTitles`・`insertIgnoringDuplicates`・`rejectCollected`（と `CreatePassageInput`）、`drizzle/passage-repository.ts` のその実装 | `src/repository/passage-repository.ts`・`drizzle/passage-repository.ts`（worker の新しい `PassageRepository`） |
| `test/service/collection/*`（`collect-passages.test.ts`・`preview-source.test.ts` を除く）・`test/client/github/*`・`test/repository/drizzle/source*-repository.test.ts`・passage の Repository の上の 3 つのテスト | `test/` の同じ並び |

cron で消すもの：

| ファイル | |
| --- | --- |
| `src/task/collect-passages.ts`・`src/service/collection/collect-passages.ts`・`preview-source.ts` | 全ソースのループと試し実行 |
| `src/lib/parse-collect-args.ts`・`src/lib/format-dry-run.ts` とテスト | CLI の引数と試し実行の表示 |
| `src/service/index.ts` の `collection`、`src/repository/index.ts`・`drizzle/index.ts` の移した Repository | |
| `src/env.ts` の `GITHUB_CONTENT_TOKEN`・`COLLECT_MAX_DOCUMENTS_PER_SOURCE`・`COLLECT_MAX_PASSAGES_PER_RUN`・`COLLECT_WEB_CONTACT_URL` | |
| `package.json` の `collect:passages` と、cron で使わなくなった依存（`@repo/content-extractor`・`picomatch` など。`git grep` で確かめる） | |
| `src/task/generate-questions.ts` の JSDoc の「collect:passages の 1 時間後」 | 起動の想定から外す |

- `SourceRepository.findEnabledGitHubSources` は使わなくなるので、移さずに消す（worker は `findById` だけを使う）
- worker の `package.json` に `@repo/content-extractor`・`picomatch`（移したファイルが使うもの）を足す

### 1 ソースの収集の入口

`src/service/collection/errors.ts`（新規）：

```ts
export class SourceNotCollectableError extends Error {
  constructor(
    public readonly reason: SourceNotCollectableReason,
    sourceId: number,
  ) {
    super(`Source is not collectable: id=${sourceId} reason=${reason}`)
    this.name = "SourceNotCollectableError"
  }
}
```

`src/service/collection/collect-source-by-id.ts`（新規）：

```ts
export type CollectSourceByIdInput = {
  githubMinRateLimitRemaining: number
  maxDocuments: number
  maxPassages: number
  now: Date
  sourceId: number
}

const findCollectableSource = async (sourceId: number, repo: CollectionRepo): Promise<GitHubRepositorySource> => {
  const source = await repo.sourceRepository.findById(sourceId)
  const notCollectableReason = findSourceNotCollectableReason(source)
  if (notCollectableReason !== null || source?.fetchType !== "github_repository") {
    throw new SourceNotCollectableError(notCollectableReason ?? "website", sourceId)
  }
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

- 収集できるかの判定は api と同じ `@repo/domain` の `findSourceNotCollectableReason`（step2）を使う。`fetchType` の 2 つ目の条件は型を `GitHubRepositorySource` に絞るためだけのもの（判定は同じ関数が済ませている）
- `collectGitHubSource` のログ（`GitHub source files listed` など）は今のまま

`src/const/collection.ts` に足す（cron の task の三項演算子を移す）：

```ts
export const selectGitHubMinRateLimitRemaining = (token: string | undefined): number =>
  token ? GITHUB_MIN_RATE_LIMIT_REMAINING : GITHUB_UNAUTHENTICATED_MIN_RATE_LIMIT_REMAINING
```

### 記録の Repository

```ts
export type SourceCollectionRunClaim = {
  runId: number
  sourceId: number
  startedAt: Date
}

export type SourceCollectionOutcome =
  | { createdPassageCount: number; fetchedDocumentCount: number; status: SourceCollectionResultStatus }
  | { error: string; status: "failed" }

export interface SourceCollectionRunRepository {
  claim(runId: number, now: Date): Promise<SourceCollectionRunClaim | null>
  finish(claim: SourceCollectionRunClaim, outcome: SourceCollectionOutcome, now: Date): Promise<boolean>
}
```

- `claim`：`UPDATE ... SET status = 'running', started_at = now WHERE id = ? AND status IN ('queued', 'running') RETURNING source_id, started_at`。0 行なら null（時間切れで `failed` に片付けられた・もう終わった）。`running` も取り直すのは、worker が落ちて BullMQ が同じジョブを渡し直したとき（stalled）に続きを実行するため
- `finish`：`WHERE id = ? AND status = 'running' AND started_at = ?`（claim の時刻をトークンにする）。0 行なら false。`finished_at = now`、件数・`error` を書く

### 収集の service を使うときに読む

`src/runtime/collection.ts`（新規）：

```ts
export type CollectionRuntime = {
  collectSourceById: (input: CollectSourceByIdInput) => Promise<SourceCollectionResult>
}

export const createCollectionRuntimeLoader = (input: { contactUrl: string | undefined; db: DrizzleClient; token: string | undefined }) => {
  let runtime: Promise<CollectionRuntime> | null = null
  return (): Promise<CollectionRuntime> => {
    runtime ??= Promise.all([import("../service/collection"), import("@repo/content-extractor")])
      .then(([collection, contentExtractor]) => {
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
        return { collectSourceById: (collectInput) => collection.collectSourceById(collectInput, repo, deps) }
      })
    return runtime
  }
}
```

- 何度呼んでも `import()` は 1 回だけ（2 回目からは同じ Promise を返す）。この挙動を JSDoc に 1 行で書く
- `@repo/content-extractor` を値として import するファイル（`service/collection/*`）は、`runtime/collection.ts` の `import()` からしか読まれないようにする。`jobs/`・`workers/`・`src/index.ts` からは型だけを import する（`import type`）
- `client/github/*` は `@repo/content-extractor` を import していない（zod と `./errors` だけ）ので通常の import でよい。Repository の drizzle の実装も通常の import

### ジョブのハンドラ

`src/jobs/collect-source.ts`（新規）：

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
    const outcome = await runCollection(claim, deps)
    const isWritten = await deps.sourceCollectionRunRepository.finish(claim, outcome, deps.now())
    if (!isWritten) logger.warn("collectSource: run was taken over; the result is not written", { runId: claim.runId })
    logger.info("collectSource: finished", { ...outcome, runId: claim.runId, sourceId: claim.sourceId })
  }

const runCollection = async (claim: SourceCollectionRunClaim, deps: CollectSourceDeps): Promise<SourceCollectionOutcome> => {
  try {
    const runtime = await deps.loadCollectionRuntime()
    return await runtime.collectSourceById({
      githubMinRateLimitRemaining: selectGitHubMinRateLimitRemaining(deps.githubToken),
      maxDocuments: deps.limits.maxDocuments,
      maxPassages: deps.limits.maxPassages,
      now: deps.now(),
      sourceId: claim.sourceId,
    })
  } catch (error) {
    return convertCollectionErrorToOutcome(error, claim)
  }
}
```

`convertCollectionErrorToOutcome`：

| 例外 | 結果 |
| --- | --- |
| `GitHubRateLimitError` | `{ createdPassageCount: 0, fetchedDocumentCount: 0, status: "rate_limited" }` |
| `SourceNotCollectableError` | `failed`。`not_found`：ソースが無かった、`website`：サイトのソースは収集しない、`disabled`：ソースが無効になっていた |
| `GitHubNotFoundError` | `failed`：GitHub にリポジトリかブランチが無い |
| ほか | `failed`：収集に失敗した: {message}。`logger.error` も出す |

- 収集の失敗は記録に書いて正常に終える（BullMQ のリトライに回さない）。`claim`・`finish` の DB の失敗だけが throw され、BullMQ のリトライ（3 回）になる
- `instanceof` で見分ける例外のクラスは `client/github/errors.ts`・`service/collection/errors.ts` にあり、どちらも `@repo/content-extractor` を読まないので、`jobs/` から通常の import で使う（`service/collection/index.ts` を経由すると jsdom まで読むので、`service/collection/errors.ts` は直接 import する）
- `selectGitHubMinRateLimitRemaining` も `const/collection.ts`（`@repo/content-extractor` を読まない）なので通常の import でよい

### Worker の結線・起動・env

- `src/workers/collect-source-worker.ts`：`startBullMQWorker(redis, { concurrency: 1, processor: collectSource(...), queueName: COLLECT_SOURCE_QUEUE_NAME })`
- `src/index.ts`：`createCollectionRuntimeLoader({ contactUrl: env.COLLECT_WEB_CONTACT_URL, db, token: env.GITHUB_CONTENT_TOKEN })` を作って `consumers` に足す。`GITHUB_CONTENT_TOKEN` が無ければ起動時に warn（今の cron と同じ文）。`queues` のログにも足す
- `src/env.ts`：cron の 4 つ（`GITHUB_CONTENT_TOKEN`・`COLLECT_MAX_DOCUMENTS_PER_SOURCE`（既定 100）・`COLLECT_MAX_PASSAGES_PER_RUN`（既定 200）・`COLLECT_WEB_CONTACT_URL`）を、定義と JSDoc ごと移す。`COLLECT_MAX_PASSAGES_PER_RUN` は「1 回の収集（1 ソース）で作る本文候補の上限」に説明を直す（全ソースのループが無くなり、実行全体の上限ではなくなる）
- `GITHUB_CONTENT_TOKEN` の値：`apps/cron/.env.local` の暗号化した行（`GITHUB_CONTENT_TOKEN="encrypted:..."`）を `apps/worker/.env.local` に移す。2 つのファイルは同じ dotenvx の鍵（`DOTENV_PUBLIC_KEY_LOCAL` が同じ）なので、暗号文のまま移せる（復号しない）。`COLLECT_*` は既定値のまま使っているので移すものは無い
- AWS：cron の `secret_keys` にも `GITHUB_CONTENT_TOKEN` は入っていなかった（認証なしで動く想定）。worker も今は足さない（Secrets Manager に値が無いキーを `secret_keys` に入れると、ECS のタスクが起動に失敗する）。`scripts/deploy/seed-secrets.sh` のコメントの「cron の collect:passages が使う」を worker に直す
- graceful shutdown は今のまま（`JobConsumer.close()` が実行中の収集を待つ）。収集は数分かかるので ECS の停止の猶予（`stop_timeout`、既定 30 秒）を超えうる。超えて殺されたら、BullMQ の stalled で次の worker が同じジョブを取り直し、`claim` が `running` を取り直して続きから収集する（収集は冪等）。`apps/worker/CLAUDE.md` の「1 ジョブの最大処理時間が stop_timeout を超えないよう設計する」の例外として、この理由を書く

### ドキュメント

| ファイル | 直すところ |
| --- | --- |
| `apps/worker/CLAUDE.md` | 「含まれる Worker」に `collect-source`。レイヤードの規則に `service/`・`client/`・`const/`（cron と同じ役割）を足す。収集の規則（冪等・rate limit・抽出の版・古い本文候補の却下）を cron の CLAUDE.md から移す。環境変数の表 |
| `apps/cron/CLAUDE.md`・`README.md` | `collect:passages` の行・節・env を消し、収集は worker に移したことを 1 行で書く。「中断は失敗として扱う」の `collect:passages` の項目を消す |
| ルートの `CLAUDE.md` | `packages/content-extractor` の説明の「cron の収集」を「worker の収集」に。apps の worker の説明に収集 |
| `packages/content-extractor/README.md` | 使う側を cron から worker に（抽出の版を上げたときの説明も） |
| `docs/spec/content-collection/README.md` | 「cron タスク」の節（`collect:passages`・試し実行）を、worker の `collect-source` と admin の今すぐ収集に直す。抽出の調整の確かめ方（`--dry-run`）を今すぐ収集に |
| `docs/spec/passage-extraction-tuning/README.md` | `--dry-run` での確かめ方を、ローカルで今すぐ収集を押して本文候補を見ることに |

## 動作確認

```bash
pnpm install
pnpm --filter worker test
pnpm --filter worker exec tsc --noEmit
pnpm --filter cron test
pnpm --filter cron exec tsc --noEmit
pnpm lint:fix
pnpm dev
```

- [ ] 移したテストが worker で通り、cron のテストは消したもの（全ソースのループ・試し実行・CLI の引数）の分だけ減っている
- [ ] `git grep -n "collect:passages\|collect-passages" apps packages` が設計書の外に残っていない
- [ ] worker を起動してもログに jsdom の読み込みが出ず、起動の時間が変わらない（`collect-source` のジョブを初めて処理するときに読む）
- [ ] admin の今すぐ収集（step4 の前は `curl -X POST .../collection-runs`）で、worker のログに `collectSource: finished` が出て、記録が `completed`、本文候補が増える。同じコミットのまま 2 回目は `up_to_date`

テスト（`test/jobs/collect-source.test.ts`。Repository と runtime は偽物）：

| ケース | 期待 |
| --- | --- |
| `claim` が null | 収集しない・`finish` を呼ばない |
| 収集が `completed` / `limit_reached` / `up_to_date` を返す | そのまま件数と状態で `finish` |
| `GitHubRateLimitError` | `rate_limited`（件数 0） |
| `SourceNotCollectableError`（3 つの理由） | `failed` と理由の文 |
| `GitHubNotFoundError`・ほかの例外 | `failed`。ジョブは throw しない |
| `claim` / `finish` が throw | ジョブが throw する（BullMQ のリトライ） |
| `finish` が false | warn を出して throw しない |

`test/service/collection/collect-source-by-id.test.ts`：有効な GitHub のソースは `collectGitHubSource` と同じ結果、ソースが無い・サイト・無効は `SourceNotCollectableError`（GitHub API を呼ばない）。

記録の Repository（`test/repository/drizzle/source-collection-run-repository.test.ts`）は worker の方針どおり DB を mock して SQL の文字列と引数まで。実 DB ではローカルで次を手で確かめる。

- [ ] `queued` の記録を `claim` すると `running` と `started_at` が入る
- [ ] `failed` の記録は `claim` できない
- [ ] 古い `started_at` で `finish` しても書かれない
