# step2-api-collection-runs

今すぐ収集を依頼する API（`POST /api/admin/source/:id/collection-runs`）と、ソース詳細の `latest_collection_run` を足す。Queue の型と、収集できるソースかの判定（worker と共有する）も足す（ジョブを処理する worker は step3）。仕様と理由は [README](../README.md#api-が-queue-に積みworker-が実行する)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `packages/queue/src/jobs/collect-source.ts`（新規）・`jobs/index.ts` | Queue 名・ジョブの型・jobId |
| `packages/domain/src/rules/source.ts`・`types/source.ts`・`index.ts` | 収集できないソースの理由を返す純粋関数（api と worker で使う） |
| `packages/schema/src/api-schema/admin/source.ts` | 記録のスキーマ、収集中の状態のスキーマ、依頼のパスパラメータ・レスポンス、詳細の `latest_collection_run` |
| `apps/api/src/env.ts` | `SOURCE_COLLECTION_TYPE` |
| `apps/api/src/const/index.ts` | `SOURCE_COLLECTION_RUN_TIMEOUT_MINUTES` |
| `apps/api/src/repository/source-collection-run-repository.ts`（新規）・`drizzle/source-collection-run-repository.ts`（新規）・`index.ts`・`drizzle/pg-error.ts` | 記録の作成・最新の取得・時間切れの片付け・失敗にする |
| `apps/api/src/service/source-service.ts` | `requestSourceCollection`、`getSourceById` に最新の記録 |
| `apps/api/src/controller/admin/source/collect.ts`（新規）・`detail.ts`・`source-mapper.ts` | Controller と変換 |
| `apps/api/src/routes/admin-router.ts`・`src/index.ts` | ルートと DI |
| `.github/workflows/deploy-aws-min.yml` | `EVENT_TRACKER_TYPE` と同じく、worker があれば `SOURCE_COLLECTION_TYPE=queue`、無ければ `none` |
| `docs/spec/minimal-deploy/README.md` | env の表と「worker を作るかどうかの切り替え」の表に `SOURCE_COLLECTION_TYPE` |
| `apps/api/CLAUDE.md` | Admin API に今すぐ収集（記録・Queue・`SOURCE_COLLECTION_TYPE`）を 1 項目。try/catch の許容に「後始末をしてから throw し直す」を足す |

### Queue の型

`packages/queue/src/jobs/collect-source.ts`：

```ts
export const COLLECT_SOURCE_QUEUE_NAME = "collect-source"

export type CollectSourceJobData = {
  runId: number
}

export const buildCollectSourceJobId = (runId: number): string => `collect-source-run-${runId}`
```

### 収集できるソースかの判定（domain）

`packages/domain/src/rules/source.ts`：

```ts
export const findSourceNotCollectableReason = (source: Source | null): SourceNotCollectableReason | null => {
  if (source === null) return "not_found"
  if (source.fetchType === "website") return "website"
  if (!source.isEnabled) return "disabled"
  return null
}
```

- `SourceNotCollectableReason = "disabled" | "not_found" | "website"`（`types/source.ts`）
- api は `not_found` を 404、ほかを 400 にする。worker（step3）は収集を始める前に同じ関数で確かめ、理由を記録の `error` にする。条件を足すとき（例：ライセンス）に 2 か所がずれないよう、1 か所に置く

### スキーマ

```ts
export const sourceCollectionRunSchema = z.object({
  id: z.number().int(),
  created_passage_count: z.number().int().nullable(),
  error: z.string().nullable(),
  fetched_document_count: z.number().int().nullable(),
  finished_at: z.string().nullable(),
  started_at: z.string().nullable(),
  status: z.enum(SOURCE_COLLECTION_RUN_STATUSES),
  created_at: z.string(),
})

export const activeSourceCollectionRunStatusSchema = z.enum(ACTIVE_SOURCE_COLLECTION_RUN_STATUSES)

export const getSourceResponseSchema = z.object({
  latest_collection_run: sourceCollectionRunSchema.nullable(),
  passage_counts: passageCountsSchema,
  source: sourceSchema,
})

export const createSourceCollectionRunPathParamSchema = z.object({
  id: z.coerce.number().int().positive().max(MAX_SERIAL_ID),
})

export const createSourceCollectionRunResponseSchema = z.object({
  collection_run: sourceCollectionRunSchema,
})
```

- セクションの区切りは `// POST /api/admin/source/:id/collection-runs - 今すぐ収集の依頼`
- `activeSourceCollectionRunStatusSchema` は admin が「収集中か」を判定するのに使う（admin は `@repo/domain` を import できない。`allowedLicenseSchema.options` と同じく、Server Component が `options` を props で渡す）

### env・定数

```ts
  SOURCE_COLLECTION_TYPE: z.enum(["none", "queue"]).default("queue"),
```

- JSDoc：`queue` は Queue に積み、apps/worker が収集する。`none` は今すぐ収集のルートを作らない（worker を動かさない環境。minimal で worker を作らない場合）

`src/const/index.ts`：

```ts
export const SOURCE_COLLECTION_RUN_TIMEOUT_MINUTES = 30
```

- JSDoc に README の「終わらなかった実行の片付け」の理由（worker が止まるとボタンを二度と押せなくなる・30 分の根拠・`queued` は `created_at`、`running` は `started_at` から数える）を書く

### Repository

```ts
export type CreateSourceCollectionRunResult =
  | { kind: "active_exists" }
  | { kind: "created"; run: SourceCollectionRun }

export interface SourceCollectionRunRepository {
  create(sourceId: number): Promise<CreateSourceCollectionRunResult>
  failTimedOut(input: { error: string; now: Date; sourceId: number; staleBefore: Date }): Promise<number>
  findLatestBySourceId(sourceId: number, options?: ReadOptions): Promise<SourceCollectionRun | null>
  markFailed(input: { error: string; id: number; now: Date }): Promise<void>
}
```

- `create`：`status = 'queued'` で INSERT する。unique 違反（`isUniqueViolation`）は `active_exists` にする（このテーブルの unique は主キーと部分 unique index だけ。`pg-error.ts` の JSDoc の一覧に足す）
- `failTimedOut`：そのソースの `queued` は `created_at`、`running` は `started_at` が `staleBefore` より前のものを `status = 'failed'`・`error`・`finished_at = now` にする
- `findLatestBySourceId`：`id` の降順で 1 件。`{ fromPrimary: true }` なら `this._db.$primary` から読む（`apps/api/CLAUDE.md` の read replica の規約）
- `markFailed`：`WHERE id = ? AND status = 'queued'`（Queue に積めなかったとき）

### Service

`source-service.ts`：

```ts
const failTimedOutCollectionRuns = async (sourceId: number, now: Date, repo: SourceCollectionRepo): Promise<void> => {
  const count = await repo.sourceCollectionRunRepository.failTimedOut({
    error: SOURCE_COLLECTION_TIMED_OUT_ERROR,
    now,
    sourceId,
    staleBefore: new Date(now.getTime() - SOURCE_COLLECTION_RUN_TIMEOUT_MINUTES * 60_000),
  })
  if (count > 0) logger.warn("SourceService: Timed out source collection runs were failed", { count, sourceId })
}

export const requestSourceCollection = async (
  sourceId: number,
  repo: SourceCollectionRepo,
  deps: { collectSourceQueue: JobQueue<CollectSourceJobData>; now: Date },
): Promise<Result<SourceCollectionRun>> => {
  const source = await repo.sourceRepository.findById(sourceId)
  const notCollectableReason = findSourceNotCollectableReason(source)
  if (notCollectableReason !== null) return err(buildSourceNotCollectableError(notCollectableReason))

  await failTimedOutCollectionRuns(sourceId, deps.now, repo)
  const created = await repo.sourceCollectionRunRepository.create(sourceId)
  if (created.kind === "active_exists") return err(conflictError(SOURCE_COLLECTION_RUNNING_MESSAGE))

  try {
    await deps.collectSourceQueue.enqueue({ runId: created.run.id }, { jobId: buildCollectSourceJobId(created.run.id) })
  } catch (error) {
    await repo.sourceCollectionRunRepository.markFailed({ error: SOURCE_COLLECTION_ENQUEUE_FAILED_ERROR, id: created.run.id, now: deps.now })
    throw error
  }
  return ok(created.run)
}
```

- `SOURCE_COLLECTION_TIMED_OUT_ERROR` は `` `${SOURCE_COLLECTION_RUN_TIMEOUT_MINUTES} 分を過ぎても終わらなかった` ``（admin がそのまま出すので日本語）
- `buildSourceNotCollectableError`：`not_found` は `notFoundError`、`website`・`disabled` は `badRequestError`（英語のメッセージ。admin は status で文言を出し分ける）
- `getSourceById(id, repo, deps: { now })`：ソースを読んだ後に `failTimedOutCollectionRuns` を待ってから、件数と `findLatestBySourceId(id, { fromPrimary: true })` を `Promise.all` で読み、戻り値に `latestCollectionRun` を足す（片付けの UPDATE の直後と、依頼の直後の読み直しで replica の遅れを見ないため）
- enqueue の try/catch は、`apps/api/CLAUDE.md` の try/catch の許容に 3 つ目として「後始末をしてから throw し直す（外部への送信に失敗したときに、先に書いた状態を残さない）」を足し、それに当たる。理由（積めなかった記録を `queued` のまま残すと、時間切れまで同じソースを依頼できない）を JSDoc に書く

### Controller・ルート・DI

`controller/admin/source/collect.ts`：

```ts
export class AdminSourceCollectController {
  constructor(
    private _sourceRepository: SourceRepository,
    private _sourceCollectionRunRepository: SourceCollectionRunRepository,
    private _collectSourceQueue: JobQueue<CollectSourceJobData>,
  ) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(createSourceCollectionRunPathParamSchema, req.params)

    const result = await service.source.requestSourceCollection(
      id,
      { sourceCollectionRunRepository: this._sourceCollectionRunRepository, sourceRepository: this._sourceRepository },
      { collectSourceQueue: this._collectSourceQueue, now: new Date() },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(createSourceCollectionRunResponseSchema, {
      collection_run: convertSourceCollectionRunToResponse(result.value),
    })
    return res.status(202).json(response)
  }
}
```

- ルート：`router.post("/source/:id/collection-runs", ...)`（`controllers.source.collect` があるときだけ）
- `src/index.ts`：

```ts
const sourceCollectionRunRepository = new DrizzleSourceCollectionRunRepository(db)
const adminSourceCollectController = env.SOURCE_COLLECTION_TYPE === "queue"
  ? new AdminSourceCollectController(
    sourceRepository,
    sourceCollectionRunRepository,
    new BullMQJobQueue<CollectSourceJobData>(redis, COLLECT_SOURCE_QUEUE_NAME),
  )
  : undefined
```

- `AdminSourceDetailController` に `sourceCollectionRunRepository` を渡す
- `source-mapper.ts` に `convertSourceCollectionRunToResponse`（日時は `toISOString()`）

## 動作確認

```bash
pnpm --filter @repo/domain build && pnpm --filter @repo/queue build && pnpm --filter @repo/api-schema build
pnpm --filter api test   # vitest を直接叩かない（dev DB が消える）
pnpm --filter api exec tsc --noEmit
```

テスト：

| ファイル | ケース |
| --- | --- |
| `packages/domain/test/rules/source.test.ts` | `findSourceNotCollectableReason`：null・サイト・無効・有効な GitHub |
| `test/repository/source-collection-run-repository.test.ts`（実 DB） | `create` が `queued` で作る、収集中があれば `active_exists`、別のソースなら作れる。`failTimedOut` が境界（`staleBefore` ちょうど・1ms 前）で分け、`queued` は `created_at`・`running` は `started_at` で判定し、終わった記録・別のソースには触らない。`findLatestBySourceId` が最新の 1 件。`markFailed` は `queued` のときだけ |
| `test/service/source-service/requestSourceCollection.test.ts` | 404・サイトは 400・無効は 400・収集中は 409（enqueue しない）、成功は enqueue に `{ runId }` と jobId、enqueue が throw したら `markFailed` して throw、時間切れの片付けを `create` より先に呼ぶ |
| `test/service/source-service/getSourceById.test.ts` | `latestCollectionRun` を返す、時間切れの片付けを読む前に呼ぶ、primary から読む |
| `test/controller/admin/source/collect.test.ts`（実 DB・Queue は偽物） | 202 と `collection_run`（`status: "queued"`）、DB に 1 行、偽物の Queue に 1 件。終わった記録があれば依頼できる、30 分を過ぎた `queued` を片付けて依頼できる。409（収集中）・400（サイト・無効・`:id` が数値でない）・404・401 |
| `test/controller/admin/source/detail.test.ts` | `latest_collection_run` が null・最新の記録・30 分を過ぎた `running` が `failed` で返る |

- Queue は `JobQueue<CollectSourceJobData>` を実装した偽物（積んだデータを配列に持つ）を `test/fixture/` に置く。`@repo/events` の `FakeEventTracker` と同じく、Queue の抽象の外側は差し替えてよい（Redis 自体はモックしない）
- `SOURCE_COLLECTION_TYPE=none` の確認は `src/index.ts` の分岐だけなので、ローカルで `none` にして `POST` が 404 になることを手で確かめる
