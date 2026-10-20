# step3-cron-reextraction

抽出の版 `EXTRACTION_VERSION` を持ち、版が古い取得済みの文書を次の収集で切り分け直す。切り分け直した文書の `collected` のうち、新しい切り分けに無いものを却下する。仕様と理由は [README](../README.md#抽出の版)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/cron/src/lib/document/const.ts`・`index.ts` | `EXTRACTION_VERSION` |
| `apps/cron/src/const/collection.ts` | `SUPERSEDED_PASSAGE_REJECT_REASON` |
| `apps/cron/src/repository/source-document-repository.ts`・`drizzle/` | `markFetched` で `extraction_version` を書く |
| `apps/cron/src/repository/content-source-repository.ts`・`drizzle/` | `markCollected` で commit SHA と抽出の版を一緒に書く |
| `apps/cron/src/repository/passage-repository.ts`・`drizzle/` | `rejectSupersededCollected` |
| `apps/cron/src/service/collection/types.ts` | `CollectionRepo.passageRepository` の `Pick` に `"rejectSupersededCollected"` を足し、JSDoc を「収集は本文候補の挿入と、切り分け直した文書の前の本文候補の却下だけを使う」に直す |
| `apps/cron/src/service/collection/reject-superseded-passages.ts`・`index.ts` | `rejectSupersededPassages`（GitHub とサイトで共有）。`index.ts` の `export *` にファイル名順で足す |
| `apps/cron/src/service/collection/collect-github-source.ts` | 版の比較、切り分け直し、却下 |
| `apps/cron/src/service/collection/collect-website-source.ts` | 同上 |
| `apps/cron/test/` | 下の「動作確認」 |
| `apps/cron/CLAUDE.md` | `EXTRACTION_VERSION` を上げる規則、collect:passages の説明 |
| `docs/spec/content-collection/README.md` | 「取得元の文書が更新されたとき」「GitHub API での取得と差分検出」「サイトのクロール」「調整できる箇所」 |
| `docs/spec/question-generation/README.md` | 状態の遷移に `collected → rejected`（切り分け直し）、「却下」の説明 |

### 版と理由の定数

`lib/document/const.ts`：

```ts
export const EXTRACTION_VERSION = "2026-10-20.1"
```

- 実装した日の日付にする。コメントに「`lib/document` の変更のうち、ブロック・切り分け・本文候補の条件が変わるものをしたら上げる。上げると取得済みの文書を次の収集で切り分け直す」と書く
- `lib/document/index.ts` から re-export する（ファイル名順）

`const/collection.ts`：

```ts
export const SUPERSEDED_PASSAGE_REJECT_REASON = "切り分け直したため、新しい本文候補に置き換えた"
```

### Repository

`source-document-repository.ts`：

```ts
export type MarkFetchedInput = {
  blobSha: string | null
  commitSha: string | null
  contentHash: string | null
  etag: string | null
  extractionVersion: string
  fetchedAt: Date
  httpStatus: number | null
  lastModified: string | null
  title: string | null
}
```

`content-source-repository.ts`（`lastCollectedCommitSha` を置き換える）：

```ts
export type MarkCollectedInput = {
  lastCollectedAt: Date
  lastCollectedCommit?: { expectedSha: string | null; extractionVersion: string; nextSha: string }
}
```

```ts
  public async markCollected(id: number, input: MarkCollectedInput): Promise<boolean> {
    const commit = input.lastCollectedCommit
    const isTarget = eq(contentSources.id, id)
    const result = await this._db
      .update(contentSources)
      .set({
        lastCollectedAt: input.lastCollectedAt,
        ...(commit === undefined
          ? {}
          : { lastCollectedCommitSha: commit.nextSha, lastCollectedExtractionVersion: commit.extractionVersion }),
      })
      .where(commit === undefined
        ? isTarget
        : and(
          isTarget,
          commit.expectedSha === null
            ? isNull(contentSources.lastCollectedCommitSha)
            : eq(contentSources.lastCollectedCommitSha, commit.expectedSha),
        ))
    return (result.rowCount ?? 0) > 0
  }
```

`passage-repository.ts`：

```ts
  rejectSupersededCollected(input: {
    keepContentHashes: string[]
    reason: string
    sourceDocumentId: number
  }): Promise<number>
```

```ts
  public async rejectSupersededCollected(input: {
    keepContentHashes: string[]
    reason: string
    sourceDocumentId: number
  }): Promise<number> {
    const rows = await this._db
      .update(passages)
      .set({ rejectReason: input.reason, status: "rejected" })
      .where(and(
        eq(passages.sourceDocumentId, input.sourceDocumentId),
        eq(passages.status, "collected"),
        ...(input.keepContentHashes.length === 0 ? [] : [notInArray(passages.contentHash, input.keepContentHashes)]),
      ))
      .returning({ id: passages.id })
    return rows.length
  }
```

- interface の JSDoc に「その文書の collected のうち content_hash が keepContentHashes に無いものを rejected にし、件数を返す。collected 以外の行は変えない」と書く

### GitHub（`collect-github-source.ts`）

```ts
  const commitSha = await deps.githubContentClient.getLatestCommitSha(source.repository, source.branch)
  if (commitSha === source.lastCollectedCommitSha && source.lastCollectedExtractionVersion === EXTRACTION_VERSION) {
    await repo.contentSourceRepository.markCollected(source.id, { lastCollectedAt: now })
    return { createdPassageCount: 0, fetchedDocumentCount: 0, status: "up_to_date" }
  }

  const { files, isComplete } = await listGitHubTargetFiles({ commitSha, source }, deps)
  const documents = await repo.sourceDocumentRepository.findBySourceId(source.id)
  const documentByPath = new Map(documents.map((document) => [document.path, document]))
  const changedFiles = files.filter((file) => isFileToExtract(file, documentByPath.get(file.path)))
```

```ts
const isFileToExtract = (file: GitHubTreeEntry, document: SourceDocument | undefined): boolean =>
  document === undefined || document.blobSha !== file.sha || document.extractionVersion !== EXTRACTION_VERSION
```

`collectFile`：

```ts
  const createdPassageCount = await repo.passageRepository.insertIgnoringDuplicates(...)
  if (extracted !== null) {
    await rejectSupersededPassages({ candidates: extracted.candidates, documentId: document.id, sourceId: source.id }, repo)
  }
  await repo.sourceDocumentRepository.markFetched(document.id, {
    blobSha: file.sha,
    commitSha,
    contentHash: extracted?.contentHash ?? null,
    etag: null,
    extractionVersion: EXTRACTION_VERSION,
    fetchedAt: now,
    httpStatus: null,
    lastModified: null,
    title,
  })
```

全件処理できたとき：

```ts
    status === "completed"
      ? {
        lastCollectedAt: now,
        lastCollectedCommit: {
          expectedSha: source.lastCollectedCommitSha,
          extractionVersion: EXTRACTION_VERSION,
          nextSha: commitSha,
        },
      }
      : { lastCollectedAt: now },
```

- ファイルを列挙したときの info のログに `extractionVersion` を足す

### 却下（GitHub とサイトで共有）

`service/collection/reject-superseded-passages.ts` に置き、両方から呼ぶ。

```ts
export const rejectSupersededPassages = async (
  input: { candidates: PassageChunk[]; documentId: number; sourceId: number },
  repo: CollectionRepo,
): Promise<void> => {
  const rejectedCount = await repo.passageRepository.rejectSupersededCollected({
    keepContentHashes: input.candidates.map((candidate) => candidate.contentHash),
    reason: SUPERSEDED_PASSAGE_REJECT_REASON,
    sourceDocumentId: input.documentId,
  })
  if (rejectedCount > 0) {
    logger.info("superseded collected passages were rejected", {
      documentId: input.documentId,
      rejectedCount,
      sourceId: input.sourceId,
    })
  }
}
```

### サイト（`collect-website-source.ts`）

```ts
const isExtractionOutdated = (document: SourceDocument): boolean => document.extractionVersion !== EXTRACTION_VERSION
```

`fetchPageRecordingThrottle`：版が古いページは条件付きリクエストを送らない。

```ts
    return await client.fetchPage(
      url,
      isExtractionOutdated(document)
        ? { etag: null, lastModified: null }
        : { etag: document.etag, lastModified: document.lastModified },
    )
```

`savePage`：

```ts
  const shouldCreatePassages = isTargetPage
    && !isRedirectedOutOfTarget
    && (extracted.contentHash !== document.contentHash || isExtractionOutdated(document))
  const createdPassageCount = shouldCreatePassages
    ? await repo.passageRepository.insertIgnoringDuplicates(...)
    : 0
  if (shouldCreatePassages) {
    await rejectSupersededPassages({ candidates: extracted.candidates, documentId: document.id, sourceId: source.id }, repo)
  }
  await repo.sourceDocumentRepository.markFetched(document.id, {
    blobSha: null,
    commitSha: null,
    contentHash: extracted.contentHash,
    etag: page.etag,
    extractionVersion: EXTRACTION_VERSION,
    fetchedAt: now,
    httpStatus: page.status,
    lastModified: page.lastModified,
    title: extracted.title,
  })
```

- 抽出に失敗したページ（`markResponse`）は今のまま（版を記録しない）

### ドキュメント

- `content-collection/README.md`
  - 「取得元の文書が更新されたとき」：切り分け直した文書の `collected` のうち新しい切り分けに無いものを却下することを足す
  - 「GitHub API での取得と差分検出」：手順 1（抽出の版も同じときだけ終える）・4（版が違うファイルも取る）・6（版も記録する）
  - 「サイトのクロール」：「条件付きリクエスト」「内容の比較」の行に、版が古いページは条件付きリクエストを送らず、ハッシュが同じでも切り分け直すことを足す
  - 「調整できる箇所」：「cron のコードの変更は、取得済みの文書には効かない」の箇条を、`EXTRACTION_VERSION` を上げると取得済みの文書も次の収集で切り分け直す（GitHub は次の収集、サイトは取り直しの順番が来たとき）に書き換え、表の `lib/document` の行の「効く範囲」に「`EXTRACTION_VERSION` を上げる」を添える
- `question-generation/README.md`：状態の遷移図に `collected --> rejected: 切り分け直しで置き換え`、状態の表の「却下」に「切り分け直しで置き換えた本文候補」
- `apps/cron/CLAUDE.md`：`collect-github-source.ts` / `collect-website-source.ts` の行に版と却下、`PROMPT_VERSION` の箇条の近くに `EXTRACTION_VERSION` を上げる規則

## 動作確認

### テスト

`test/repository/drizzle/`：

- `source-document-repository.test.ts`：`markFetched` が `extractionVersion` を書く
- `content-source-repository.test.ts`：`lastCollectedCommit` を渡すと `last_collected_commit_sha` と `last_collected_extraction_version` を同じ UPDATE で書き、WHERE に期待する commit SHA が入る。渡さなければ `last_collected_at` だけ
- `passage-repository.test.ts`：`rejectSupersededCollected` の UPDATE の SQL（`source_document_id`・`status = 'collected'`・`content_hash not in`）と値。`keepContentHashes` が空なら `not in` を付けない。件数を返す

`test/service/collection/collect-github-source.test.ts`：

- commit SHA と抽出の版が前回と同じなら `up_to_date`（今のテストのソースに `lastCollectedExtractionVersion: EXTRACTION_VERSION` を足す）
- commit SHA が同じでも抽出の版が違えばツリーを取り、blob SHA が同じでも版が古いファイルを取り直す
- blob SHA も版も同じファイルは取らない
- `markFetched` に `extractionVersion: EXTRACTION_VERSION`
- 本文候補を挿入した後、その文書の id と新しい本文候補の `content_hash` で `rejectSupersededCollected` を呼ぶ
- 抽出に失敗したファイル（壊れた MDX）は `rejectSupersededCollected` を呼ばず、版は記録する
- `completed` で `markCollected` に commit SHA と版を渡す。`limit_reached` では渡さない

`test/service/collection/collect-website-source.test.ts`：

- 版が古いページは `fetchPage` に `etag: null, lastModified: null` を渡し、ハッシュが前回と同じでも本文候補を挿入して `rejectSupersededCollected` を呼ぶ
- 版が今と同じでハッシュも同じページは本文候補を作らず、`rejectSupersededCollected` も呼ばない（今の挙動）
- 対象パス外のページ・リダイレクトで対象パス外になったページは、版が古くても本文候補を作らない
- `markFetched` に `extractionVersion: EXTRACTION_VERSION`

`test/service/collection/helpers.ts` の偽の Repository に `rejectSupersededCollected` を足す。

```bash
pnpm --filter cron test
pnpm --filter cron exec tsc --noEmit
```

### dev で確かめる

dev にはサイトのソースが無いので、GitHub（React 公式ドキュメント）で確かめる。サイトはテストで確かめる。

1. admin のソースの編集で、React 公式ドキュメントの除外パスに [README の 6 ページ](../README.md#章の概要ページを外す)を足す
2. 文書数を絞って収集する。取得済みの `add-react-to-an-existing-project.md`（blob SHA は同じで版が `NULL`）を取り直し、版が記録されること、その文書の `collected` のうち新しい切り分けに無いものが `rejected` になることを確かめる。除外した `adding-interactivity.md` は取り直さない

```bash
COLLECT_MAX_DOCUMENTS_PER_SOURCE=3 pnpm --filter cron collect:passages --source-id=<id>
docker exec -i tech-english-postgres psql -U postgres -d "tech-english_dev" -c \
  "SELECT id, path, extraction_version FROM source_documents WHERE source_id = <id> ORDER BY id"
docker exec -i tech-english-postgres psql -U postgres -d "tech-english_dev" -c \
  "SELECT p.id, d.path, p.status, p.reject_reason, p.title FROM passages p JOIN source_documents d ON d.id = p.source_document_id WHERE d.source_id = <id> ORDER BY p.id"
```

3. 上限なしで収集して `completed` になり、`content_sources` に commit SHA と版が記録されること。もう一度実行すると `up_to_date` になること
4. 作った本文候補を数件 admin のプレビューで開き、`<YouWillLearn>`・`<Recap>` の一覧が無いこと、続きの捨てられた段落が「.」で終わっていることを見る
5. 除外した `adding-interactivity.md` の `collected` の本文候補は却下されずに残ること（今と同じ。admin の却下は下書きからなので、ここでは生成も却下もしない）
