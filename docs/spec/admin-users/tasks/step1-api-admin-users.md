# step1-api-admin-users

ユーザー管理の API を 4 つ足す：一覧（`GET /api/admin/user`）、詳細（`GET /api/admin/user/:id`）、カレンダー（`GET /api/admin/user/:id/calendar`）、学習履歴（`GET /api/admin/user/:id/attempts`）。一覧だけ `UserRepository` に集計のメソッドを足し、ほかはマイページの Service をそのまま使う。

## 前提

- learning-record（`learningRecord.getUserStats`・`getUserCalendar`・`getUserAttempts`、`src/controller/user/{stats,calendar,attempts}.ts`）、vocabulary-cards（`vocabulary.getVocabularySummary`）
- 既存の admin の API の形（`src/routes/admin-router.ts`・`src/controller/admin/*`）。方針は `apps/api/CLAUDE.md` の「Admin API 設計方針」
- 仕様は README の [ユーザー一覧](../README.md#ユーザー一覧)・[ユーザーの詳細](../README.md#ユーザーの詳細)、作り方は [設計](../README.md#設計)

## 対応内容

### 1. `@repo/domain`

値は `src/const/admin-user.ts`、型は `src/types/admin-user.ts`（値から導出）に足し、`src/index.ts` に名前を列挙して export する。

```typescript
/** packages/domain/src/const/admin-user.ts */

/**
 * ユーザー一覧の並べ替えの列
 */
export const ADMIN_USER_SORTS = ["created_at", "last_studied_date", "solved_attempts"] as const
```

```typescript
/** packages/domain/src/types/admin-user.ts */
import type { ADMIN_USER_SORTS } from "../const/admin-user"

export type AdminUserSort = (typeof ADMIN_USER_SORTS)[number]
```

### 2. API スキーマ

`packages/schema/src/api-schema/admin/user.ts` を足し、`src/api-schema/index.ts` で re-export する。学習のまとめ・カレンダー・学習履歴・単語帳の枚数は、ユーザー向けと同じ形なので re-export する（admin で形を変えない）。

```typescript
/** packages/schema/src/api-schema/admin/user.ts */
import { z } from "zod"

import { ADMIN_USER_SORTS } from "@repo/domain"

import {
  getUserAttemptsQueryStringSchema,
  getUserAttemptsResponseSchema,
  getUserCalendarQueryStringSchema,
  getUserCalendarResponseSchema,
  getUserStatsResponseSchema,
} from "../learning-record"
import { getVocabularySummaryResponseSchema } from "../vocabulary"

const adminUserBaseSchema = z.object({
  id: z.number().int(),
  avatar_url: z.string().nullable(),
  /**
   * 登録日時（ISO 8601）
   */
  created_at: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  /**
   * ログイン方法（auth_accounts.provider。"github" / "google" / "dev" など。名前順・重複なし）
   */
  providers: z.array(z.string()),
})

/**
 * ユーザー一覧の並べ替えの列（admin は @repo/domain を import できないので、domain の AdminUserSort と同じ集合の型をここからも出す）
 */
export const adminUserSortSchema = z.enum(ADMIN_USER_SORTS)

export type AdminUserSort = z.infer<typeof adminUserSortSchema>

// ========================================================
// GET /api/admin/user - ユーザー一覧
// ========================================================

export const getAdminUserListQueryStringSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  /**
   * 名前・メールアドレスの部分一致
   */
  q: z.string().trim().min(1).max(200).optional(),
  sort: adminUserSortSchema.default("created_at"),
})


export const getAdminUserListResponseSchema = z.object({
  limit: z.number().int(),
  page: z.number().int(),
  total: z.number().int(),
  users: z.array(adminUserBaseSchema.extend({
    /**
     * 最後に問題を解いた・単語帳で答えた日（学習したときのユーザーのタイムゾーンの日付）。学習していなければ null
     */
    last_studied_date: z.string().nullable(),
    solved_attempts: z.number().int(),
  })),
})

// ========================================================
// GET /api/admin/user/:id - ユーザーの詳細
// ========================================================

export const getAdminUserPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const getAdminUserResponseSchema = z.object({
  stats: getUserStatsResponseSchema,
  user: adminUserBaseSchema.extend({
    /**
     * 最後に問題を解いた・単語帳で答えた日（一覧と同じ。学習していなければ null）
     */
    last_studied_date: z.string().nullable(),
    timezone: z.string(),
  }),
  vocabulary: getVocabularySummaryResponseSchema,
})

// ========================================================
// GET /api/admin/user/:id/calendar・/attempts - ユーザー向けと同じ
// ========================================================

export const getAdminUserCalendarPathParamSchema = z.object({ id: z.coerce.number().int().positive() })
export const getAdminUserCalendarQueryStringSchema = getUserCalendarQueryStringSchema
export const getAdminUserCalendarResponseSchema = getUserCalendarResponseSchema
export const getAdminUserAttemptsPathParamSchema = z.object({ id: z.coerce.number().int().positive() })
export const getAdminUserAttemptsQueryStringSchema = getUserAttemptsQueryStringSchema
export const getAdminUserAttemptsResponseSchema = getUserAttemptsResponseSchema
```

- `providers` は `auth_accounts.provider` の文字列の配列（`z.string()`）。表示名（GitHub・Google など）への変換は admin（step2 の `user.labels.ts`）
- 型は `z.infer` して export する（`AdminUserSort` も admin が使う）

### 3. Repository

`UserRepository` に一覧のメソッドを足す（`src/repository/user-repository.ts` と `src/repository/drizzle/user-repository.ts`）。

```typescript
/** apps/api/src/repository/user-repository.ts */

export type AdminUserListItem = User & {
  lastStudiedDate: string | null
  providers: string[]
  solvedAttempts: number
}

export interface UserRepository {
  /** …既存のメソッド */

  /**
   * admin のユーザー一覧。解いた回数・最後に学習した日・ログイン方法を結び、絞り込み・並べ替え・ページ分けまでする
   */
  findForAdmin(query: {
    limit: number
    offset: number
    order: "asc" | "desc"
    q?: string
    sort: AdminUserSort
  }): Promise<{ items: AdminUserListItem[]; total: number }>
}
```

実装のメモ（README の [一覧の集計](../README.md#一覧の集計)）：

```sql
SELECT u.*,
  coalesce(a.solved_attempts, 0) AS solved_attempts,
  GREATEST(a.last_date, v.last_date) AS last_studied_date,
  coalesce(p.providers, '{}') AS providers,
  count(*) OVER () AS total
FROM users u
LEFT JOIN (
  SELECT user_id, count(*) AS solved_attempts, max(study_date) AS last_date
  FROM reading_attempts WHERE status = 'submitted' GROUP BY user_id
) a ON a.user_id = u.id
LEFT JOIN (SELECT user_id, max(study_date) AS last_date FROM vocabulary_reviews GROUP BY user_id) v ON v.user_id = u.id
LEFT JOIN (SELECT user_id, array_agg(DISTINCT provider ORDER BY provider) AS providers FROM auth_accounts GROUP BY user_id) p ON p.user_id = u.id
WHERE ($q IS NULL OR u.name ILIKE $pattern OR u.email ILIKE $pattern)
ORDER BY <sort> <order> NULLS LAST, u.id
LIMIT $limit OFFSET $offset
```

- 並べ替えの列は `Record<AdminUserSort, SQL>` で対応させる（文字列を SQL に埋め込まない）
- `q` は `%`・`_`・`\` をエスケープしてから `%q%` にする。admin-dashboard の問題ごとの成績と同じ `src/repository/drizzle/like-pattern.ts` の `buildContainsLikePattern` を使う
- ページの範囲外（行が 0 件）のときは、件数だけ別の `count(*)` で数え直す

テスト（`test/repository/user-repository.test.ts` に足す、実 DB）：

- 解いた回数は提出済みだけ。最後に学習した日は、問題と単語帳の新しい方。どちらも無いと null
- `q` が名前とメールアドレスの両方に当たる、大文字・小文字を区別しない、`%` を文字として扱う
- 各 `sort` の並び（`NULLS LAST`、同じ値は ID の順）・`total`・`offset`・範囲外のページ
- ログイン方法が 2 つあるユーザーは配列に 2 つ、無いユーザーは空の配列

### 4. 学習記録のレスポンスの変換を共通にする

`src/controller/user/stats.ts` などの Controller の中で組み立てているレスポンスを、`src/controller/user/learning-record-mapper.ts` の関数（`convertUserStatsToResponse`・`convertUserCalendarToResponse`・`convertUserAttemptsToResponse`）に移す。単語帳の枚数も同じく `convertVocabularySummaryToResponse` にする。ユーザー向けと admin の Controller の両方から使う（ユーザー向けの挙動は変えない）。

### 5. Service

`src/service/admin-user-service.ts` を足し、`src/service/index.ts` に `export * as adminUser`（名前順）。

```typescript
/** apps/api/src/service/admin-user-service.ts */

/**
 * ユーザー一覧（page は 1 始まり）
 */
export const getAdminUserList = async (
  query: { limit: number; order: "asc" | "desc"; page: number; q?: string; sort: AdminUserSort },
  repo: { userRepository: UserRepository },
): Promise<Result<AdminUserList>> => { /** offset = (page - 1) * limit */ }

/**
 * ユーザーの詳細。基本の情報・ログイン方法・最後に学習した日に、マイページと同じ学習のまとめ・単語帳の枚数を足す。ユーザーが居なければ notFoundError
 */
export const getAdminUser = async (
  userId: number,
  repo: AdminUserRepo,
  deps: { now: Date },
): Promise<Result<AdminUserDetail>> => {
  /** findById → 無ければ notFoundError。getUserStats・getVocabularySummary・findProvidersByUserId・findStudyDates を Promise.all で呼び、err があればそれを返す */
}

/**
 * 学習カレンダー。ユーザーが居なければ notFoundError（居れば learningRecord.getUserCalendar をそのまま返す）
 */
export const getAdminUserCalendar = async (
  userId: number,
  range: { from?: string; to?: string },
  repo: { learningRecordRepository: LearningRecordRepository; userRepository: UserRepository },
  deps: { now: Date },
): Promise<Result<UserCalendar>> => { /** … */ }

/**
 * 学習履歴。ユーザーが居なければ notFoundError（居れば learningRecord.getUserAttempts をそのまま返す）
 */
export const getAdminUserAttempts = async (
  userId: number,
  query: { cursor?: number; date?: string; limit: number },
  repo: { learningRecordRepository: LearningRecordRepository; userRepository: UserRepository },
): Promise<Result<UserAttempts>> => { /** … */ }
```

- マイページの Service（`getUserStats`・`getUserCalendar`・`getUserAttempts`・`getVocabularySummary`）はユーザーが居ないと `unauthorizedError`（401）を返すので、admin の Service が先に `userRepository.findById` で確かめ、居なければ `notFoundError`（404）を返す。確かめた後に退会して中の Service が 401 を返したときも 404 に読み替える
- 戻り値と `repo` の型（`AdminUserList`・`AdminUserDetail`・`AdminUserRepo`）は同じファイルで定義する。`AdminUserRepo` は `getUserStats` と `getVocabularySummary` が使う Repository（`learningRecordRepository`・`userGoalRepository`・`userRepository`・単語帳の Repository）に `authAccountRepository` を足したもの
- 最後に学習した日は `learningRecordRepository.findStudyDates(userId)` の最後の日（学習していなければ null）
- ログイン方法は `AuthAccountRepository` に `findProvidersByUserId(userId): Promise<string[]>`（名前順・重複なし）を新しく足す。`test/repository/` に実 DB のテストも足す
- テスト（`test/service/admin-user-service/` に関数ごとのファイル、Repository は `vi.fn()`）：offset の計算、詳細・カレンダー・学習履歴でユーザーが居ないと 404、学習のまとめの err をそのまま返す

### 6. Controller・Router・DI

- `src/controller/admin/user/list.ts`・`detail.ts`・`calendar.ts`・`attempts.ts`（`AdminUserListController` など）。calendar と attempts は `src/controller/user/calendar.ts`・`attempts.ts` と同じレスポンスを、`req.userId` の代わりにパスの `:id` で `adminUser.getAdminUserCalendar`・`getAdminUserAttempts` から作る
- `admin-router.ts` の `AdminRouterControllers` に `user?: { attempts?; calendar?; detail?; list? }` を足し、`GET /user`・`GET /user/:id`・`GET /user/:id/calendar`・`GET /user/:id/attempts` を登録する
- `src/index.ts` で、既存の `userRepository`・`learningRecordRepository`・`userGoalRepository`・`authAccountRepository`・単語帳の Repository を渡す（`UserStatsController` と同じ組み合わせに `authAccountRepository` を足す）

テスト（`test/controller/admin/user/*.test.ts`、supertest）：

- 正常系：4 つとも 200 とスキーマどおりのボディ。詳細の `stats` がユーザー向けの `GET /api/user/stats`（同じユーザー・同じ時刻）と同じになる
- 異常系：`X-Admin-Token` が無いと 401、`sort=name`・`page=0`・`page=10001`・`limit=101` は 400、存在しないユーザーは詳細・カレンダー・学習履歴の 3 つとも 404

## 動作確認

```bash
pnpm --filter @repo/domain build && pnpm --filter @repo/api-schema build
pnpm --filter api test
pnpm build && pnpm lint:fix
```

dev の DB で叩く（dev の seed のユーザー alice / bob が居る）。

```bash
curl -s -H "X-Admin-Token: $ADMIN_API_TOKEN" "http://localhost:8080/api/admin/user?q=alice" | jq
curl -s -H "X-Admin-Token: $ADMIN_API_TOKEN" "http://localhost:8080/api/admin/user/1" | jq '.stats.totals, .vocabulary'
curl -s -H "X-Admin-Token: $ADMIN_API_TOKEN" "http://localhost:8080/api/admin/user/1/attempts?limit=5" | jq
```

- [ ] web で alice として問題を 1 回解くと、一覧の解いた回数と最後に学習した日が変わり、詳細の数字が alice のマイページと同じになる
