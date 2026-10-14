# step2-api-user-reminder

リマインダーの設定の取得 `GET /api/user/reminder` と保存 `PUT /api/user/reminder`（upsert）を実装する。既存の `user-router.ts` にルートを足す。

## 前提

- [study-reminder step1-db-reminder-settings](./step1-db-reminder-settings.md)（`reminder_settings`、`ReminderSetting` 型）
- API の仕様は README の [必要な API](../README.md#必要な-api)。削除済みユーザーを 401 にする理由は [github-auth のアカウント削除の処理](../../github-auth/README.md#アカウント削除の処理)（github-auth step5 の「書き込み系 API の 401」は、この API ではこの step で満たす）

## 対応内容

### 1. API スキーマ

`packages/schema/src/api-schema/reminder.ts` を新設し、`index.ts` に `export * from "./reminder"` を足す（ファイル名順）。

```typescript
/** packages/schema/src/api-schema/reminder.ts */
import { z } from "zod"

// ========================================================
// 共通: 時刻の形式
// ========================================================

/**
 * "HH:mm" かつ 15 分刻み（00 / 15 / 30 / 45）。"24:00" や秒付きは不可
 */
const REMINDER_TIME_PATTERN = /^([01]\d|2[0-3]):(00|15|30|45)$/

// ========================================================
// GET /api/user/reminder - リマインダーの設定の取得
// ========================================================

/**
 * リマインダーの設定の取得のレスポンススキーマ。未保存なら既定値（オフ・毎日・21:00）
 */
export const getUserReminderResponseSchema = z.object({
  is_enabled: z.boolean(),
  time: z.string().regex(REMINDER_TIME_PATTERN),
  weekdays: z.array(z.number().int().min(1).max(7)),
})

export type GetUserReminderResponse = z.infer<typeof getUserReminderResponseSchema>

// ========================================================
// PUT /api/user/reminder - リマインダーの設定の保存（upsert）
// ========================================================

/**
 * リマインダーの設定の保存のリクエストスキーマ。3 項目とも必須（全体を置き換える）
 */
export const updateUserReminderRequestSchema = z.object({
  is_enabled: z.boolean(),
  time: z.string().regex(REMINDER_TIME_PATTERN, "時刻は 15 分刻みの HH:mm で指定してください"),
  weekdays: z
    .array(z.number().int().min(1).max(7))
    .min(1, "曜日を 1 つ以上選んでください")
    .refine((values) => new Set(values).size === values.length, "曜日が重複しています"),
})

export type UpdateUserReminderRequest = z.infer<typeof updateUserReminderRequestSchema>

/**
 * リマインダーの設定の保存のレスポンススキーマ（保存後の値）
 */
export const updateUserReminderResponseSchema = z.object({
  is_enabled: z.boolean(),
  time: z.string().regex(REMINDER_TIME_PATTERN),
  weekdays: z.array(z.number().int().min(1).max(7)),
})

export type UpdateUserReminderResponse = z.infer<typeof updateUserReminderResponseSchema>
```

- GET と PUT のレスポンスは同じ形だが、エンドポイントごとに別の `z.object` で書く（`packages/schema/CLAUDE.md` の「共通スキーマは作らない」）。レスポンスも時刻の形式と曜日の値域で検証する（API が契約と違う値を返したら 500 にし、mobile は `parse` で弾く）
- mobile も `GetUserReminderResponse` / `UpdateUserReminderRequest` をここから import する（[step3](./step3-mobile-reminder.md)）
- オフにするときも `weekdays` と `time` を送る（オフの間も曜日と時刻を保持し、次にオンにしたとき元の値に戻すため）

### 2. Repository

interface は `src/repository/reminder-setting-repository.ts`（`src/repository/index.ts` に `export *` をファイル名順で足す）。

```typescript
/** apps/api/src/repository/reminder-setting-repository.ts */
import { ReminderSetting } from "@repo/domain"

/**
 * リマインダーの設定の保存時の入力
 */
export type UpsertReminderSettingInput = Pick<ReminderSetting, "isEnabled" | "time" | "weekdays">

/**
 * リマインダーの設定のリポジトリ
 */
export interface ReminderSettingRepository {
  findByUserId(userId: number): Promise<ReminderSetting | null>
  upsertByUserId(userId: number, data: UpsertReminderSettingInput): Promise<ReminderSetting>
}
```

Drizzle 実装 `src/repository/drizzle/reminder-setting-repository.ts`（`DrizzleReminderSettingRepository`）。`user_id` の unique index で `ON CONFLICT` する。

```typescript
public async upsertByUserId(userId: number, data: UpsertReminderSettingInput): Promise<ReminderSetting> {
  const values = { isEnabled: data.isEnabled, time: data.time, weekdays: data.weekdays }
  const [row] = await this._db
    .insert(reminderSettings)
    .values({ ...values, userId })
    .onConflictDoUpdate({ set: values, target: reminderSettings.userId })
    .returning()
  return this._toDomainReminderSetting(row)
}
```

- `_toDomainReminderSetting(row: ReminderSettingRow)` は既存の `_toDomainMemo` と同じ形で、`time` だけ `row.time.slice(0, 5)` にする（Postgres の `time` は `"21:00:00"` で返る）
- `updated_at` は `$onUpdate` が `ON CONFLICT DO UPDATE SET` にも入るので明示しない（Repository のテストで進むことを確認する）
- `reminderSettings` は `@repo/db` から import する（`drizzle-orm` を直接入れない）
- `src/repository/drizzle/index.ts` に `export *` で足す

### 3. Service

`src/service/reminder-service.ts` を新設し、`src/service/index.ts` に `export * as reminder from "./reminder-service"` を足す（ファイル名順）。

```typescript
/** apps/api/src/service/reminder-service.ts */
type ReminderSchedule = Pick<ReminderSetting, "isEnabled" | "time" | "weekdays">

/**
 * 未保存のユーザーに返す既定値（README「設定できる項目」：オフ・毎日・21:00）
 */
const DEFAULT_REMINDER_SCHEDULE: ReminderSchedule = { isEnabled: false, time: "21:00", weekdays: [1, 2, 3, 4, 5, 6, 7] }

/**
 * リマインダーの設定を取得する。未保存なら既定値
 */
export const getReminderSetting = async (
  userId: number,
  repo: { reminderSettingRepository: ReminderSettingRepository },
): Promise<Result<ReminderSchedule>> => {
  const setting = await repo.reminderSettingRepository.findByUserId(userId)
  if (!setting) return ok({ ...DEFAULT_REMINDER_SCHEDULE, weekdays: [...DEFAULT_REMINDER_SCHEDULE.weekdays] })
  return ok({ isEnabled: setting.isEnabled, time: setting.time, weekdays: setting.weekdays })
}

/**
 * リマインダーの設定を保存する（upsert）。曜日は昇順に並べて保存する
 */
export const saveReminderSetting = async (
  userId: number,
  input: UpsertReminderSettingInput,
  repo: { reminderSettingRepository: ReminderSettingRepository; userRepository: UserRepository },
): Promise<Result<ReminderSchedule>> => {
  /** 削除済みユーザーの残った access token で FK 違反（500）にしない */
  const user = await repo.userRepository.findById(userId)
  if (!user) return err(unauthorizedError("User not found"))

  const weekdays = [...input.weekdays].sort((a, b) => a - b)
  const setting = await repo.reminderSettingRepository.upsertByUserId(userId, { ...input, weekdays })
  return ok({ isEnabled: setting.isEnabled, time: setting.time, weekdays: setting.weekdays })
}
```

- 読み取り（GET）はユーザーの存在を確認しない（削除済みでも既定値を返すだけ。github-auth の方針）

### 4. Controller

`src/controller/user/get-reminder.ts`（`UserGetReminderController`）と `put-reminder.ts`（`UserPutReminderController`）。既存の `controller/user/get.ts` と同じく `AuthRequest` の `req.userId!` を使い、try-catch は書かない。

```typescript
/** apps/api/src/controller/user/put-reminder.ts */
export class UserPutReminderController {
  constructor(
    private _reminderSettingRepository: ReminderSettingRepository,
    private _userRepository: UserRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const data = parseRequest(updateUserReminderRequestSchema, req.body)

    const result = await service.reminder.saveReminderSetting(
      req.userId!,
      { isEnabled: data.is_enabled, time: data.time, weekdays: data.weekdays },
      { reminderSettingRepository: this._reminderSettingRepository, userRepository: this._userRepository },
    )
    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(updateUserReminderResponseSchema, {
      is_enabled: result.value.isEnabled,
      time: result.value.time,
      weekdays: result.value.weekdays,
    })
    return res.status(200).json(response)
  }
}
```

`UserGetReminderController` は `ReminderSettingRepository` だけを受け、`service.reminder.getReminderSetting` の結果を `getUserReminderResponseSchema` で返す（200）。

### 5. Router と DI

`src/routes/user-router.ts` の `UserRouterControllers` に `getReminder?: UserGetReminderController` と `putReminder?: UserPutReminderController` を足し、既存の `get` と同じ書き方（存在するときだけ登録、コメントは `/** GET /api/user/reminder */`）で `router.get("/reminder", ...)` と `router.put("/reminder", ...)` を登録する。

`src/index.ts` で `const reminderSettingRepository = new DrizzleReminderSettingRepository(db)` を作り、2 つの Controller を生成して `userRouter({ ... })` に渡す（キーはアルファベット順）。認証必須なので `PUBLIC_PATHS` には足さない。

## 動作確認

```bash
pnpm --filter @repo/api-schema build
pnpm --filter api test
pnpm lint:fix
```

Repository のテスト `test/repository/reminder-setting-repository.test.ts`（実 DB。ユーザーは `testDb` で先に作る）:

- 正常系
  - [ ] `upsertByUserId` で作った設定を `findByUserId` で取得でき、`time` が `"HH:mm"`（例 `"21:15"`）、`weekdays` が渡した配列になる
  - [ ] 2 回目の `upsertByUserId` で同じ行（`id` が同じ・行数 1）が更新され、`updatedAt` が進む
  - [ ] `"00:00"` と `"23:45"` が往復で変わらない（境界値）
- 異常系
  - [ ] `findByUserId` は設定の無いユーザーで `null`
  - [ ] 存在しない `userId` の `upsertByUserId` は throw する（FK 違反）
  - [ ] `users` の行を消すと `findByUserId` が `null` になる（cascade）

Service のユニットテスト（`test/service/reminder-service/getReminderSetting.test.ts`・`saveReminderSetting.test.ts`。Repository は `vi.fn()`）:

- [ ] 正常系: 保存済みなら保存値、未保存なら既定値（`isEnabled: false` / `"21:00"` / `[1..7]`）を返す
- [ ] 正常系: `weekdays: [5, 1, 3]` で `upsertByUserId` が `[1, 3, 5]` で呼ばれる
- [ ] 異常系: `userRepository.findById` が `null` なら `ok: false`・`type: "UNAUTHORIZED"`・`statusCode: 401` で、`upsertByUserId` は呼ばれない
- [ ] 異常系: Repository が throw したらそのまま reject する

Controller のインテグレーションテスト（`test/controller/user/get-reminder.test.ts`・`put-reminder.test.ts`。実 DB、ユーザーは `createTestUser`）:

- GET 正常系
  - [ ] 未保存なら 200 と `{ is_enabled: false, time: "21:00", weekdays: [1, 2, 3, 4, 5, 6, 7] }`（`toEqual`）
  - [ ] PUT した後の GET が保存した値を返す
- GET 異常系
  - [ ] トークンなし・無効なトークンで 401
- PUT 正常系
  - [ ] 初回で 200 と保存後の値を返し、`reminder_settings` に 1 行できる（`testDb` で `toMatchObject`）
  - [ ] 2 回目で同じ行が更新され、行数は 1 のまま
  - [ ] `weekdays: [7, 1]` は `[1, 7]` で返り、保存される
  - [ ] `time` の境界 `"00:00"`・`"23:45"` を受け付ける
- PUT 異常系
  - [ ] トークンなしで 401
  - [ ] トークンのユーザーが存在しない（`generateAccessToken(999999)`）と 401 で、行は作られない
  - [ ] 400 になり DB が変わらない: `weekdays` が `[]`・`[0]`・`[8]`・`[1, 1]`・`[1.5]`、`time` が `"21:10"`・`"24:00"`・`"9:00"`・`"21:00:00"`、`is_enabled` の欠落

手動確認（`pnpm --filter api dev`、トークンは dev-login で取得）:

```bash
curl -s -H "Authorization: Bearer $TOKEN" localhost:8080/api/user/reminder
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"is_enabled":true,"time":"07:45","weekdays":[5,1,3]}' localhost:8080/api/user/reminder
```

- [ ] 1 回目は既定値、PUT は `{"is_enabled":true,"time":"07:45","weekdays":[1,3,5]}` を返す
