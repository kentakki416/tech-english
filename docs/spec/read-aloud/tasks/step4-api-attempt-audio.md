# step4-api-attempt-audio

api に読み上げの API を足す：挑戦の音声マニフェスト（`GET /api/attempt/:id/audio`）、提出の `listened_block_count`、学習記録の「アシストなし」の判定への読み上げの追加、admin の問題詳細の音声の状態・再試行（`POST /api/admin/passage/:id/audio/retry`）・作り直しの依頼（`POST /api/admin/passage/:id/audio/regenerate`）、公開での失敗した音声の再試行、ローカルの `/media/*` 配信。API の一覧は [README の必要な API](../README.md#必要な-api)、配信は [音声の保存と配信](../README.md#音声の保存と配信)、アシストの扱いは [使える場面とアシストの扱い](../README.md#使える場面とアシストの扱い)。

## 前提

- [step1-db-passage-audios](./step1-db-passage-audios.md)。手動確認には [step3-cron-generate-audio](./step3-cron-generate-audio.md) で作った音声を使う
- [reading-practice step3-api-attempt-start](../../reading-practice/tasks/step3-api-attempt-start.md)（`attempt-router.ts`・`findByIdForUser`・`controller/attempt/mapper.ts`）・[step4-api-attempt-submit](../../reading-practice/tasks/step4-api-attempt-submit.md)（`submitAttempt`・`markSubmitted`・`buildSubmittedView`）
- [learning-record step2-api-user-stats](../../learning-record/tasks/step2-api-user-stats.md)（`LearningRecordRepository`・`usedAssist`）
- [question-generation step5-api-admin-passage](../../question-generation/tasks/step5-api-admin-passage.md)（`findAdminDetail`・`convertAdminPassageDetailToResponse`・`admin-router.ts` の `controllers.passage`）
- 本番ガードの流儀は [dev-login の多重ガード](../../dev-login/README.md#多重ガード)

## 対応内容

### 1. api-schema

`attempt.ts`：

```ts
/** submitAttemptRequestSchema に足す。古いアプリ（送ってこない版）のために既定 0 */
listened_block_count: z.number().int().nonnegative().default(0),
/** submittedAttemptSchema に足す（結果画面の「読み上げ n 段落」） */
listened_block_count: z.number(),

/** [start_ms, end_ms, start_offset, end_offset]。offset は blocks[block_index].text 上の UTF-16 の位置 */
const audioWordTimingSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])
export const getAttemptAudioPathParamSchema = z.object({ id: z.coerce.number().int().positive() })
export const getAttemptAudioResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("failed") }),
  z.object({
    blocks: z.array(z.object({
      block_index: z.number(),
      parts: z.array(z.object({ duration_ms: z.number(), url: z.string(), words: z.array(audioWordTimingSchema) })),
    })),
    status: z.literal("ready"),
  }),
])
```

`admin/passage.ts`：`adminPassageDetailSchema` に `audio: z.object({ generated_at: z.string().nullable(), last_error: z.string().nullable(), regenerate_requested_at: z.string().nullable(), status: z.enum(AUDIO_STATUSES) }).nullable()`（公開中でなく行も無ければ null。`generating` もそのまま返し、admin は「生成中」と出す。`ready` のまま作り直している間は `ready` で、作り直しに失敗していれば `last_error` がある）。`retryAdminPassageAudioPathParamSchema`（`{ id }`）と `retryAdminPassageAudioResponseSchema = z.object({ passage_id: z.number(), status: z.literal("pending") })`、`regenerateAdminPassageAudioPathParamSchema`（`{ id }`）と `regenerateAdminPassageAudioResponseSchema = z.object({ passage_id: z.number(), regenerate_requested_at: z.string() })`。型は `z.infer` で export する。

### 2. 純関数（`apps/api/src/lib/passage-audio.ts`）

```ts
/**
 * 表示する状態（admin と利用者で共通）。ready でも、次のときは本文が変わってマニフェストの位置がずれているかもしれないので pending として扱う。
 * - 問題が公開中でない（非公開に戻した）：published_at は残り、下書きのまま本文を直せるので、updated_at と published_at の比較だけでは
 *   直した後の本文に古いマニフェストが重なる。再公開すると cron が本文の hash を確かめて ready に戻す（本文が同じなら Polly を呼ばない）
 * - 音声を作った（または cron が本文の同一を確かめた）後に公開し直された：cron が次の実行で作り直すか確かめる
 * generating はそのまま返す（admin 向け）。利用者向けには convertToUserAudioStatus で pending にする
 */
export const resolveAudioStatus = (
  audio: Pick<PassageAudio, "manifest" | "status" | "updatedAt"> | null,
  passage: Pick<Passage, "publishedAt" | "status">,
): AudioStatus => {
  if (!audio) return "pending"
  if (audio.status !== "ready") return audio.status
  if (passage.status !== "published") return "pending"
  return audio.manifest && passage.publishedAt && audio.updatedAt >= passage.publishedAt ? "ready" : "pending"
}

/** 利用者には generating も「準備中」と見せる */
export const convertToUserAudioStatus = (status: AudioStatus): Exclude<AudioStatus, "generating"> =>
  status === "generating" ? "pending" : status

/** 末尾のスラッシュを除いた base とキーをつなぐ */
export const buildAudioUrl = (baseUrl: string, key: string): string
```

公開し直した直後は、本文が変わっていなくても cron が確かめるまで（最大 1 時間）`pending` になる。非公開に戻している間も `pending`（挑戦中・提出済みの挑戦からは、非公開の問題の音声 API も呼ばれる）。voice の変更・作り直しの依頼で cron が `ready` のまま作り直している間（`generation_started_at` がある）は、`updated_at` が変わらないので `ready` のまま前のマニフェストを返す（cron が成功するとマニフェストが置き換わる）。

### 3. Repository

```ts
/** src/repository/passage-audio-repository.ts（新規。Drizzle で実装し、index.ts に足す） */
export type PassageAudioWithPassage = { audio: PassageAudio | null; passage: Pick<Passage, "publishedAt" | "status"> }
export interface PassageAudioRepository {
  /** passages に passage_audios を left join（passages の状態と公開日時も読む）。問題が無ければ null */
  findByPassageId(passageId: number): Promise<PassageAudioWithPassage | null>
  /** status = 'ready' のときだけ作り直しを依頼する（regenerate_requested_at = now、attempt_count = 0、last_error = null。updated_at は変えない）。更新できなければ false */
  requestRegeneration(passageId: number, now: Date): Promise<boolean>
  /** status = 'failed' のときだけ pending に戻す（attempt_count = 0、last_error = null）。更新できなければ false。tx を渡すとそのトランザクションで書く */
  resetFailed(passageId: number, tx?: TransactionContext): Promise<boolean>
}
```

- `requestRegeneration` は `updated_at` を進めない（`resolveAudioStatus` が `updated_at < published_at` で公開し直しを判定するため）。Drizzle は `$onUpdate` が今の時刻を入れるので ``updatedAt: sql`${passageAudios.updatedAt}` `` を明示する
- `PassageRepository`：`AdminPassageDetail` に `audio: PassageAudio | null` を足し、`findAdminDetail` で読む（join か別のクエリ）。`transitionStatus` に `tx?: TransactionContext` を足す（公開と音声の再試行を 1 つのトランザクションにするため。`resolveDrizzleClient` で解決する）
- `ReadingAttemptRepository`：`SubmitReadingAttemptInput` に `listenedBlockCount` を足し、`markSubmitted` で書く
- `LearningRecordRepository`：`SubmittedAttempt` に `listenedBlockCount` を足し、`summarizeNoAssistAccuracy` の条件に `listened_block_count = 0` を足す（コメントも「和訳・単語・読み上げをどれも使っていない挑戦だけ」に直す）

### 4. Service

`attempt-service.ts`：

```ts
export type AttemptAudioView =
  | { status: "failed" | "pending" }
  | { blocks: { blockIndex: number; parts: { durationMs: number; url: string; words: AudioWordTiming[] }[] }[]; status: "ready" }

export const getAttemptAudio = async (
  input: { attemptId: number; userId: number },
  repo: { passageAudioRepository: PassageAudioRepository; readingAttemptRepository: ReadingAttemptRepository },
  deps: { audioPublicUrlBase: string | null },
): Promise<Result<AttemptAudioView>>
```

1. `findByIdForUser(attemptId, userId)` が null なら `err(notFoundError(...))`（他人の挑戦も 404。状態は問わない）
2. `findByPassageId(attempt.passageId)` が null なら 404
3. `convertToUserAudioStatus(resolveAudioStatus(found.audio, found.passage))` が `ready` でなければその状態だけ返す（`generating`・非公開に戻された問題の `ready` は `pending`）。`audioPublicUrlBase` が null（本番で未設定。[step8](./step8-infra-audio.md) の前）なら `pending`
4. マニフェストの各パートの `key` を `buildAudioUrl` で URL にして返す（単語の時刻はそのまま）

`submitAttempt`：入力に `listenedBlockCount` を足す。`translatedBlockCount` と同じく **code 以外のブロック数で上限をかけて** 保存する（超えても 400 にしない。提出を失敗させないため）。`SubmittedAttemptView` と `buildSubmittedView` に `listenedBlockCount` を足し、保存済みの結果を返す経路（冪等・`getAttempt`）も同じ値を返す。

`learning-record-service.ts`：一覧の行の `usedAssist` を `translatedBlockCount > 0 || wordLookupCount > 0 || listenedBlockCount > 0` にする（レスポンスの形は変えない）。

`admin-passage-service.ts`：

```ts
export const retryAdminPassageAudio = async (
  id: number,
  repo: { passageAudioRepository: PassageAudioRepository },
): Promise<Result<{ passageId: number; status: "pending" }>>
```

`findByPassageId` が null → 404、`audio?.status !== "failed"`（行が無い・pending・generating・ready）→ `conflictError`、`resetFailed` が false（同時に状態が変わった）→ 409。

```ts
export const regenerateAdminPassageAudio = async (
  id: number,
  now: Date,
  repo: { passageAudioRepository: PassageAudioRepository },
): Promise<Result<{ passageId: number; regenerateRequestedAt: Date }>>
```

`findByPassageId` が null → 404、`resolveAudioStatus(found.audio, found.passage) !== "ready"`（行が無い・pending・generating・failed、非公開に戻した・公開し直した後の確認待ちの ready。admin のカードが「作り直す」を出すのと同じ条件）→ 409、`requestRegeneration(id, now)` が false（同時に状態が変わった）→ 409。cron は次の実行で、本文の hash が同じでも Polly で作り直す（作り直す間は `ready` のまま前の音声を返す。[step3](./step3-cron-generate-audio.md)）。

`publishAdminPassage`：repo に `passageAudioRepository` と `transactionRunner` を足し、`transactionRunner.run` の中で `transitionStatus(id, {...}, tx)` が true なら `passageAudioRepository.resetFailed(id, tx)` を呼ぶ（音声が `failed` なら `pending` に戻す。admin の再試行と同じ処理。`failed` でなければ何もしない）。本文を直して再公開しても `failed` のまま作り直されない、ということが無いように。公開できなかった（状態が変わった）ときは戻さない。

詳細の変換（`convertAdminPassageDetailToResponse`）の `audio`：行があるか公開中なら `{ generated_at, last_error, regenerate_requested_at, status: resolveAudioStatus(detail.audio, detail.passage) }`（非公開に戻した問題の `ready` は `pending`）（公開中で行が無ければ `pending` と null 2 つ）、それ以外は null。保存（PUT）のレスポンスも同じ変換を通る。

### 5. Controller・Router・DI

- `controller/attempt/audio.ts`（`AttemptAudioController`。コンストラクタで 2 つの Repository と `audioPublicUrlBase`）。`mapper.ts` に `convertAttemptAudioToResponse(view)` を足し、提出の変換に `listened_block_count` を足す。`controller/attempt/submit.ts` は `listened_block_count` を Service に渡す
- `attempt-router.ts` に `audio` を足して `GET /:id/audio`
- `controller/admin/passage/retry-audio.ts`（`AdminPassageRetryAudioController`）、`admin-router.ts` の `controllers.passage` に `retryAudio` を足して `POST /passage/:id/audio/retry`
- `controller/admin/passage/regenerate-audio.ts`（`AdminPassageRegenerateAudioController`。`new Date()` を Service に渡す）、`controllers.passage` に `regenerateAudio` を足して `POST /passage/:id/audio/regenerate`
- `controller/admin/passage/publish.ts` の `AdminPassagePublishController` のコンストラクタに `PassageAudioRepository` と `TransactionRunner` を足す
- `src/index.ts`：`DrizzlePassageAudioRepository` を作り、音声 API・再試行・作り直し・公開の Controller に渡す（公開には `transactionRunner` も）。`audioPublicUrlBase` は §7

### 6. ローカルの `/media/*` 配信

cron が `.storage/audio/` に書いた mp3 を、開発環境でだけ api が配信する。`production` では配信しない（本番は S3 + CloudFront）。dev-login と同じく、ガードを 1 か所に集めない。

| 層 | ファイル | チェック |
| --- | --- | --- |
| DI | `src/index.ts` | `env.NODE_ENV !== "production"` のときだけ `app.use("/media", mediaRouter({ audioDir: resolve(env.AUDIO_STORAGE_LOCAL_DIR) }))`。`apiRateLimiter` より前（1 ファイルで Range のリクエストが複数来るため） |
| Router | `src/routes/media-router.ts`（新規） | 先頭の middleware で `process.env.NODE_ENV === "production"` なら 404 |
| PUBLIC_PATHS | `src/const/index.ts` | `DEV_ONLY_PUBLIC_PATHS` に `"/media"` を足す（`<audio>` は Authorization ヘッダを付けられないため認証の対象外にする） |
| URL | `src/index.ts` | `production` で `AUDIO_PUBLIC_URL_BASE` が無いとき、ローカルの URL にフォールバックしない（null にする） |

`mediaRouter`：`express.static(audioDir, { dotfiles: "deny", index: false })`（Range に対応し、`..` を含むパスを拒否する）と、最後に 404 を返す middleware。helmet の既定の `Cross-Origin-Resource-Policy: same-origin` だと別オリジンの web（`localhost:3000`）の `<audio>` が読めないので、この router でだけ `cross-origin` に上書きする。

### 7. env（`src/env.ts`）

| 変数 | 既定 | 説明 |
| --- | --- | --- |
| `AUDIO_PUBLIC_URL_BASE` | なし（optional の URL） | 音声の URL の base。本番は CloudFront の URL（[step8](./step8-infra-audio.md)）。未設定なら、開発では `http://localhost:${PORT}/media`、`production` では null（音声 API は `pending` を返し、起動時に `logger.warn`）。step8 より前に本番へ出しても起動が止まらないよう必須にしない |
| `AUDIO_STORAGE_LOCAL_DIR` | `../../.storage/audio` | `/media` の配信元（`apps/api` からの相対。cron の保存先と同じディレクトリ） |

mobile の実機で確かめるときは `AUDIO_PUBLIC_URL_BASE=http://<PC の LAN の IP>:8080/media` にする。

## 動作確認

```bash
cd packages/schema && pnpm build
pnpm --filter api test
pnpm lint:fix
```

lib（`test/lib/passage-audio.test.ts`）：

- [ ] `resolveAudioStatus`：行が無い → pending / pending・generating・failed はそのまま（非公開の問題でも）/ 公開中の ready で `updatedAt >= publishedAt` → ready、`updatedAt < publishedAt`・`publishedAt` が null → pending / 問題が `published` でない（draft・rejected）ready → pending
- [ ] `convertToUserAudioStatus`：generating → pending、他はそのまま
- [ ] `buildAudioUrl`：base の末尾のスラッシュの有無で同じ URL

Service（ユニット）：

- [ ] `getAttemptAudio`：他人の挑戦は 404 で `findByPassageId` を呼ばない / ready は URL 付きのブロックを返す / generating・公開し直された ready・非公開に戻された問題の ready・`audioPublicUrlBase` が null は pending / failed は failed
- [ ] `submitAttempt`：`listenedBlockCount` が code 以外のブロック数で切り詰められて `markSubmitted` に渡る。保存済みの結果を返すときも同じ値
- [ ] `usedAssist`：読み上げだけ使った挑戦が true、どれも 0 なら false
- [ ] `retryAdminPassageAudio`：failed → ok / 行が無い・pending・generating・ready → 409 / 問題が無い → 404 / `resetFailed` が false → 409
- [ ] `regenerateAdminPassageAudio`：表示上 ready → `requestRegeneration(id, now)` で ok / 行が無い・pending・generating・failed・非公開に戻した ready・公開し直した後の ready → 409 / 問題が無い → 404 / `requestRegeneration` が false → 409
- [ ] `publishAdminPassage`：`transitionStatus` と `resetFailed` が同じ tx で、`transitionStatus` の後に呼ばれる。`transitionStatus` が false なら `resetFailed` を呼ばない

Controller（インテグレーション。実 DB）：

- [ ] `GET /api/attempt/:id/audio`：認証なしで 401 / 他人の挑戦・存在しない ID で 404 / 行が無い・`generating` の行・問題を非公開に戻した ready の行は `{ status: "pending" }` / ready の行で、`url` が `AUDIO_PUBLIC_URL_BASE` + キー、`words` がタプルの配列（`toEqual` + `expect.any`）/ 提出済みの挑戦でも返る
- [ ] `POST /api/attempt/:id/submit`：`listened_block_count: 2` を送ると DB と結果に 2 / 省略すると 0 / ブロック数より大きいと切り詰められる / `-1` で 400
- [ ] `GET /api/user/stats` の `no_assist` に読み上げだけ使った挑戦が入らない。`GET /api/user/attempts` の `used_assist` が true
- [ ] `GET /api/admin/passage/:id`：音声の無い公開中の問題で `audio.status: "pending"`、下書きで null、`generating` の行で `audio.status: "generating"`、failed の行で `last_error`、非公開に戻した問題の ready の行で `audio.status: "pending"`（failed は failed のまま）
- [ ] `POST /api/admin/passage/:id/audio/retry`：failed → 200 で DB が `pending`・`attempt_count = 0`・`last_error = null` / ready・generating・行なし → 409 / 存在しない ID → 404 / `X-Admin-Token` なしで 401
- [ ] `POST /api/admin/passage/:id/audio/regenerate`：ready → 200 で DB の `regenerate_requested_at` が入り、`attempt_count = 0`・`last_error = null`、`status`・`manifest`・`updated_at` は変わらない / pending・generating・failed・非公開に戻した ready・行なし → 409 / 存在しない ID → 404 / `X-Admin-Token` なしで 401
- [ ] `POST /api/admin/passage/:id/publish`：音声が failed の下書きを公開すると、音声が `pending`・`attempt_count = 0`・`last_error = null`（マニフェストは残る）。ready の音声は変わらない（`updated_at` も）。公開できない（公開中）ときは failed のまま
- [ ] `GET /api/admin/passage/:id`：作り直しの依頼中・ready のまま確保中の行は `status: "ready"` と `regenerate_requested_at`・`last_error`
- [ ] `/media`：`NODE_ENV=test` で `.storage/audio`（テストでは一時ディレクトリを `audioDir` に渡す）の mp3 が 200 で返り、`Range: bytes=0-99` で 206、無いファイルと `..` を含むパスで 404、`Cross-Origin-Resource-Policy: cross-origin`。`mediaRouter` の guard を `NODE_ENV=production` にして 404

Repository のテスト（`test/repository/passage-audio-repository.test.ts`、実 DB）：

- [ ] `findByPassageId`：行が無い問題は `audio: null` と `passage`（`status`・`publishedAt`）/ 非公開に戻した問題は `publishedAt` が残ったまま `status: "draft"` / 存在しない問題は null / `manifest` がそのまま読める
- [ ] `resetFailed`：failed だけ更新して true、pending・generating・ready は変えずに false。tx を渡してロールバックすると戻らない
- [ ] `requestRegeneration`：ready だけ `regenerate_requested_at`・`attempt_count = 0`・`last_error = null` にして true（`updated_at` は変わらない）、pending・generating・failed・行が無い・存在しない問題は false
- [ ] `PassageRepository.transitionStatus` に tx を渡してロールバックすると戻らない
- [ ] `findAdminDetail` が `audio` を返す、`summarizeNoAssistAccuracy` が `listened_block_count > 0` の挑戦を数えない（既存のテストに足す）

手動確認：step3 の手順で `ready` にした問題に挑戦し、`curl -H "Authorization: Bearer <token>" localhost:8080/api/attempt/<id>/audio` の `url` をブラウザで開いて再生できる。
