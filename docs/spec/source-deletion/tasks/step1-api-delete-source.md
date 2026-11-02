# step1: ソースの削除の API

`DELETE /api/admin/source/:id` を足す。方針は [README](../README.md#設計)。

## 対応内容

### スキーマ

`packages/schema/src/api-schema/admin/source.ts` にパスパラメータを足す。成功は 204 なのでレスポンススキーマは無い。

```ts
export const deleteSourcePathParamSchema = z.object({
  id: z.coerce.number().int().positive().max(MAX_SERIAL_ID),
})

export type DeleteSourcePathParam = z.infer<typeof deleteSourcePathParamSchema>
```

### Repository

`apps/api/src/repository/source-repository.ts`：

```ts
export type SourceDeletionBlockReason = "attempted" | "audio" | "collecting" | "published"

export type SourceDeleteResult =
  | { kind: "blocked"; reason: SourceDeletionBlockReason }
  | { deletedPassageCount: number; kind: "deleted" }
  | { kind: "not_found" }

export interface SourceRepository {
  deleteWithContent(id: number): Promise<SourceDeleteResult>
}
```

`apps/api/src/repository/drizzle/source-repository.ts`：

```ts
const findDeletionBlockReason = async (
  tx: DrizzleTransaction,
  sourceId: number,
): Promise<SourceDeletionBlockReason | null> => {
  const [collectionRun] = await tx
    .select({ id: sourceCollectionRuns.id })
    .from(sourceCollectionRuns)
    .where(and(
      eq(sourceCollectionRuns.sourceId, sourceId),
      inArray(sourceCollectionRuns.status, ACTIVE_SOURCE_COLLECTION_RUN_STATUSES),
    ))
    .limit(1)
  if (collectionRun) return "collecting"

  const passageIds = tx
    .select({ id: passages.id })
    .from(passages)
    .innerJoin(sourceDocuments, eq(passages.sourceDocumentId, sourceDocuments.id))
    .where(eq(sourceDocuments.sourceId, sourceId))

  const [published] = await tx
    .select({ id: passages.id })
    .from(passages)
    .where(and(inArray(passages.id, passageIds), eq(passages.status, "published")))
    .limit(1)
  if (published) return "published"

  const [attempt] = await tx
    .select({ id: readingAttempts.id })
    .from(readingAttempts)
    .where(inArray(readingAttempts.passageId, passageIds))
    .limit(1)
  if (attempt) return "attempted"

  const [audio] = await tx
    .select({ id: passageAudios.id })
    .from(passageAudios)
    .where(inArray(passageAudios.passageId, passageIds))
    .limit(1)
  if (audio) return "audio"

  const [audioUsage] = await tx
    .select({ id: audioSynthesisUsages.id })
    .from(audioSynthesisUsages)
    .where(inArray(audioSynthesisUsages.passageId, passageIds))
    .limit(1)
  return audioUsage ? "audio" : null
}

public async deleteWithContent(id: number): Promise<SourceDeleteResult> {
  return this._db.transaction(async (tx) => {
    const [source] = await tx.select({ id: sources.id }).from(sources).where(eq(sources.id, id)).for("update")
    if (!source) return { kind: "not_found" }

    const reason = await findDeletionBlockReason(tx, id)
    if (reason !== null) return { kind: "blocked", reason }

    const documentIds = tx.select({ id: sourceDocuments.id }).from(sourceDocuments).where(eq(sourceDocuments.sourceId, id))
    const deletedPassages = await tx
      .delete(passages)
      .where(inArray(passages.sourceDocumentId, documentIds))
      .returning({ id: passages.id })
    await tx.delete(sourceDocuments).where(eq(sourceDocuments.sourceId, id))
    await tx.delete(sources).where(eq(sources.id, id))
    return { deletedPassageCount: deletedPassages.length, kind: "deleted" }
  })
}
```

### Service

`apps/api/src/service/source-service.ts`：

```ts
export const deleteSource = async (
  id: number,
  repo: SourceCollectionRepo,
  deps: { now: Date },
): Promise<Result<{ deleted: true }>> => {
  await failTimedOutCollectionRuns(deps.now, repo, id)
  const result = await repo.sourceRepository.deleteWithContent(id)
  if (result.kind === "not_found") {
    logger.debug("SourceService: Source not found for deletion", { id })
    return err(notFoundError("Source not found"))
  }
  if (result.kind === "blocked") {
    logger.debug("SourceService: Source deletion was blocked", { id, reason: result.reason })
    return err(conflictError(`Source cannot be deleted: ${result.reason}`))
  }
  logger.info("SourceService: Source deleted", { id, deletedPassageCount: result.deletedPassageCount })
  return ok({ deleted: true })
}
```

### Controller とルート

`apps/api/src/controller/admin/source/delete.ts` に `AdminSourceDeleteController` を作る（`AdminTagDeleteController` と同じ形。`now: new Date()` を渡す）。`admin-router.ts` に `router.delete("/source/:id", ...)` を足し、`src/index.ts` で組み立てる。

## 動作確認

`apps/api/test/controller/admin/source/delete.test.ts`（実 DB のインテグレーションテスト）：

- 正常系
  - 本文候補・設問・文書・タグの紐付け・収集の記録が消えて 204 を返す。タグと別のソースのデータは残る
  - 非公開に戻した問題でも、解答の記録と音声が無ければ消える
  - 時間切れの収集は片付けて消す
- 異常系
  - 公開中の問題、解答の記録、`passage_audios`、`audio_synthesis_usages`、収集中で 409 を返し、何も消えない
  - 存在しない id は 404、数値でない id は 400、token なしは 401
