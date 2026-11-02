# step1: ソースの削除の API

`DELETE /api/admin/source/:id` を足す。方針は [README](../README.md#設計)。

## 対応内容

### DB

`passage_audios.passage_id` と `audio_synthesis_usages.passage_id` の `foreignKey` をスキーマから消し、`pnpm db:generate --name=drop_passage_foreign_keys_of_audio` でマイグレーションを作る。列と index は変えない。

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
export type SourceDeleteResult =
  | { kind: "collecting" }
  | { deletedAttemptCount: number; deletedPassageCount: number; kind: "deleted" }
  | { kind: "not_found" }

export interface SourceRepository {
  deleteWithContent(id: number): Promise<SourceDeleteResult>
}
```

`apps/api/src/repository/drizzle/source-repository.ts`：

```ts
public async deleteWithContent(id: number): Promise<SourceDeleteResult> {
  return this._db.transaction(async (tx): Promise<SourceDeleteResult> => {
    const [source] = await tx.select({ id: sources.id }).from(sources).where(eq(sources.id, id)).for("update")
    if (!source) return { kind: "not_found" }

    const [collectionRun] = await tx
      .select({ id: sourceCollectionRuns.id })
      .from(sourceCollectionRuns)
      .where(and(
        eq(sourceCollectionRuns.sourceId, id),
        inArray(sourceCollectionRuns.status, ACTIVE_SOURCE_COLLECTION_RUN_STATUSES),
      ))
      .limit(1)
    if (collectionRun) return { kind: "collecting" }

    const documentIds = tx.select({ id: sourceDocuments.id }).from(sourceDocuments).where(eq(sourceDocuments.sourceId, id))
    await tx.select({ id: passages.id }).from(passages).where(inArray(passages.sourceDocumentId, documentIds)).for("update")
    const passageIds = tx.select({ id: passages.id }).from(passages).where(inArray(passages.sourceDocumentId, documentIds))
    const deletedAttempts = await tx
      .delete(readingAttempts)
      .where(inArray(readingAttempts.passageId, passageIds))
      .returning({ id: readingAttempts.id })
    const deletedPassages = await tx
      .delete(passages)
      .where(inArray(passages.sourceDocumentId, documentIds))
      .returning({ id: passages.id })
    await tx.delete(sourceDocuments).where(eq(sourceDocuments.sourceId, id))
    await tx.delete(sources).where(eq(sources.id, id))
    return { deletedAttemptCount: deletedAttempts.length, deletedPassageCount: deletedPassages.length, kind: "deleted" }
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
  if (result.kind === "collecting") {
    logger.debug("SourceService: Source deletion was blocked by a running collection", { id })
    return err(conflictError("Source cannot be deleted while it is being collected"))
  }
  logger.info("SourceService: Source deleted", {
    id,
    deletedAttemptCount: result.deletedAttemptCount,
    deletedPassageCount: result.deletedPassageCount,
  })
  return ok({ deleted: true })
}
```

### Controller とルート

`apps/api/src/controller/admin/source/delete.ts` に `AdminSourceDeleteController` を作る（`AdminTagDeleteController` と同じ形。`now: new Date()` を渡す）。`admin-router.ts` に `router.delete("/source/:id", ...)` を足し、`src/index.ts` で組み立てる。

## 動作確認

`apps/api/test/repository/source-repository.test.ts` と `apps/api/test/controller/admin/source/delete.test.ts`（実 DB のインテグレーションテスト）：

- 正常系
  - 本文候補・設問・用語集・文書・タグの紐付け・収集の記録が消えて 204 を返す。タグと別のソースのデータは残る
  - 公開中の問題と、解答の記録・回答・調べた単語の記録も消える。別のソースの解答の記録は残る
  - `passage_audios` と `audio_synthesis_usages` の行は残る
  - 時間切れの収集は片付けて消す
- 異常系
  - 収集中で 409 を返し、公開中の問題も記録も消えない
  - 存在しない id は 404、数値でない id は 400、token なしは 401
