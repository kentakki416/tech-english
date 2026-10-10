# step2-api-passage-list

問題一覧（`GET /api/passage`）・ランダムに 1 問（`GET /api/passage/random`）・開始確認の概要（`GET /api/passage/:id`）の API を作る。仕様は [問題の選び方](../README.md#問題の選び方) と [必要な API](../README.md#必要な-api)。

## 前提

- [step1-db-reading-attempts](./step1-db-reading-attempts.md)
- [content-collection step1-db-content-sources](../../content-collection/tasks/step1-db-content-sources.md)（`content_sources` / `source_documents` / `passages`、`SOURCE_KINDS`）
- [question-generation step1-db-questions](../../question-generation/tasks/step1-db-questions.md)
- api の `PassageRepository` は [question-generation step5](../../question-generation/tasks/step5-api-admin-passage.md) と共有する。**先に着手した方が interface と Drizzle / Prisma の実装クラスを作り、もう片方はメソッドを足す**

## 対応内容

### 1. api-schema（`packages/schema/src/api-schema/passage.ts`）

`index.ts` に `export * from "./passage"` を足す（ファイル名順）。`SOURCE_KINDS` / `PASSAGE_DIFFICULTIES` は `@repo/domain` から import する。

```ts
const PASSAGE_DIFFICULTY_VALUES: readonly number[] = PASSAGE_DIFFICULTIES

/**
 * 難易度（1〜3）
 */
export const passageDifficultySchema = z.number().int().refine((value) => PASSAGE_DIFFICULTY_VALUES.includes(value))

/**
 * カンマ区切りのクエリ（`difficulty=1,3` / `tag=react,rust`）を配列にする
 */
const commaSeparatedSchema = z.string().max(500).optional().transform((value) => (value ? value.split(",").filter(Boolean) : []))

/**
 * 出典表示（content-collection の「出典表示」）。attempt.ts からも使う
 */
export const passageAttributionSchema = z.object({
  commit_sha: z.string().nullable(),
  license_spdx: z.string(),
  license_url: z.string(),
  /** 公開ページの URL（無ければ GitHub のファイル）/ サイトのページ */
  page_url: z.string(),
  /** GitHub のコミットに固定したリンク。サイトは null */
  permalink_url: z.string().nullable(),
  retrieved_at: z.string(),
  source_kind: z.enum(SOURCE_KINDS),
  source_name: z.string(),
})
```

| スキーマ | 中身 |
| --- | --- |
| `getPassageListQueryStringSchema` | `cursor`（string, max 200, 任意）、`difficulty`（`commaSeparatedSchema.pipe(z.array(z.coerce.number().pipe(passageDifficultySchema)))`）、`kind`（`z.enum(SOURCE_KINDS)` 任意）、`limit`（`z.coerce.number().int().min(1).max(50).default(20)`）、`tag`（`commaSeparatedSchema`）、`unattempted_only`（`z.enum(["true", "false"]).optional().transform((value) => value === "true")`） |
| `getPassageListResponseSchema` | `next_cursor: string \| null`、`passages[]`、`tags: string[]`（公開中の問題があるソースのタグ全件。絞り込みのチップに使う）、`total_count: number`（絞り込み後の件数。cursor は無視） |
| `passages[]` の要素 | `id`、`difficulty`、`my_status: { attempt_count, best_correct_count \| null, in_progress_attempt_id \| null }`、`question_count`、`source: { kind, name, tags }`、`time_limit_seconds`、`title`、`word_count` |
| `getRandomPassageQueryStringSchema` | 一覧と同じ `difficulty` / `kind` / `tag` |
| `getRandomPassageResponseSchema` | `{ id }` |
| `getPassagePathParamSchema` | `{ id: z.coerce.number().int().positive() }` |
| `getPassageResponseSchema` | `id`、`attribution`、`difficulty`、`in_progress_attempt: { id, expires_at, started_at } \| null`、`question_count`、`server_now`、`time_limit_seconds`、`title`、`word_count` |

- `my_status.attempt_count` は提出済みの挑戦の数、`best_correct_count` はその最高正答数、`in_progress_attempt_id` は期限内の挑戦中の ID
- 「未挑戦」は **提出済みの挑戦が 0 件**（挑戦中の問題も未挑戦に含む。モックの `attemptCount === 0` と同じ）
- 並び順は `published_at` の降順、同時刻は `id` の降順。タグと難易度は「どれかに当てはまる」（OR）

### 2. 挑戦の期限の純関数（`apps/api/src/lib/attempt-expiry.ts`）

step3・4 でも使う。期限切れは「開始から `ATTEMPT_EXPIRY_SECONDS` 以上たった」。

```ts
export const calculateExpiresAt = (startedAt: Date): Date => new Date(startedAt.getTime() + ATTEMPT_EXPIRY_SECONDS * 1000)
/** これより後に開始した in_progress だけが期限内 */
export const calculateAliveSince = (now: Date): Date => new Date(now.getTime() - ATTEMPT_EXPIRY_SECONDS * 1000)
export const isAttemptExpired = (startedAt: Date, now: Date): boolean => now.getTime() >= calculateExpiresAt(startedAt).getTime()
```

### 3. 出典とカーソルの純関数

```ts
/** apps/api/src/lib/build-attribution.ts */
export const buildAttribution = (
  source: PassageSource,
  passage: Pick<Passage, "sourceCommitSha" | "sourcePath" | "sourceRetrievedAt">,
): PassageAttribution
```

| 取得方法 | `pageUrl` | `permalinkUrl` |
| --- | --- | --- |
| `github_repository`（URL 規則あり） | `public_url_template` の `{path}` に、`source_path` から `public_url_strip_prefix` と拡張子（`.md` / `.mdx`）を除いたものを入れる | `https://github.com/{repository}/blob/{source_commit_sha}/{source_path}`（コミットが無ければ null） |
| `github_repository`（URL 規則なし） | `https://github.com/{repository}/blob/{branch}/{source_path}` | 同上 |
| `website` | `new URL(source_path, site_url)` | null |

- URL 規則の変換は content-collection の admin で出す「変換の例」と同じ結果にする（[ソースの登録](../../content-collection/README.md#ソースの登録)）
- `apps/api/src/lib/passage-cursor.ts`：`encodePassageCursor({ id, publishedAt }): string`（JSON を base64url）と `decodePassageCursor(value): PassageCursor | null`（壊れていたら null）

### 4. Repository

```ts
/** apps/api/src/repository/passage-repository.ts（この step で足す部分） */
export type PublishedPassageFilter = {
  difficulties: number[]
  kind: SourceKind | null
  tags: string[]
  /** 指定するとそのユーザーが提出済みの問題を除く */
  unattemptedByUserId: number | null
}
export type PassageCursor = { id: number; publishedAt: Date }
/** 出典と一覧の表示に使うソースの列 */
export type PassageSource = Pick<ContentSource, "branch" | "fetchType" | "kind" | "licenseSpdx" | "licenseUrl" | "name" | "publicUrlStripPrefix" | "publicUrlTemplate" | "repository" | "siteUrl" | "tags">
/** blocks を読まない一覧用の列 */
export type PassageOverview = Pick<Passage, "id" | "difficulty" | "publishedAt" | "sourceCommitSha" | "sourcePath" | "sourceRetrievedAt" | "timeLimitSeconds" | "title" | "wordCount">
export type PublishedPassageSummary = { passage: PassageOverview; questionCount: number; source: PassageSource }

export interface PassageRepository {
  countPublished(filter: PublishedPassageFilter): Promise<number>
  findPublishedById(id: number): Promise<PublishedPassageSummary | null>
  findPublishedPage(filter: PublishedPassageFilter, page: { cursor: PassageCursor | null; limit: number }): Promise<PublishedPassageSummary[]>
  findPublishedTags(): Promise<string[]>
  findRandomPublishedId(filter: PublishedPassageFilter): Promise<number | null>
}
```

```ts
/** apps/api/src/repository/reading-attempt-repository.ts（新規。step3・4 でメソッドを足す） */
export type PassageAttemptSummary = { attemptCount: number; bestCorrectCount: number | null; inProgressAttemptId: number | null; passageId: number }

export interface ReadingAttemptRepository {
  findAliveInProgress(userId: number, passageId: number, aliveSince: Date): Promise<ReadingAttempt | null>
  summarizeByPassageIds(userId: number, passageIds: number[], aliveSince: Date): Promise<PassageAttemptSummary[]>
}
```

- `ContentSource` 型が `@repo/domain` に無ければ、上の列をそのまま書いた型にする
- Drizzle（`DrizzlePassageRepository`）：`passages` → `source_documents` → `content_sources` を inner join、`status = 'published'`。設問数は `(SELECT count(*) FROM questions WHERE passage_id = passages.id)`
  - タグ：`` sql`${contentSources.tags} ?| array[${sql.join(filter.tags.map((tag) => sql`${tag}`), sql`, `)}]` ``
  - 未挑戦：`notExists(...)`（`reading_attempts` の `user_id` 一致かつ `status = 'submitted'`）
  - カーソル：`or(lt(publishedAt, cursor.publishedAt), and(eq(publishedAt, cursor.publishedAt), lt(id, cursor.id)))`
  - ランダム：`orderBy(sql\`random()\`).limit(1)`
  - タグ一覧：公開中の問題を持つソースの `jsonb_array_elements_text(tags)` を DISTINCT して昇順
- Prisma：タグは `OR: tags.map((tag) => ({ ...source: { tags: { array_contains: [tag] } } }))`、未挑戦は `readingAttempts: { none: { status: "submitted", userId } }`、設問数は `_count`、ランダムは id だけ取得して JS で選ぶ（件数が少ないうちはこれでよい）
- `summarizeByPassageIds`：`passage_id IN (...)` で GROUP BY。`attemptCount` と `bestCorrectCount` は `status = 'submitted'` だけ、`inProgressAttemptId` は `status = 'in_progress' AND started_at > aliveSince`
- `findAliveInProgress`：`status = 'in_progress' AND started_at > aliveSince`（期限切れの更新は step3 の書き込み API で行い、ここは読むだけ）

### 5. Service（`apps/api/src/service/passage-service.ts`）

`service/index.ts` に `export * as passage from "./passage-service"` を足す。

```ts
type PassageRepo = { passageRepository: PassageRepository; readingAttemptRepository: ReadingAttemptRepository }

export const getPassageList = async (
  input: { cursor: string | undefined; filter: Omit<PublishedPassageFilter, "unattemptedByUserId">; limit: number; now: Date; unattemptedOnly: boolean; userId: number },
  repo: PassageRepo,
): Promise<Result<PassageListView>>
export const getRandomPassageId = async (input: { filter: ...; userId: number }, repo: PassageRepo): Promise<Result<{ id: number }>>
export const getPassageOverview = async (input: { now: Date; passageId: number; userId: number }, repo: PassageRepo): Promise<Result<PassageOverviewView>>
```

- `getPassageList`：カーソルが壊れていたら `err(badRequestError(...))`。`findPublishedPage` に `limit + 1` を渡し、余った 1 件で次ページの有無を決める。`countPublished` と `findPublishedTags` は `Promise.all` で並べる。取得した問題の ID で `summarizeByPassageIds` を呼んで `myStatus` を付ける（無ければ `{ attemptCount: 0, bestCorrectCount: null, inProgressAttemptId: null }`）
- `getRandomPassageId`：未挑戦（`unattemptedByUserId: userId`）から選び、無ければ全体から選ぶ。どちらも無ければ `err(notFoundError(...))`
- `getPassageOverview`：公開中でなければ 404。`findAliveInProgress` があれば `expiresAt = calculateExpiresAt(startedAt)` を付ける。`serverNow = now`
- `now` は Controller が `new Date()` を渡す（テストで時刻を固定するため）

### 6. Controller・Router・DI

- `controller/passage/list.ts`・`random.ts`・`detail.ts`。`req.userId!` を使う（`/api/passage` は `PUBLIC_PATHS` に入れない）。domain → snake_case の変換と `parseResponse` は既存の memo と同じ
- `routes/passage-router.ts`（新規。`memoRouter` と同じく controllers は optional）。**`GET /random` を `GET /:id` より先に登録する**（後だと `random` が `:id` の検証で 400 になる）。step3 で `POST /:id/attempt` を足す。ルートの説明コメントは `/** */` で書く
- `src/index.ts`：`DrizzlePassageRepository` / `DrizzleReadingAttemptRepository` を生成し、`app.use("/api/passage", passageRouter({ detail, list, random }))`

## 動作確認

```bash
cd packages/schema && pnpm build
pnpm --filter api test
pnpm lint:fix
```

lib（`test/lib/`）:

- [ ] `isAttemptExpired`：開始から 23:59:59.999 は false、ちょうど 24 時間は true
- [ ] `buildAttribution`：URL 規則あり（プレフィックスと拡張子を外す）/ URL 規則なし / コミットなし（permalink が null）/ サイト
- [ ] `decodePassageCursor(encodePassageCursor(x))` が元に戻る。壊れた文字列は null

Service（ユニット）:

- [ ] `getPassageList`：壊れたカーソルで 400 / `limit + 1` 件返ると `nextCursor` が最後の要素から作られる / `unattemptedOnly` のときだけ `unattemptedByUserId` が渡る / 挑戦の集計が無い問題は未挑戦の形になる
- [ ] `getRandomPassageId`：未挑戦が無いとき全体から選ぶ / どちらも無ければ 404
- [ ] `getPassageOverview`：公開中でなければ 404 / 挑戦中があれば `expiresAt` が開始の 24 時間後

Controller（インテグレーション。問題・設問・ソースを入れる fixture は `test/fixture/passage.ts` に作る。question-generation step5 と共有し、先に作った方を使う）:

- [ ] 認証なしで 401
- [ ] `GET /api/passage`：下書き・却下の問題が出ない / `published_at` の降順 / `kind`・`tag`（OR）・`difficulty`（OR）・`unattempted_only` で絞り込める / `total_count` が絞り込み後の件数 / `limit=2` で 3 件を 2 ページに分けて取れる / `difficulty=4` で 400
- [ ] `my_status`：提出 2 回（正答 2・3）で `attempt_count: 2, best_correct_count: 3` / 他人の挑戦は数えない / 開始から 24 時間たった in_progress は `in_progress_attempt_id: null`
- [ ] `GET /api/passage/random`：未挑戦があればそれを返す / 全部提出済みなら提出済みから返す / 条件に合う問題が無ければ 404
- [ ] `GET /api/passage/:id`：下書きは 404 / 期限内の挑戦中があれば `in_progress_attempt` が返る / レスポンス全体を `toEqual` + `expect.any(String)` で検証

Repository（`test/repository/passage-repository.test.ts`・`reading-attempt-repository.test.ts`。Drizzle / Prisma の両方）:

- [ ] 上の絞り込み・カーソル・タグ一覧・集計が両実装で同じ結果になる
