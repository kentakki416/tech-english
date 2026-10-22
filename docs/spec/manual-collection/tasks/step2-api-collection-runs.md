# step2-api-collection-runs

今すぐ収集を依頼する API（`POST /api/admin/source/:id/collection-runs`）と、ソース詳細の `latest_collection_run` を足す。Queue の型も足す（ジョブを処理する worker は step3）。仕様と理由は [README](../README.md#api-が-queue-に積みworker-が実行する)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `packages/queue/src/jobs/collect-source.ts`（新規）・`jobs/index.ts` | Queue 名・ジョブの型・jobId |
| `packages/schema/src/api-schema/admin/source.ts` | 記録のスキーマ、依頼のパスパラメータ・レスポンス、詳細の `latest_collection_run` |
| `apps/api/src/env.ts` | `SOURCE_COLLECTION_TYPE` |
| `apps/api/src/repository/source-collection-run-repository.ts`（新規）・`drizzle/source-collection-run-repository.ts`（新規）・`index.ts` | 記録の作成・最新の取得・時間切れの片付け・失敗にする |
| `apps/api/src/service/source-service.ts` | `requestSourceCollection`、`getSourceById` に最新の記録 |
| `apps/api/src/controller/admin/source/collect.ts`（新規）・`detail.ts`・`source-mapper.ts` | Controller と変換 |
| `apps/api/src/routes/admin-router.ts`・`src/index.ts` | ルートと DI |
| `apps/api/package.json` | （`@repo/queue` は導入済み） |
| `.github/workflows/deploy-aws-min.yml` | `EVENT_TRACKER_TYPE` と同じく、worker があれば `SOURCE_COLLECTION_TYPE=queue`、無ければ `none` |
| `docs/spec/minimal-deploy/README.md` | env の表と「worker を作るかどうかの切り替え」の表に `SOURCE_COLLECTION_TYPE` |
| `apps/api/CLAUDE.md` | Admin API の「ソースの登録・更新」の下に、今すぐ収集（記録・Queue・`SOURCE_COLLECTION_TYPE`）を 1 項目 |

### Queue の型

`packages/queue/src/jobs/collect-source.ts`：

```ts
export const COLLECT_SOURCE_QUEUE_NAME = "collect-source"

export type CollectSourceJobData = {
  runId: number
}

export const buildCollectSourceJobId = (runId: number): string => `collect-source-run-${runId}`
```

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

### env

```ts
  SOURCE_COLLECTION_TYPE: z.enum(["none", "queue"]).default("queue"),
```

- JSDoc：`queue` は Queue に積み、apps/worker が収集する。`none` は今すぐ収集のルートを作らない（worker を動かさない環境。minimal で worker を作らない場合）

### Repository

```ts
export type CreateSourceCollectionRunResult =
  | { kind: "active_exists" }
  | { kind: "created"; run: SourceCollectionRun }

export interface SourceCollectionRunRepository {
  create(sourceId: number): Promise<CreateSourceCollectionRunResult>
  failTimedOut(input: { error: string; sourceId: number; updatedBefore: Date }): Promise<number>
  findLatestBySourceId(sourceId: number): Promise<SourceCollectionRun | null>
  markFailed(id: number, error: string): Promise<void>
}
```

- `create`：`status = 'queued'` で INSERT する。部分 unique index（`source_collection_runs_active_source_id_key`）の違反は `active_exists` にする（ほかの例外は throw）。unique 違反の見分け方は既存の Repository（`DrizzleSourceRepository.create` の `duplicate`）と同じ書き方にそろえる
- `failTimedOut`：そのソースの `queued` / `running` のうち、`queued` は `created_at`、`running` は `started_at` が `updatedBefore` より前のものを `status = 'failed'`・`error`・`finished_at = now` にする
- `findLatestBySourceId`：`id` の降順で 1 件
- `markFailed`：enqueue に失敗したときに使う（`WHERE id = ? AND status = 'queued'`）

### Service

`source-service.ts`：

```ts
export const SOURCE_COLLECTION_TIMED_OUT_MESSAGE = "30 分を過ぎても終わらなかった"

const failTimedOutRuns = (sourceId: number, now: Date, repo: { sourceCollectionRunRepository: SourceCollectionRunRepository }) =>
  repo.sourceCollectionRunRepository.failTimedOut({
    error: SOURCE_COLLECTION_TIMED_OUT_MESSAGE,
    sourceId,
    updatedBefore: new Date(now.getTime() - SOURCE_COLLECTION_RUN_TIMEOUT_MINUTES * 60_000),
  })

export const requestSourceCollection = async (
  sourceId: number,
  repo: { sourceCollectionRunRepository: SourceCollectionRunRepository; sourceRepository: SourceRepository },
  deps: { collectSourceQueue: JobQueue<CollectSourceJobData>; now: Date },
): Promise<Result<SourceCollectionRun>> => {
  const source = await repo.sourceRepository.findById(sourceId)
  if (!source) return err(notFoundError("Source not found"))
  if (source.fetchType === "website") return err(badRequestError("Website sources are not collected"))
  if (!source.isEnabled) return err(badRequestError("Disabled sources are not collected"))

  await failTimedOutRuns(sourceId, deps.now, repo)
  const created = await repo.sourceCollectionRunRepository.create(sourceId)
  if (created.kind === "active_exists") return err(conflictError("Source collection is already running"))

  try {
    await deps.collectSourceQueue.enqueue({ runId: created.run.id }, { jobId: buildCollectSourceJobId(created.run.id) })
  } catch (error) {
    await repo.sourceCollectionRunRepository.markFailed(created.run.id, "Queue に積めなかった")
    throw error
  }
  logger.info("SourceService: Source collection requested", { runId: created.run.id, sourceId })
  return ok(created.run)
}
```

- `getSourceById` は、ソースを読んだ後に `failTimedOutRuns` してから `findLatestBySourceId` を読み、戻り値に `latestCollectionRun` を足す（`passageCounts` と並べて `Promise.all`。`failTimedOutRuns` だけは先に待つ）
- enqueue の失敗の try-catch は「エラーを値に変換する」の例外ではなく、記録を `failed` に戻してから throw し直すため（`apps/api/CLAUDE.md` の try/catch の 2 つ目に当たる）。理由を JSDoc に書く
- 依頼のメッセージ（400 / 409）は英語の定数にして、admin が `status` で文言を出し分ける（既存の `WEBSITE_SOURCE_UNAVAILABLE_MESSAGE` と同じ扱い）

### Controller・ルート・DI

`controller/admin/source/collect.ts`：

```ts
export class AdminSourceCollectController {
  constructor(
    private _sourceRepository: SourceRepository,
    private _sourceCollectionRunRepository: SourceCollectionRunRepository,
    private _collectSourceQueue: JobQueue<CollectSourceJobData>,
  ) {}

  async execute(req: Request, res: Response): Promise<void> {
    const { id } = createSourceCollectionRunPathParamSchema.parse(req.params)
    const result = await service.source.requestSourceCollection(
      id,
      { sourceCollectionRunRepository: this._sourceCollectionRunRepository, sourceRepository: this._sourceRepository },
      { collectSourceQueue: this._collectSourceQueue, now: new Date() },
    )
    if (!result.ok) return sendError(res, result.error)
    res.status(202).json(createSourceCollectionRunResponseSchema.parse({ collection_run: convertSourceCollectionRunToResponse(result.value) }))
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
pnpm --filter @repo/queue build && pnpm --filter @repo/api-schema build
pnpm --filter api test   # vitest を直接叩かない（dev DB が消える）
pnpm --filter api exec tsc --noEmit
```

テスト：

| ファイル | ケース |
| --- | --- |
| `test/repository/source-collection-run-repository.test.ts`（実 DB） | `create` が `queued` で作る、収集中があれば `active_exists`、別のソースなら作れる。`failTimedOut` が境界（`updatedBefore` ちょうど・1ms 前）で正しく分け、`completed` には触らない。`findLatestBySourceId` が最新の 1 件。`markFailed` は `queued` のときだけ |
| `test/service/source-service/requestSourceCollection.test.ts` | 404・サイトは 400・無効は 400・収集中は 409（enqueue しない）、成功は enqueue に `{ runId }` と jobId、enqueue が throw したら `markFailed` して throw、時間切れの片付けを `create` より先に呼ぶ |
| `test/service/source-service/getSourceById.test.ts` | `latestCollectionRun` を返す、時間切れの片付けを読む前に呼ぶ |
| `test/controller/admin/source/collect.test.ts`（実 DB・Queue は偽物） | 202 と `collection_run`（`status: "queued"`）、DB に 1 行、偽物の Queue に 1 件。404・400（サイト・無効）・409（2 回目）・401 |
| `test/controller/admin/source/detail.test.ts` | `latest_collection_run` が null・最新の記録・30 分を過ぎた `running` が `failed` で返る |

- Queue は `JobQueue<CollectSourceJobData>` を実装した偽物（積んだデータを配列に持つ）を `test/fixture/` に置く。`@repo/events` の `FakeEventTracker` と同じく、Queue の抽象の外側は差し替えてよい（Redis 自体はモックしない）
- `SOURCE_COLLECTION_TYPE=none` の確認は `src/index.ts` の分岐だけなので、ローカルで `none` にして `POST` が 404 になることを手で確かめる
