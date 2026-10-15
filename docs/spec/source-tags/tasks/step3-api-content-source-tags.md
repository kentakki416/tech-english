# step3-api-content-source-tags

ソースの API を、タグの名前の配列（`tags`）ではなく id の配列（`tag_ids`）で受け取り、タグを `{ id, name, color }` で返すように変える。ユーザー向けの問題一覧の絞り込みとタグ一覧を、`content_sources.tags`（jsonb）ではなく中間テーブル `content_source_tags` から読むように直す。cron と seed を直す。`content_sources.tags` 列はこの step では消さず、使わない列として残す（消すのは [step6](./step6-db-drop-content-sources-tags.md)）。仕様は [README の api の変更点](../README.md#api-の変更点) と [必要な API](../README.md#必要な-api)。

## 前提

- [step1-db-tags](./step1-db-tags.md)：`@repo/domain` の `TAG_COLORS`・`TagColor`・`Tag`、`@repo/db` の `tags`・`contentSourceTags`、既存のタグを移す migration
- [step2-api-admin-tag](./step2-api-admin-tag.md)：`@repo/api-schema` の `admin/tag.ts`（`tagSchema` = `{ id, color, name }`）、api の `TagRepository`（`findByIds(ids): Promise<Tag[]>`）と `DrizzleTagRepository`、`src/index.ts` の `tagRepository`
- step2 の `src/repository/drizzle/tag-row.ts` の `convertTagRowToDomain`（タグの行 → ドメイン）。この step の `DrizzleContentSourceRepository` からも使う
- step2 で `isUniqueViolation` が `src/repository/drizzle/content-source-repository.ts` から `src/repository/drizzle/pg-error.ts` に移っている。この step はそこに `isForeignKeyViolation` を足す

## 対応内容

| メソッド | パス | 変更 | 業務エラー（追加分） |
| --- | --- | --- | --- |
| POST | `/api/admin/content-source` | リクエストの `tags` → `tag_ids`。レスポンスの `tags` → `{ id, name, color }[]` | 400（`tag_ids` の重複・11 個以上・存在しない id） |
| PUT | `/api/admin/content-source/:id` | 登録と同じ | 400（同上） |
| GET | `/api/admin/content-source` | 各ソースに `tags`（`{ id, name, color }[]`）を足す | ― |
| GET | `/api/admin/content-source/:id` | `source.tags` → `{ id, name, color }[]` | ― |
| GET | `/api/passage`・`/api/passage/random` | 形は変えない。`?tag=` を大文字・小文字を区別せずに比べる。各問題の `source.tags` を名前の順（`lower(name)`）にする | ― |

タグの並びはどの API も `lower(name)` → `id` の順にする。

影響を受けるファイル（`content_sources.tags` / `ContentSource["tags"]` / ソースの `tags` を参照している箇所）：

| 場所 | 変更 |
| --- | --- |
| `packages/domain/src/types/content-source.ts` | `ContentSourceBase` から `tags` を消す |
| `packages/schema/src/api-schema/admin/content-source.ts` | `tags` → `tag_ids`、レスポンスの `tags` を `tagSchema` の配列に、一覧に `tags` を足す |
| `apps/api/src/repository/content-source-repository.ts`・`drizzle/content-source-repository.ts` | `ContentSourceWithTags`、`tagIds` の書き込み、タグの読み込み |
| `apps/api/src/service/content-source-service.ts` | タグの存在の確認（400） |
| `apps/api/src/controller/admin/content-source/*`・`src/index.ts` | mapper、create / update に `tagRepository` を渡す、一覧に `tags` |
| `apps/api/src/repository/passage-repository.ts`・`drizzle/passage-repository.ts` | `PassageSource` の `tags`、絞り込み、`findPublishedTags` |
| `apps/cron/src/repository/drizzle/content-source-repository.ts` | `_toDomain` から `tags` を消す |
| `packages/db/drizzle/seed-sample-passages.ts` | タグを `tags`・`content_source_tags` に入れる |
| `packages/db/src/drizzle/schema/content-source.ts` | `tags` 列は残し、使わない旨のコメントにする（[列は残す](#content_sourcestags-は残す)。消すのは step6） |
| テスト | 下の [動作確認](#動作確認) |

`apps/admin` の `content-source.form.ts`・`SourceForm.tsx` はこの step では直さない（[step5](./step5-admin-content-source-tags.md)）。この step の時点での admin への影響は [admin への影響](#admin-への影響この-step-では直さない) にまとめる。ユーザー向けの `api-schema/passage.ts`・web・mobile は変えない。

### @repo/domain

`ContentSourceBase` から `tags`（とそのコメント）を消す。cron はタグを使わないので、ドメインの `ContentSource` はタグを持たない。

### api-schema（`packages/schema/src/api-schema/admin/content-source.ts`）

```ts
import { tagSchema } from "./tag"

/**
 * 付けるタグの id（登録済みのタグから選ぶ）。重複は許さない。存在するかは service が確かめて 400 にする
 */
const tagIdListSchema = z
  .array(z.number().int().positive())
  .max(10)
  .refine((ids) => new Set(ids).size === ids.length, { message: "tag_ids must not contain duplicate ids" })

/**
 * 取得方法によらない共通の入力
 */
const sourceInputBaseSchema = z.object({
  exclude_globs: globListSchema,
  include_globs: globListSchema.min(1),
  kind: z.enum(SOURCE_KINDS),
  license_spdx: allowedLicenseSchema,
  license_url: webUrlSchema,
  name: z.string().trim().min(1).max(100),
  tag_ids: tagIdListSchema,
})
```

- `refine` は `tag_ids` の配列にだけ掛ける。`sourceInputBaseSchema` 自体に掛けると `ZodEffects` になって `.extend` できなくなる
- `tag_ids` は必須にする（`.default([])` にしない）。省略を空として受けると、古いフォームから保存したときにソースのタグが黙って全部外れるため
- レスポンス：`contentSourceBaseSchema` の `tags` を `z.array(tagSchema)` にする。`getContentSourceListResponseSchema` の各ソースにも `tags: z.array(tagSchema)` を足す（キーの順で `site_url` の後）
- 古い `tags`（名前の配列）を送ってきても Zod が捨て、`tag_ids` が無いので 400 になる

### Repository の interface（`src/repository/content-source-repository.ts`）

```ts
import type { ContentSource, GitHubRepositorySource, PassageStatus, Tag, WebsiteSource } from "@repo/domain"

type SourceInputBase = Pick<
  ContentSource,
  "excludeGlobs" | "includeGlobs" | "isEnabled" | "kind" | "licenseSpdx" | "licenseUrl" | "name"
> & {
  /**
   * 付けるタグの id（重複なし。存在するかは service が確かめる）
   */
  tagIds: number[]
}

/**
 * タグ（名前の順）つきのソース。admin のソースの API が返す
 */
export type ContentSourceWithTags = ContentSource & { tags: Tag[] }

/**
 * 登録・更新の結果。
 * - duplicate：repository / site_url の unique 制約に違反した（service の重複の事前検査と書き込みの間に、同じ取得元が別のリクエストで登録された）
 * - missing_tags：content_source_tags の外部キーに違反した（service がタグの存在を確かめた後、書き込みまでの間にタグが消された）
 */
export type ContentSourceSaveResult =
  | { kind: "duplicate" }
  | { kind: "missing_tags" }
  | { kind: "saved"; source: ContentSourceWithTags }

export interface ContentSourceRepository {
  /**
   * ソースと content_source_tags（input.tagIds）を 1 トランザクションで作る
   */
  create(input: ContentSourceInput): Promise<ContentSourceSaveResult>
  /**
   * id の昇順。各ソースのタグは名前の順
   */
  findAll(): Promise<ContentSourceWithTags[]>
  findById(id: number): Promise<ContentSourceWithTags | null>
  /**
   * 重複の検査に使うだけなのでタグは読まない
   */
  findByRepository(repository: string): Promise<ContentSource | null>
  findBySiteUrl(siteUrl: string): Promise<ContentSource | null>
  /**
   * input.fetchType の列と共通の列を書き、このソースの content_source_tags を input.tagIds に付け替える。
   * options の収集の状態も含めて 1 トランザクションで行う。対象が無い（id が無い・取得方法が違う）ときは throw する
   */
  update(id: number, input: ContentSourceInput, options: ContentSourceUpdateOptions): Promise<ContentSourceSaveResult>
  // countFailedPagesBySource / countPassagesBySource / findFailedPages / hasSourceDocuments は変えない
}
```

`ContentSourceInput`・`FailedPage`・`PassageCountRow`・`ContentSourceUpdateOptions` の形はそのまま（`SourceInputBase` の変更が `ContentSourceInput` に伝わる）。

### Drizzle の実装（`src/repository/drizzle/content-source-repository.ts`）

```ts
import {
  and,
  asc,
  contentSources,
  contentSourceTags,
  count,
  DrizzleClient,
  type DrizzleTransaction,
  eq,
  gte,
  inArray,
  passages,
  sourceDocuments,
  sql,
  tags,
} from "@repo/db"
import type { ContentSource, Tag } from "@repo/domain"

import { isForeignKeyViolation, isUniqueViolation } from "./pg-error"
import { convertTagRowToDomain } from "./tag-row"

/**
 * ソースごとのタグ（lower(name) → id の順）。1 回のクエリで全ソース分を取る（一覧で N+1 にしない）
 */
const findTagsBySourceIds = async (
  db: DrizzleClient | DrizzleTransaction,
  sourceIds: number[],
): Promise<Map<number, Tag[]>> => {
  const tagsBySourceId = new Map<number, Tag[]>(sourceIds.map((sourceId) => [sourceId, []]))
  if (sourceIds.length === 0) return tagsBySourceId
  const rows = await db
    .select({ sourceId: contentSourceTags.contentSourceId, tag: tags })
    .from(contentSourceTags)
    .innerJoin(tags, eq(contentSourceTags.tagId, tags.id))
    .where(inArray(contentSourceTags.contentSourceId, sourceIds))
    .orderBy(sql`lower(${tags.name})`, asc(tags.id))
  for (const row of rows) tagsBySourceId.get(row.sourceId)?.push(convertTagRowToDomain(row.tag))
  return tagsBySourceId
}

/**
 * ソースにタグを付けて返す
 */
const attachTags = async (
  db: DrizzleClient | DrizzleTransaction,
  sources: ContentSource[],
): Promise<ContentSourceWithTags[]> => {
  const tagsBySourceId = await findTagsBySourceIds(db, sources.map((source) => source.id))
  return sources.map((source) => ({ ...source, tags: tagsBySourceId.get(source.id) ?? [] }))
}

/**
 * このソースの content_source_tags を tagIds に付け替える（消してから入れ直す）。create / update のトランザクションの中で呼ぶ
 */
const replaceSourceTags = async (tx: DrizzleTransaction, sourceId: number, tagIds: number[]): Promise<void> => {
  await tx.delete(contentSourceTags).where(eq(contentSourceTags.contentSourceId, sourceId))
  if (tagIds.length === 0) return
  await tx.insert(contentSourceTags).values(tagIds.map((tagId) => ({ contentSourceId: sourceId, tagId })))
}
```

`src/repository/drizzle/pg-error.ts` に足す（step2 の `isUniqueViolation` と同じ形）：

```ts
/**
 * Postgres の外部キー制約違反の SQLSTATE
 */
const FOREIGN_KEY_VIOLATION = "23503"

/**
 * 外部キー制約違反か。Drizzle は pg のエラーを DrizzleQueryError の cause に入れる
 */
export const isForeignKeyViolation = (error: unknown): boolean => {
  const cause = typeof error === "object" && error !== null && "cause" in error ? error.cause : undefined
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === FOREIGN_KEY_VIOLATION
}
```

- `create` / `update` の unique 制約違反は、今までどおり重複の登録（`duplicate`）とみなせる。`content_sources` の unique 制約は主キーと `repository` / `site_url` だけで、`content_source_tags` はこのソースの分を消してから入れ直す（`tag_ids` の重複は api-schema が弾く）ため。呼び出し側のコメントにこの理由を書く
- 外部キー制約違反は `missing_tags` とみなせる。`content_sources` は外部キーを持たず、`content_source_tags` の `content_source_id` は同じトランザクションで作った・確かめた行を指すので、違反するのは `tag_id`（タグが消された）だけのため
- `buildColumnValues` から `tags: input.tags` を消す（`tagIds` は `content_sources` の列ではない）。`_toDomain` から `tags: row.tags` を消す
- `create`：`this._db.transaction` の中で `insert(contentSources)...returning()` → `replaceSourceTags(tx, row.id, input.tagIds)` → `attachTags(tx, [this._toDomain(row)])`。今の `create` はトランザクションを使っていないので、ここで包む
- `update`：今のトランザクションの中で、`shouldResetDocumentCache` の処理の後に `replaceSourceTags(tx, id, input.tagIds)` を呼び、最後に `attachTags(tx, [this._toDomain(updated)])` で返す。`content_sources` の更新が unique 制約違反で落ちたら、タグの付け替えもまとめて巻き戻る
- `create` / `update` の `catch`：`isUniqueViolation` なら `{ kind: "duplicate" }`、`isForeignKeyViolation` なら `{ kind: "missing_tags" }`、それ以外は throw し直す
- `findAll`：今のクエリの後に `attachTags(this._db, sources)`。`findById` も同じく 1 件で `attachTags`
- `findByRepository` / `findBySiteUrl` は今のまま（タグを読まない）

```ts
  public async create(input: ContentSourceInput): Promise<ContentSourceSaveResult> {
    try {
      const source = await this._db.transaction(async (tx) => {
        const [row] = await tx
          .insert(contentSources)
          .values({ ...buildColumnValues(input), fetchType: input.fetchType })
          .returning()
        await replaceSourceTags(tx, row.id, input.tagIds)
        const [created] = await attachTags(tx, [this._toDomain(row)])
        return created
      })
      return { kind: "saved", source }
    } catch (error) {
      if (isUniqueViolation(error)) return { kind: "duplicate" }
      if (isForeignKeyViolation(error)) return { kind: "missing_tags" }
      throw error
    }
  }
```

### Service（`src/service/content-source-service.ts`）

```ts
import { badRequestError, conflictError, err, notFoundError, ok, Result } from "@repo/errors"

import {
  ContentSourceInput,
  ContentSourceRepository,
  ContentSourceWithTags,
  FailedPage,
  PassageCountRow,
  TagRepository,
} from "../repository"

type ContentSourceRepo = { contentSourceRepository: ContentSourceRepository }

/**
 * 登録・更新で使う Repository。タグは存在の確認にだけ使う
 */
type ContentSourceWriteRepo = ContentSourceRepo & { tagRepository: Pick<TagRepository, "findByIds"> }

const TAG_NOT_FOUND_MESSAGE = "Tag not found"

/**
 * 存在しないタグの id の詳細の code（既存の details の code と同じく `{対象}_not_found` の snake_case）
 */
const TAG_NOT_FOUND_CODE = "tag_not_found"

/**
 * 存在しないタグの id の 400。admin は details の path（["tag_ids"]）で、取得元の変更の 400 と見分けてタグの欄に出す
 */
const buildTagNotFoundError = (message: string) =>
  badRequestError(TAG_NOT_FOUND_MESSAGE, [{ code: TAG_NOT_FOUND_CODE, message, path: ["tag_ids"] }])

/**
 * tagIds のうち tags に無い id（入力の順）。全部あれば空。
 * admin のフォームは登録済みのタグしか出さないが、送信までの間にタグの画面で消されることがある
 */
const findMissingTagIds = async (tagIds: number[], repo: ContentSourceWriteRepo): Promise<number[]> => {
  if (tagIds.length === 0) return []
  const existingIds = new Set((await repo.tagRepository.findByIds(tagIds)).map((tag) => tag.id))
  return tagIds.filter((tagId) => !existingIds.has(tagId))
}
```

- `getContentSources` / `getContentSourceById` は `ContentSourceRepo` のまま。戻り値の `source` の型を `ContentSourceWithTags` にする
- `createContentSource(input, repo: ContentSourceWriteRepo)`：最初に `findMissingTagIds`。空でなければ `logger.debug("ContentSourceService: Tag not found", { missingTagIds })` を出して `err(buildTagNotFoundError(...))` を返す（message は `Tag not found: id=99, 100` のように存在しない id を並べる。`create` を呼ばない）。その後は今の重複の検査 → `create`。結果が `missing_tags` なら `err(buildTagNotFoundError("Tag was deleted during the request"))`。戻り値は `Result<ContentSourceWithTags>`
- `updateContentSource(id, input, repo: ContentSourceWriteRepo)`：404 → 取得方法の変更（400）の後に `findMissingTagIds`（400）を置き、その後に今の取得元の変更（400）→ 重複（409）。`update` の結果が `missing_tags` なら同じ 400
- `findMissingTagIds` は入力の誤りなので、重複（409）より先に確かめる
- 400 の形は `{ details: [{ code: "tag_not_found", message, path: ["tag_ids"] }] }` の 1 件にそろえる（存在しない id が複数でも 1 件。どの id かは message に入れる）。取得方法の変更・取得元の変更の 400 は今までどおり details を付けない

### Controller・mapper・DI

`content-source-mapper.ts`：

```ts
import type { ContentSourceResponse, CreateContentSourceRequest, UpdateContentSourceRequest } from "@repo/api-schema"
import type { Tag } from "@repo/domain"

import type { ContentSourceInput, ContentSourceWithTags } from "../../../repository"

/**
 * ドメインの Tag → ソースのレスポンスのタグ（色は名前のまま返し、admin がクラスに変える）
 */
export const convertSourceTagToResponse = (tag: Tag): ContentSourceResponse["tags"][number] => ({
  id: tag.id,
  color: tag.color,
  name: tag.name,
})
```

- `convertContentSourceRequestToInput`：`tags: request.tags` → `tagIds: request.tag_ids`（`base` のキーの順で `name` の後）
- `convertContentSourceToResponse(source: ContentSourceWithTags)`：`tags: source.tags.map(convertSourceTagToResponse)`
- `list.ts`：各ソースに `tags: source.tags.map(convertSourceTagToResponse)` を足す（`site_url` の後）
- `create.ts` / `update.ts`：コンストラクタを `constructor(private _contentSourceRepository: ContentSourceRepository, private _tagRepository: TagRepository) {}` にし、service に `{ contentSourceRepository: this._contentSourceRepository, tagRepository: this._tagRepository }` を渡す
- `src/index.ts`：`new AdminContentSourceCreateController(contentSourceRepository, tagRepository)`・`new AdminContentSourceUpdateController(contentSourceRepository, tagRepository)`（`tagRepository` は step2 で作ってある）

### PassageRepository（ユーザー向けの問題一覧）

`src/repository/passage-repository.ts`：

```ts
type PassageSourceTags = {
  /**
   * ソースのタグの名前（lower(name) → id の順）
   */
  tags: string[]
}

/**
 * 出典と一覧の表示に使うソースの列（取得方法ごとに持つ列が違う）
 */
export type PassageSource =
  | (Pick<
    GitHubRepositorySource,
    "branch" | "fetchType" | "kind" | "licenseSpdx" | "licenseUrl" | "name" | "publicUrlStripPrefix" | "publicUrlTemplate" | "repository"
  > & PassageSourceTags)
  | (Pick<WebsiteSource, "fetchType" | "kind" | "licenseSpdx" | "licenseUrl" | "name" | "siteUrl"> & PassageSourceTags)
```

- `PublishedPassageFilter.tags` のコメントを「タグの名前。大文字・小文字を区別せずに比べる」にする
- `findPublishedTags` のコメントを「公開中の問題があるソースのタグの名前を、重複なしで lower(name) → id の順に返す」にする

`src/repository/drizzle/passage-repository.ts`：

```ts
/**
 * ソースのタグの名前（lower(name) → id の順）。content_sources を FROM に持つクエリの select で使う。
 * 相関サブクエリなので、問題の行ごとに別のクエリを投げない（N+1 にならない）。text[] は pg が string[] にする
 */
const SOURCE_TAG_NAMES_SQL = sql<string[]>`ARRAY(
  SELECT ${tags.name} FROM ${contentSourceTags}
  INNER JOIN ${tags} ON ${tags.id} = ${contentSourceTags.tagId}
  WHERE ${contentSourceTags.contentSourceId} = ${contentSources.id}
  ORDER BY lower(${tags.name}), ${tags.id}
)`

const PASSAGE_SOURCE_COLUMNS = {
  // ...今の列（tags: contentSources.tags を除く）
  tags: SOURCE_TAG_NAMES_SQL,
}
```

- `PassageSourceRow` は `Pick<ContentSourceRow, ...>` から `"tags"` を外し、`& { tags: string[] }` にする。`convertPassageSourceRowToDomain` はそのまま `tags: row.tags`
- 絞り込み（`_buildPublishedCondition`）の `?|` を、中間テーブルの `EXISTS` に直す。入力は小文字にして `lower(tags.name)` と比べる

```ts
      /**
       * ソースにどれかのタグ（大文字・小文字を区別しない）が付いていれば当てはまる
       */
      filter.tags.length === 0
        ? undefined
        : exists(
          this._db
            .select({ tagId: contentSourceTags.tagId })
            .from(contentSourceTags)
            .innerJoin(tags, eq(contentSourceTags.tagId, tags.id))
            .where(
              and(
                eq(contentSourceTags.contentSourceId, contentSources.id),
                inArray(sql`lower(${tags.name})`, filter.tags.map((tagName) => tagName.toLowerCase())),
              ),
            ),
        ),
```

- `findPublishedTags`：`jsonb_array_elements_text` + `selectDistinct` をやめ、`tags` を FROM にして「公開中の問題があるソースに付いている」を `EXISTS` で見る。タグ 1 行につき 1 回しか出ないので `DISTINCT` は要らない（`SELECT DISTINCT` だと `ORDER BY lower(name)` を select にも入れる必要がある）

```ts
  public async findPublishedTags(): Promise<string[]> {
    const rows = await this._db
      .select({ name: tags.name })
      .from(tags)
      .where(
        exists(
          this._db
            .select({ id: passages.id })
            .from(passages)
            .innerJoin(sourceDocuments, eq(passages.sourceDocumentId, sourceDocuments.id))
            .innerJoin(contentSourceTags, eq(contentSourceTags.contentSourceId, sourceDocuments.sourceId))
            .where(and(eq(contentSourceTags.tagId, tags.id), eq(passages.status, "published"))),
        ),
      )
      .orderBy(sql`lower(${tags.name})`, asc(tags.id))
    return rows.map((row) => row.name)
  }
```

- `@repo/db` からの import に `contentSourceTags`・`tags` を足す。ローカル変数に `tags` という名前を使わない（テーブルと紛れる）
- 大文字・小文字の比較は、入力を JS の `toLowerCase()`、列を Postgres の `lower()` で小文字にする。タグの名前は英字が中心なので、両者の差（トルコ語の `İ` など）は問題にしない
- 問題の `source.tags` は今まで jsonb に入れた順（`["react", "frontend"]`）だったが、名前の順（`["frontend", "react"]`）に変わる。web / mobile は受け取った順に出しているだけなので、表示の順だけが変わる

### cron

`apps/cron/src/repository/drizzle/content-source-repository.ts` の `_toDomain` から `tags: row.tags` を消す。cron の型はドメインの `ContentSource` に従うので、ほかの変更は要らない。

### seed（`packages/db/drizzle/seed-sample-passages.ts`）

`SOURCE` から `tags` を消し、ソースを確保した後でタグを付ける。何度流しても同じ結果になるようにする。

```ts
import { and, eq, gte, inArray, lt, or, sql } from "drizzle-orm"

import { type TagColor } from "@repo/domain"

import { contentSources, contentSourceTags, passageGlossaryEntries, passages, questions, sourceDocuments, tags } from "../src/drizzle/schema"

/**
 * サンプルのソースに付けるタグ。admin で同じ名前（大文字・小文字を区別しない）のタグを作っていれば、そちらを使う
 */
const SOURCE_TAGS: { color: TagColor; name: string }[] = [
  { color: "blue", name: "react" },
  { color: "rose", name: "frontend" },
]

/**
 * サンプルのソースにタグを付ける。tags は lower(name) の unique index に当たれば何もしない（既存のタグを使う）
 */
const ensureSourceTags = async (tx: DrizzleTransaction, sourceId: number): Promise<void> => {
  await tx.insert(tags).values(SOURCE_TAGS).onConflictDoNothing()
  const rows = await tx
    .select({ id: tags.id })
    .from(tags)
    .where(inArray(sql`lower(${tags.name})`, SOURCE_TAGS.map((tag) => tag.name.toLowerCase())))
  await tx
    .insert(contentSourceTags)
    .values(rows.map((row) => ({ contentSourceId: sourceId, tagId: row.id })))
    .onConflictDoNothing()
}
```

- `ensureSourceDocument` でソースの id を取った直後に `await ensureSourceTags(tx, source.id)` を呼ぶ
- `onConflictDoNothing()` に target を付けない（`lower(name)` は式の index なので、列を target に書けない）

### content_sources.tags は残す

deploy workflow は **migration をアプリのデプロイより先に流す**（[minimal-deploy の deploy](../../minimal-deploy/README.md#cron-と-migration)）。この step のコードと列の削除を同じデプロイに入れると、migration の後・新しい api のデプロイの前の間、古い api が `content_sources.tags` を読んで失敗する（ユーザー向けの問題一覧も含む）。そのため列はこの step では消さず、この step のコードが本番に出た後の [step6](./step6-db-drop-content-sources-tags.md) で消す。

- `packages/db/src/drizzle/schema/content-source.ts` の `tags` 列を残し、コメントを「使わない。source-tags の移行が済んだら消す（`content_source_tags` を使う）」にする
- 新しいコードは読み書きしない（insert には既定値の `'[]'` が入る）
- step1 の移行は、step1 の migration を流した時点の `content_sources.tags` を写す。移行から新しい api のデプロイまでの間に、古い admin でソースのタグを変えると写らない（管理者が 1 人なので、デプロイ中に編集しない運用で避ける）

### admin への影響（この step では直さない）

この step だけをデプロイすると、admin のソースの画面が壊れる。step4〜5 と同じタイミングで本番に出す。

- **型チェックは通る見込み**：admin は `@repo/api-schema` の型を使うが、`SourceForm.tsx` の `source?.tags.join(", ")` はオブジェクトの配列でも型エラーにならず、`content-source.form.ts` は `Record<string, unknown>` を返すため。`pnpm --filter admin build` で確かめる（lint の `@typescript-eslint/no-base-to-string` が `join` を検査する設定なら警告になる）
- **実行時に壊れる**：
  - 編集画面の技術タグの欄に `[object Object]` が出る
  - 登録・保存は `tag_ids` が無いので Server Action の検証で失敗し、「入力内容を確認してください」になる（`tag_ids` の欄が無いのでどの欄かも出ない）
  - 更新の Server Action は API の 400 を「取得元の URL を変えた」とみなしている（`ORIGIN_LOCKED_MESSAGE`）。この step で足す「存在しないタグ」の 400（`details[0].path` が `["tag_ids"]`、`code` は `tag_not_found`）と見分けるのは step5 で行う

## 動作確認

```bash
pnpm build                      # domain → api-schema → 各 app の順に build（root で）
cd apps/api && pnpm test        # vitest を直接叩かない（DB_NAME を付けずに走ると dev の DB が消える）
cd apps/cron && pnpm test
pnpm --filter admin build       # 型が通ることだけ確かめる（画面は step5 まで壊れる）
pnpm lint:fix
```

テストは `apps/api/CLAUDE.md` のテスト戦略どおり、`describe` を「正常系」「異常系」に分け、エラーの文言は検証しない（`statusCode` / `type` / `details[].code` / `details[].path` を見る）。

### テストの fixture

- `apps/api/test/fixture/source-tag.ts` を作り、`insertSourceTags(sourceId, names)` を置く。`tags` に `onConflictDoNothing()` で入れてから `lower(name)` で引き、`content_source_tags` に紐付けて、付けたタグ（`Tag` の行）を返す。色は `TAG_COLORS` を名前の順に使う
- `apps/api/test/fixture/passage.ts` の `insertPassageSource` は引数を `Partial<Omit<ContentSourceInsert, "tags">> & { tags?: string[] }` にし、`tags`（既定 `["react"]`）を `insertSourceTags` で付ける。呼び出し側（`insertPassageSource({ tags: ["react", "frontend"] })`）は変えなくてよい
- `apps/api/test/controller/admin/content-source/fixtures.ts`：`GITHUB_REQUEST` / `WEBSITE_REQUEST` の `tags` を `tag_ids: []` にする。`insertGitHubSource` / `insertWebsiteSource` から `tags` を消し、タグが要るテストは `insertSourceTags` を呼ぶ
- `apps/api/test/service/content-source-service/fixtures.ts`：`buildGitHubInput` / `buildWebsiteInput` の `tags` を `tagIds: []` に、`buildGitHubSource` / `buildWebsiteSource` は `tags: []`（`Tag[]`）を返す。`createMockTagRepository = () => ({ findByIds: vi.fn<TagRepository["findByIds"]>() })` と `buildTag(overrides)` を足す
- `apps/api/test/schema/admin-content-source-schema.test.ts` のリクエストの `tags` を `tag_ids` にする
- `apps/cron/test/repository/drizzle/content-source-repository.test.ts`・`apps/cron/test/service/collection/helpers.ts` の `tags` を消す
- ユーザー向けの `PassageSource` は `tags: string[]` のままなので、`test/fixture/passage.ts` の `PassageSource` の値・`test/lib/build-attribution.test.ts`・`test/service/{attempt,passage}-service/fixtures.ts` は変えない

### api-schema（`test/schema/admin-content-source-schema.test.ts`）

| 分類 | ケース |
| --- | --- |
| 正常系 | `tag_ids: []`・`[1, 2]`・10 個は通る |
| 異常系 | `tag_ids` の重複（`[1, 1]`）・11 個・`0`・負の数・小数・`tag_ids` の省略（古い `tags` だけ）は失敗する |

### Service（ユニット。`test/service/content-source-service/`）

`createContentSource.test.ts`：

```ts
describe("createContentSource", () => {
  describe("正常系", () => {
    it("tagIds がすべてあれば、tagIds を含めて create し、タグつきのソースを返す", async () => {
      const input = buildGitHubInput({ tagIds: [1, 2] })
      tagRepository.findByIds.mockResolvedValue([buildTag({ id: 1 }), buildTag({ id: 2, name: "frontend" })])
      const created = buildGitHubSource({ tags: [buildTag({ id: 1 }), buildTag({ id: 2, name: "frontend" })] })
      contentSourceRepository.create.mockResolvedValue({ kind: "saved", source: created })

      const result = await createContentSource(input, { contentSourceRepository, tagRepository })

      expect(result).toEqual({ ok: true, value: created })
      expect(tagRepository.findByIds).toHaveBeenCalledWith([1, 2])
      expect(contentSourceRepository.create).toHaveBeenCalledWith(input)
    })

    it("tagIds が空なら findByIds を呼ばずに create する", async () => { /* ... */ })
  })

  describe("異常系", () => {
    it("存在しない tag の id があれば 400 BAD_REQUEST と tag_ids の details を返し、create を呼ばない", async () => {
      tagRepository.findByIds.mockResolvedValue([buildTag({ id: 1 })])

      const result = await createContentSource(buildGitHubInput({ tagIds: [1, 99] }), { contentSourceRepository, tagRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(400)
        expect(result.error.type).toBe("BAD_REQUEST")
        expect(result.error.details).toEqual([expect.objectContaining({ code: "tag_not_found", path: ["tag_ids"] })])
      }
      expect(contentSourceRepository.create).not.toHaveBeenCalled()
    })

    it("create が missing_tags を返したら 400 BAD_REQUEST を返す", async () => { /* ... */ })
  })
})
```

`updateContentSource.test.ts`：同じく「存在しない tag の id → 400 で `update` を呼ばない」「`update` が `missing_tags` → 400」「取得方法の変更（400）は tag の確認より先」「tag の確認（400）は重複（409）より先」を足す。既存のケースは `tagRepository` を渡すように直す。

### Repository（実 DB。`test/repository/`）

`content-source-repository.test.ts`：

| 分類 | ケース |
| --- | --- |
| 正常系 | `create` に `tagIds` を渡すと `findById` / `findAll` がタグを `lower(name)` → `id` の順で返す（`react`・`Frontend` → `Frontend`・`react`） |
| 正常系 | `update` は `tagIds` に付け替える（外したタグの紐付けが消え、足したタグが付く）。ほかのソースの紐付けは変わらない |
| 正常系 | `tagIds: []` で `update` するとタグが全部外れる |
| 正常系 | `findAll` はタグの無いソースに `tags: []` を返す |
| 正常系 | タグを消す（`testDb.delete(tags)`）と、そのタグがソースのタグから外れ、ソースは残る（CASCADE） |
| 異常系 | 存在しない tag の id で `create` すると `missing_tags` を返し、`content_sources` の行も作らない（巻き戻る） |
| 異常系 | 存在しない tag の id で `update` すると `missing_tags` を返し、ソースの列もタグも変わらない |
| 異常系 | `update` が `duplicate` を返したときは、タグの付け替えも巻き戻る |

`passage-repository.test.ts`：

| 分類 | ケース |
| --- | --- |
| 正常系 | 既存の絞り込みのケース（`insertPassageSource({ tags })` のまま）が通る。`source.tags` の期待値は名前の順（`["frontend", "react"]`）に直す |
| 正常系 | 絞り込みは大文字・小文字を区別しない（`tags: ["REACT"]` で `react` のタグのソースの問題が返る） |
| 正常系 | `findPublishedTags` は公開中の問題があるソースのタグだけを `lower(name)` の順で返す。2 つのソースに付いたタグは 1 回だけ |
| 異常系 | `findPublishedTags` は、下書きだけのソースのタグ・どのソースにも付いていないタグを返さない |

### Controller（インテグレーション。`test/controller/`）

| エンドポイント | 分類 | ケース |
| --- | --- | --- |
| `POST /api/admin/content-source` | 正常系 | `tag_ids` を渡すと 201 と `tags: [{ id, color, name }]`（名前の順）を返し、`content_source_tags` に入る |
| | 異常系 | 存在しない tag の id は 400 で、`details[0].path` が `["tag_ids"]`（`code` は `tag_not_found`）。`content_sources` の行が増えない |
| | 異常系 | `tag_ids` の重複・11 個・省略は 400 |
| `PUT /api/admin/content-source/:id` | 正常系 | `tag_ids` を変えると 200 で、レスポンスと `content_source_tags` が新しいタグになる |
| | 異常系 | 存在しない tag の id は 400 で、`details[0].path` が `["tag_ids"]`。ソースもタグも変わらない |
| | 異常系 | 取得元の変更の 400 は `details` を持たない（admin が tag の 400 と見分けられる） |
| `GET /api/admin/content-source` | 正常系 | 各ソースに `tags` が付く（タグの無いソースは `[]`） |
| `GET /api/admin/content-source/:id` | 正常系 | `source.tags` が `{ id, color, name }` の配列 |
| `GET /api/passage` | 正常系 | `?tag=REACT` で `react` のタグのソースの問題が返る。レスポンスの `tags` と各問題の `source.tags` が名前の順 |
| `GET /api/passage/random` | 正常系 | `?tag=` が大文字・小文字を区別しない |

### 手で確かめる

```bash
cd apps/api && pnpm db:migrate && pnpm db:seed:sample-passages && pnpm db:seed:sample-passages   # 2 回流しても同じ（content_source_tags が増えない）
```

- `GET /api/admin/content-source`（`X-Admin-Token` 付き）で、サンプルのソースに `tags: [{ color: "rose", name: "frontend" }, { color: "blue", name: "react" }]` が付いている
- `GET /api/passage?tag=React` で、サンプルの公開中の問題が返る
