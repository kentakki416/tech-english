# step3-api-user-goal

目標の取得 `GET /api/user/goal` と保存 `PUT /api/user/goal`（upsert）を実装する。仕様は [README の「目標」](../README.md#目標) と [「必要な API」](../README.md#必要な-api)。

## 前提

- [step1-db-user-goals](./step1-db-user-goals.md)（`user_goals`、`GOAL_METRICS` / `GOAL_TEXT_MAX_LENGTH` / `UserGoal`）
- [step2-api-user-stats](./step2-api-user-stats.md)（`UserGoalRepository` の `findByUserId` と DI はここで作り済み）

## 対応内容

### API 仕様

| メソッド | パス | 成功 | 失敗 |
| --- | --- | --- | --- |
| GET | `/api/user/goal` | 200 `{ goal: Goal \| null }` | 401（トークン無し） |
| PUT | `/api/user/goal` | 200 `{ goal: Goal }`（保存後の値） | 400（検証）/ 401（トークン無し・ユーザーが存在しない） |

- PUT は **すべての項目を送る**（省略は 400。空にする項目は `null` を送る）。部分更新はしない
- `weekly_metric` と `weekly_target` は両方あるか両方 `null`（DB の CHECK と同じ条件を API でも先に検証して 400 にする）
- PUT はユーザー単位の書き込みなので、`findById` が `null` なら 401（取り決め 5.3。外部キー違反の 500 にしない）。GET は読み取りなので存在確認をせず、行が無ければ `null` を返す

### api-schema（`packages/schema/src/api-schema/goal.ts`）

`index.ts` に `export * from "./goal"` を足す（ファイル名順）。

```typescript
import { z } from "zod"

import { GOAL_METRICS, GOAL_TEXT_MAX_LENGTH } from "@repo/domain"

// ========================================================
// 目標の共通スキーマ
// ========================================================

const goalSchema = z.object({
  goal_text: z.string().nullable(),
  target_date: z.string().nullable(),
  weekly_metric: z.enum(GOAL_METRICS).nullable(),
  weekly_target: z.number().int().nullable(),
})

// ========================================================
// GET /api/user/goal - 目標の取得
// ========================================================

/**
 * 目標取得のレスポンススキーマ。未設定なら goal は null
 */
export const getUserGoalResponseSchema = z.object({
  goal: goalSchema.nullable(),
})

// ========================================================
// PUT /api/user/goal - 目標の保存（upsert）
// ========================================================

/**
 * 目標保存のリクエストスキーマ。すべての項目が必須（空は null）
 */
export const updateUserGoalRequestSchema = z
  .object({
    /** 空文字は送らない（クライアントが null に変える） */
    goal_text: z.string().trim().min(1).max(GOAL_TEXT_MAX_LENGTH).nullable(),
    target_date: z.string().date().nullable(),
    weekly_metric: z.enum(GOAL_METRICS).nullable(),
    /** 1 以上。上限は 1 週間の分数 */
    weekly_target: z.number().int().min(1).max(10080).nullable(),
  })
  .refine((value) => (value.weekly_metric === null) === (value.weekly_target === null), {
    message: "週の目標の指標と値は両方指定するか、両方空にしてください",
    path: ["weekly_target"],
  })

export const updateUserGoalResponseSchema = z.object({
  goal: goalSchema,
})

export type GetUserGoalResponse = z.infer<typeof getUserGoalResponseSchema>
export type UpdateUserGoalRequest = z.infer<typeof updateUserGoalRequestSchema>
export type UpdateUserGoalResponse = z.infer<typeof updateUserGoalResponseSchema>
```

- `.max(200)` は JS の `length`（UTF-16 単位）で数えるので、DB の `varchar(200)`（文字数）より厳しくなる。DB 側で弾かれることはない
- 過去の日付の `target_date` も受け付ける（README に制約が無いため。マイページでは残り日数が負になる）
- web / mobile は Server Action / 送信前に同じスキーマで `safeParse` する

### Repository（`UserGoalRepository` に upsert を足す）

```typescript
/** apps/api/src/repository/user-goal-repository.ts */
export type UpsertUserGoalInput = {
  goalText: string | null
  targetDate: string | null
  weeklyMetric: GoalMetric | null
  weeklyTarget: number | null
}

export interface UserGoalRepository {
  findByUserId(userId: number): Promise<UserGoal | null>
  /** user_id の行があれば全項目を上書き、無ければ作る */
  upsertByUserId(userId: number, data: UpsertUserGoalInput): Promise<UserGoal>
}
```

Drizzle 実装は `onConflictDoUpdate`（`packages/db/drizzle/seed.ts` と同じく `updatedAt` を明示する）。

```typescript
/** apps/api/src/repository/drizzle/user-goal-repository.ts */
public async upsertByUserId(userId: number, data: UpsertUserGoalInput): Promise<UserGoal> {
  const values = {
    goalText: data.goalText,
    targetDate: data.targetDate,
    weeklyMetric: data.weeklyMetric,
    weeklyTarget: data.weeklyTarget,
  }
  const [row] = await this._db
    .insert(userGoals)
    .values({ ...values, userId })
    .onConflictDoUpdate({ set: { ...values, updatedAt: new Date() }, target: userGoals.userId })
    .returning()
  return this._toDomainUserGoal(row)
}
```

Prisma 実装は `this._prisma.userGoal.upsert({ create: { ...data, userId }, update: data, where: { userId } })`。`targetDate` は `@db.Date` なので書くときは `new Date(\`${targetDate}T00:00:00.000Z\`)`、読むときは `toISOString().slice(0, 10)` に変換する。

### Service（`src/service/goal-service.ts`）

```typescript
type GoalRepo = { userGoalRepository: UserGoalRepository, userRepository: UserRepository }

/**
 * 目標を取得する（未設定なら null）
 */
export const getUserGoal = async (
  userId: number,
  repo: { userGoalRepository: UserGoalRepository },
): Promise<Result<UserGoal | null>> => ok(await repo.userGoalRepository.findByUserId(userId))

/**
 * 目標を保存する。削除済みユーザーの access token で書き込まれないよう、先にユーザーの存在を確かめる
 */
export const saveUserGoal = async (
  userId: number,
  data: UpsertUserGoalInput,
  repo: GoalRepo,
): Promise<Result<UserGoal>> => {
  const user = await repo.userRepository.findById(userId)
  if (!user) return err(unauthorizedError("User not found"))

  const goal = await repo.userGoalRepository.upsertByUserId(userId, data)
  return ok(goal)
}
```

`src/service/index.ts` に `export * as goal from "./goal-service"` を足す（ファイル名順）。

### Controller / Router / DI

- `src/controller/user/get-goal.ts`（`UserGetGoalController(userGoalRepository)`）・`put-goal.ts`（`UserPutGoalController(userGoalRepository, userRepository)`）。`put-goal.ts` は `parseRequest(updateUserGoalRequestSchema, req.body)` の snake_case を camelCase の `UpsertUserGoalInput` に詰め替えて Service に渡す
- domain → レスポンス（`goal_text` / `target_date` / `weekly_metric` / `weekly_target`）の詰め替えは各 Controller に書く（Controller は API と 1 対 1。Controller 同士で import しない）
- `user-router.ts`: `getGoal?` / `putGoal?` を足し、`router.get("/goal")`・`router.put("/goal")` を登録する
- `src/index.ts`: step2 で生成した `userGoalRepository` を使って 2 つの Controller を組み立て、`userRouter({ ... })` に渡す

## 動作確認

```bash
pnpm --filter @repo/api-schema build
pnpm --filter api test
pnpm lint:fix
```

Repository の契約テスト（`test/repository/user-goal-repository.test.ts` に足す。Drizzle / Prisma の `describe.each`）:

- [ ] 行が無いとき `upsertByUserId` が作成し、`findByUserId` で同じ値が取れる（`targetDate` は `YYYY-MM-DD` の文字列）
- [ ] 2 回目の `upsertByUserId` は同じ行を上書きし、行は 1 つのまま。`null` を渡した項目は `null` になる
- [ ] `weeklyMetric` だけ指定して `weeklyTarget` が `null` だと CHECK 違反で throw する
- [ ] 存在しない `userId` は外部キー違反で throw する

Service のユニットテスト（`test/service/goal-service/`）:

- [ ] `saveUserGoal`: ユーザーが存在すれば `upsertByUserId` を呼んで ok
- [ ] `saveUserGoal`: ユーザーが存在しなければ `UNAUTHORIZED`（401）で、`upsertByUserId` を呼ばない
- [ ] `getUserGoal`: 行が無ければ `ok(null)`

Controller のインテグレーションテスト（`test/controller/user/get-goal.test.ts`・`put-goal.test.ts`）:

- [ ] GET: 目標が無いとき 200 `{ goal: null }`、あるとき 200 で全項目（`toEqual`）。トークン無しで 401
- [ ] PUT: 200 で保存し、DB の `user_goals` が 1 行（`toMatchObject`）。2 回目の PUT で上書きされ行は 1 つのまま
- [ ] PUT: すべて `null` で 200
- [ ] PUT: `goal_text` が 200 文字で 200、201 文字で 400。空白だけは 400
- [ ] PUT: `weekly_target` が 1 で 200、0 で 400、10081 で 400
- [ ] PUT: 指標だけ・値だけは 400。`weekly_metric = "hours"` は 400。`target_date = "2026-02-30"` は 400
- [ ] PUT: 項目が欠けている（例 `target_date` を送らない）と 400
- [ ] PUT: トークン無しで 401、削除済みユーザーのトークンで 401（DB に行が作られない）
