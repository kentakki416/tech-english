# step3-cron-reextraction

抽出の版 `EXTRACTION_VERSION` を持ち、版が古い取得済みの文書を次の収集で切り分け直す。切り分け直すときは、生成中・生成した本文候補（下書き・公開済み・生成した後に却下したもの）と同じ見出しの塊を新しい本文候補にせず、その文書の `collected` のうち新しい切り分けに無いものを却下する。収集の対象から外れた文書の `collected` も却下する。仕様と理由は [README](../README.md#抽出の版)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/cron/src/lib/document/const.ts`・`index.ts` | `EXTRACTION_VERSION` |
| `apps/cron/src/const/collection.ts` | 却下の理由 2 つ |
| `apps/cron/src/repository/source-document-repository.ts`・`drizzle/` | `markFetched` で `extraction_version` を書く、`findWithCollectedPassages` |
| `apps/cron/src/repository/source-repository.ts`・`drizzle/` | `markCollected` で commit SHA と抽出の版を一緒に書く |
| `apps/cron/src/repository/passage-repository.ts`・`drizzle/` | `findGeneratedOrGeneratingTitles`・`rejectCollected` |
| `apps/cron/src/service/collection/types.ts` | `CollectionRepo.passageRepository` の `Pick` に `"findGeneratedOrGeneratingTitles"`・`"rejectCollected"` を足し、JSDoc を「収集は本文候補の挿入と、見出しの確認、`collected` の却下だけを使う」に直す |
| `apps/cron/src/service/collection/replace-passage-candidates.ts`・`reject-out-of-target-passages.ts`・`index.ts` | 本文候補の保存と前の切り分けの却下、対象から外れた文書の却下（GitHub とサイトで共有）。`index.ts` の `export *` にファイル名順で足す |
| `apps/cron/src/service/collection/collect-github-source.ts` | 版の比較、切り分け直し、対象から外れた文書の却下 |
| `apps/cron/src/service/collection/collect-website-source.ts` | 同上 |
| `apps/cron/test/` | 下の「動作確認」 |
| `apps/cron/CLAUDE.md` | `EXTRACTION_VERSION` を上げる規則、collect:passages の説明 |
| `docs/spec/content-collection/README.md` | 「取得元の文書が更新されたとき」「GitHub API での取得と差分検出」「サイトのクロール」「調整できる箇所」 |
| `docs/spec/question-generation/README.md` | 状態の遷移に `collected → rejected`（切り分け直し・収集の対象外）、「却下」の説明 |

### 版と理由の定数

`lib/document/const.ts`：

```ts
export const EXTRACTION_VERSION = "2026-10-20.1"
```

- 実装した日の日付にする。コメントに「`lib/document` の変更のうち、ブロック・切り分け・本文候補の条件が変わるものをしたら上げる。上げると取得済みの文書を次の収集で切り分け直す」と書く
- `lib/document/index.ts` から re-export する（ファイル名順）

`const/collection.ts`：

```ts
export const SUPERSEDED_PASSAGE_REJECT_REASON = "切り分け直したため、前の切り分けの本文候補を外した"

export const OUT_OF_TARGET_PASSAGE_REJECT_REASON = "除外パスに入ったか取得元から消えたため、収集の対象から外した"
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

```ts
  findWithCollectedPassages(sourceId: number): Promise<SourceDocument[]>
```

```ts
  public async findWithCollectedPassages(sourceId: number): Promise<SourceDocument[]> {
    const rows = await this._db
      .select()
      .from(sourceDocuments)
      .where(and(
        eq(sourceDocuments.sourceId, sourceId),
        sql`EXISTS (SELECT 1 FROM ${passages} WHERE ${passages.sourceDocumentId} = ${sourceDocuments.id} AND ${passages.status} = 'collected')`,
      ))
      .orderBy(asc(sourceDocuments.id))
    return rows.map((row) => this._toDomain(row))
  }
```

- interface の JSDoc に「`collected` の本文候補を持つ文書」と書く。サイトは対象パス外のページの行が多いので、全行を読まずに本文候補のある文書だけを読む

`source-repository.ts`（`lastCollectedCommitSha` を置き換える）：

```ts
export type MarkCollectedInput = {
  lastCollectedAt: Date
  lastCollectedCommit?: { expectedSha: string | null; extractionVersion: string; nextSha: string }
}
```

```ts
  public async markCollected(id: number, input: MarkCollectedInput): Promise<boolean> {
    const commit = input.lastCollectedCommit
    const isTarget = eq(sources.id, id)
    const result = await this._db
      .update(sources)
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
            ? isNull(sources.lastCollectedCommitSha)
            : eq(sources.lastCollectedCommitSha, commit.expectedSha),
        ))
    return (result.rowCount ?? 0) > 0
  }
```

`passage-repository.ts`：

```ts
  findGeneratedOrGeneratingTitles(sourceDocumentId: number): Promise<string[]>
  rejectCollected(input: { keepContentHashes: string[]; reason: string; sourceDocumentIds: number[] }): Promise<number>
```

```ts
  public async findGeneratedOrGeneratingTitles(sourceDocumentId: number): Promise<string[]> {
    const rows = await this._db
      .selectDistinct({ title: passages.title })
      .from(passages)
      .where(and(
        eq(passages.sourceDocumentId, sourceDocumentId),
        or(
          inArray(passages.status, ["draft", "generating", "published"]),
          and(eq(passages.status, "rejected"), isNotNull(passages.generatedAt)),
        ),
      ))
    return rows.map((row) => row.title)
  }

  public async rejectCollected(input: {
    keepContentHashes: string[]
    reason: string
    sourceDocumentIds: number[]
  }): Promise<number> {
    if (input.sourceDocumentIds.length === 0) return 0
    const rows = await this._db
      .update(passages)
      .set({ rejectReason: input.reason, status: "rejected" })
      .where(and(
        inArray(passages.sourceDocumentId, input.sourceDocumentIds),
        eq(passages.status, "collected"),
        ...(input.keepContentHashes.length === 0 ? [] : [notInArray(passages.contentHash, input.keepContentHashes)]),
      ))
      .returning({ id: passages.id })
    return rows.length
  }
```

- `rejectCollected` の interface の JSDoc に「文書の collected のうち content_hash が keepContentHashes に無いものを rejected にし、件数を返す。collected 以外の行は変えない」と書く

### GitHub（`collect-github-source.ts`）

```ts
  const commitSha = await deps.githubContentClient.getLatestCommitSha(source.repository, source.branch)
  if (commitSha === source.lastCollectedCommitSha && source.lastCollectedExtractionVersion === EXTRACTION_VERSION) {
    await repo.sourceRepository.markCollected(source.id, { lastCollectedAt: now })
    return { createdPassageCount: 0, fetchedDocumentCount: 0, status: "up_to_date" }
  }

  const { files, isComplete } = await listGitHubTargetFiles({ commitSha, source }, deps)
  const listedPaths = new Set(files.map((file) => file.path))
  await rejectOutOfTargetPassages({
    isOutOfTarget: (document) => !listedPaths.has(document.path) && (isComplete || !isTargetPath(document.path, source)),
    sourceId: source.id,
  }, repo)
  const documents = await repo.sourceDocumentRepository.findBySourceId(source.id)
  const documentByPath = new Map(documents.map((document) => [document.path, document]))
  const changedFiles = files.filter((file) => isFileToExtract(file, documentByPath.get(file.path)))
```

- ツリーが切り詰められていた（`isComplete` が false）ときは、列挙できなかっただけのファイルを消えたとみなさないよう、対象パスから外れた文書だけを却下する

```ts
const isFileToExtract = (file: GitHubTreeEntry, document: SourceDocument | undefined): boolean =>
  document === undefined || document.blobSha !== file.sha || document.extractionVersion !== EXTRACTION_VERSION
```

`collectFile`：

```ts
  const createdPassageCount = extracted === null
    ? 0
    : await replacePassageCandidates({
      candidates: extracted.candidates,
      documentId: document.id,
      now,
      sourceCommitSha: commitSha,
      sourceId: source.id,
      sourcePath: file.path,
    }, repo)
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
- `collectGitHubSource` の JSDoc の「取得元から消えたファイルの source_documents / passages は何もしない（公開済みの問題は残す）」を、取得元から消えたファイル・対象パスから外れたファイルは `collected` の本文候補だけを却下する（下書き・公開済みは残す）に直す

### 本文候補の保存と却下（GitHub とサイトで共有）

`service/collection/replace-passage-candidates.ts`：

```ts
export const replacePassageCandidates = async (
  input: {
    candidates: PassageChunk[]
    documentId: number
    now: Date
    sourceCommitSha: string | null
    sourceId: number
    sourcePath: string
  },
  repo: CollectionRepo,
): Promise<number> => {
  const generatedTitles = new Set(await repo.passageRepository.findGeneratedOrGeneratingTitles(input.documentId))
  const candidatesToInsert = input.candidates.filter((candidate) => !generatedTitles.has(candidate.title))
  const createdPassageCount = await repo.passageRepository.insertIgnoringDuplicates(
    candidatesToInsert.map((candidate) => ({
      blocks: candidate.blocks,
      contentHash: candidate.contentHash,
      sourceCommitSha: input.sourceCommitSha,
      sourceDocumentId: input.documentId,
      sourcePath: input.sourcePath,
      sourceRetrievedAt: input.now,
      title: candidate.title,
      wordCount: candidate.wordCount,
    })),
  )
  const rejectedCount = await repo.passageRepository.rejectCollected({
    keepContentHashes: candidatesToInsert.map((candidate) => candidate.contentHash),
    reason: SUPERSEDED_PASSAGE_REJECT_REASON,
    sourceDocumentIds: [input.documentId],
  })
  if (rejectedCount > 0) {
    logger.info("superseded collected passages were rejected", {
      documentId: input.documentId,
      rejectedCount,
      sourceId: input.sourceId,
    })
  }
  return createdPassageCount
}
```

- `findGeneratedOrGeneratingTitles` の interface の JSDoc に、生成した後の却下を `generated_at` で見分けること（LLM・管理者の却下は入り、収集が外した未生成の却下は入らない）を書く
- JSDoc に、同じ見出しの生成中・生成した本文候補がある塊は挿入しないこと（同じ節の問題を二重に作らず、題材に向かないと判断した節をもう一度生成に回さないため）、その文書の `collected` のうち挿入した塊に無いもの（同じ見出しの下書きがある `collected` を含む）を却下すること、挿入と却下を同じトランザクションにしない理由（[README](../README.md#古い本文候補の却下)）を書く

`service/collection/reject-out-of-target-passages.ts`：

```ts
export const rejectOutOfTargetPassages = async (
  input: { isOutOfTarget: (document: SourceDocument) => boolean; sourceId: number },
  repo: CollectionRepo,
): Promise<void> => {
  const documents = await repo.sourceDocumentRepository.findWithCollectedPassages(input.sourceId)
  const outOfTargetDocuments = documents.filter(input.isOutOfTarget)
  if (outOfTargetDocuments.length === 0) return
  const rejectedCount = await repo.passageRepository.rejectCollected({
    keepContentHashes: [],
    reason: OUT_OF_TARGET_PASSAGE_REJECT_REASON,
    sourceDocumentIds: outOfTargetDocuments.map((document) => document.id),
  })
  logger.info("collected passages of out-of-target documents were rejected", {
    paths: outOfTargetDocuments.map((document) => document.path),
    rejectedCount,
    sourceId: input.sourceId,
  })
}
```

### サイト（`collect-website-source.ts`）

```ts
const isExtractionOutdated = (document: SourceDocument): boolean => document.extractionVersion !== EXTRACTION_VERSION

const isGonePage = (document: SourceDocument): boolean =>
  document.httpStatus !== null && GONE_HTTP_STATUSES.includes(document.httpStatus)
```

`collectWebsiteSource`：取得の前（`createWebPageClient` の後、`try` の前）に、対象パスから外れたページと 404 / 410 のページの `collected` を却下する。

```ts
  await rejectOutOfTargetPassages({
    isOutOfTarget: (document) => !isTargetPath(document.path, source) || isGonePage(document),
    sourceId: source.id,
  }, repo)
```

- 404 / 410 になったページは、その回の取得では却下せず、次の回の始めに却下する（取得のループを変えずに、GitHub と同じ「対象から外れた文書」の判定にまとめるため）
- JSDoc の手順に「取得の前に、対象パスから外れたページと 404 / 410 のページの `collected` を却下する」を足す

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
    ? await replacePassageCandidates({
      candidates: extracted.candidates,
      documentId: document.id,
      now,
      sourceCommitSha: null,
      sourceId: source.id,
      sourcePath: document.path,
    }, repo)
    : 0
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
  - 「取得元の文書が更新されたとき」：「更新された箇所は、次回以降の収集で新しい本文候補として取り込まれる」に、同じ見出しの生成中・生成した本文候補がある塊は新しい本文候補にしないこと、切り分け直した文書の `collected` のうち新しい本文候補に無いものを却下することを足す。「取得元の文書が削除されても、公開済みの問題は残す」に、削除された文書・除外パスに入れた文書の `collected` は却下することを足す
  - 「GitHub API での取得と差分検出」：手順 1（抽出の版も同じときだけ終える）・2（列挙の後に対象から外れた文書の `collected` を却下する）・4（版が違うファイルも取る）・6（版も記録する）
  - 「サイトのクロール」：「条件付きリクエスト」「内容の比較」の行に、版が古いページは条件付きリクエストを送らず、ハッシュが同じでも切り分け直すことを足す。取得の前に対象から外れたページの `collected` を却下することを足す
  - 「調整できる箇所」：「cron のコードの変更は、取得済みの文書には効かない」の箇条を、`EXTRACTION_VERSION` を上げると取得済みの文書も次の収集で切り分け直す（GitHub は次の収集、サイトは取り直しの順番が来たとき）に書き換え、表の `lib/document` の行の「効く範囲」に「`EXTRACTION_VERSION` を上げる」を添える。「ソースのどの文書を対象にするか」の行の「除外した文書から作った本文候補は残る」を、次の収集で未生成の本文候補を却下する（下書き・公開済みは残る）に直す
- `question-generation/README.md`：状態の遷移図に `collected --> rejected: 切り分け直し・収集の対象外で外す`、状態の表の「却下」に「切り分け直した・収集の対象から外れた文書の未生成の本文候補」
- `apps/cron/CLAUDE.md`：`collect-github-source.ts` / `collect-website-source.ts` の行に版・同じ見出しの扱い・却下、`PROMPT_VERSION` の箇条の近くに `EXTRACTION_VERSION` を上げる規則

## 動作確認

### テスト

`test/repository/drizzle/`：

- `source-document-repository.test.ts`：`markFetched` が `extractionVersion` を書く。`findWithCollectedPassages` の SQL（`source_id` と、`status = 'collected'` の本文候補の `exists`）
- `source-repository.test.ts`：`lastCollectedCommit` を渡すと `last_collected_commit_sha` と `last_collected_extraction_version` を同じ UPDATE で書き、WHERE に期待する commit SHA が入る。渡さなければ `last_collected_at` だけ
- `passage-repository.test.ts`：
  - `findGeneratedOrGeneratingTitles` の SQL（`source_document_id` と、`status in (draft, generating, published)` か `status = rejected` かつ `generated_at is not null`）と、見出しの配列を返すこと
  - `rejectCollected` の UPDATE の SQL（`source_document_id in (...)`・`status = 'collected'`・`content_hash not in`）と値。`keepContentHashes` が空なら `not in` を付けない。`sourceDocumentIds` が空なら UPDATE せずに 0。件数を返す

`test/service/collection/replace-passage-candidates.test.ts`：

- `findGeneratedOrGeneratingTitles` が返す見出しの塊は挿入しない
- 挿入した塊の `content_hash` を残して、その文書の `collected` を `SUPERSEDED_PASSAGE_REJECT_REASON` で却下する。すべての塊が同じ見出しで飛ばされたら、`keepContentHashes` は空
- 作った本文候補の件数を返す

`test/service/collection/reject-out-of-target-passages.test.ts`：

- `isOutOfTarget` に当たる文書の id で `rejectCollected` を `OUT_OF_TARGET_PASSAGE_REJECT_REASON`・`keepContentHashes: []` で呼ぶ
- 当たる文書が無ければ `rejectCollected` を呼ばない

`test/service/collection/collect-github-source.test.ts`：

- commit SHA と抽出の版が前回と同じなら `up_to_date`（今のテストのソースに `lastCollectedExtractionVersion: EXTRACTION_VERSION` を足す）。ツリーも取らず、却下もしない
- commit SHA が同じでも抽出の版が違えばツリーを取り、blob SHA が同じでも版が古いファイルを取り直す
- blob SHA も版も同じファイルは取らない
- ツリーに無い文書と除外パスに入った文書の `collected` を却下する。ツリーが切り詰められていたら、除外パスに入った文書だけを却下する
- `markFetched` に `extractionVersion: EXTRACTION_VERSION`
- 本文候補を挿入した後、その文書の id と挿入した本文候補の `content_hash` で `rejectCollected` を呼ぶ
- 抽出に失敗したファイル（壊れた MDX）は本文候補の挿入も却下もせず、版は記録する
- `completed` で `markCollected` に commit SHA と版を渡す。`limit_reached` では渡さない

`test/service/collection/collect-website-source.test.ts`：

- 取得の前に、対象パスから外れたページと 404 / 410 のページの `collected` を却下する
- 版が古いページは `fetchPage` に `etag: null, lastModified: null` を渡し、ハッシュが前回と同じでも本文候補を挿入して `rejectCollected` を呼ぶ
- 版が今と同じでハッシュも同じページは本文候補を作らず、前の切り分けの却下もしない（今の挙動）
- 対象パス外のページ・リダイレクトで対象パス外になったページは、版が古くても本文候補を作らない
- `markFetched` に `extractionVersion: EXTRACTION_VERSION`

`test/service/collection/helpers.ts` の偽の Repository に `findGeneratedOrGeneratingTitles`・`rejectCollected`・`findWithCollectedPassages` を足す。

```bash
pnpm --filter cron test
pnpm --filter cron exec tsc --noEmit
```

### dev で確かめる

dev にはサイトのソースが無いので、GitHub（React 公式ドキュメント）で確かめる。サイトはテストで確かめる。

1. admin のソースの編集で、React 公式ドキュメントの除外パスに [README の 6 ページ](../README.md#章の概要ページを外す)を足す
2. 文書数を絞って収集する。次のことを確かめる
   - 除外した `adding-interactivity.md` の `collected`（120「Render and commit」）が `OUT_OF_TARGET_PASSAGE_REJECT_REASON` で却下され、公開済みの 119・下書きの 121 は変わらないこと。`adding-interactivity.md` は取り直さないこと
   - 取得済みの `add-react-to-an-existing-project.md`（blob SHA は同じで版が `NULL`）を取り直して版が記録され、下書きの 116・117 と同じ見出しの塊は新しい本文候補にならないこと。`collected` の 118 は、新しい切り分けで内容が変わっていれば却下されて新しい本文候補ができ、同じなら残ること

```bash
COLLECT_MAX_DOCUMENTS_PER_SOURCE=3 pnpm --filter cron collect:passages --source-id=<id>
docker exec -i tech-english-postgres psql -U postgres -d "tech-english_dev" -c \
  "SELECT id, path, extraction_version FROM source_documents WHERE source_id = <id> ORDER BY id"
docker exec -i tech-english-postgres psql -U postgres -d "tech-english_dev" -c \
  "SELECT p.id, d.path, p.status, p.reject_reason, p.title FROM passages p JOIN source_documents d ON d.id = p.source_document_id WHERE d.source_id = <id> ORDER BY p.id"
```

3. 上限なしで収集して `completed` になり、`sources` に commit SHA と版が記録されること。もう一度実行すると `up_to_date` になること
4. 作った本文候補を数件 admin のプレビューで開き、`<YouWillLearn>`・`<Recap>` の一覧が無いこと、続きの捨てられた段落が「.」で終わっていることを見る
5. admin の「却下」に、2 つの理由で却下した本文候補が理由つきで出ること
