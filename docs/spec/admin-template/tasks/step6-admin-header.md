# step6-admin-header

ヘッダーのユーザーメニュー・通知・検索を、データを props で受け取る作りにする。`(dashboard)/layout.tsx` を Server Component にしてデータを取り、クライアント側のシェル（`AdminShell`）に渡す。マイページ（`/profile`）を作る。テンプレートの #129 と #131 に当たる。

設計: [ヘッダーへのデータの渡し方](../README.md#ヘッダーへのデータの渡し方) / [仕様: ヘッダー](../README.md#ヘッダー) / [仕様: マイページ](../README.md#マイページ)

## 前提

- [step2](./step2-admin-app-config.md)（`libs/date.ts`・`AppLogo`）と [step5](./step5-admin-auth-screens.md)（cookie・api-client・`logoutAction`）の後。`GET /api/admin/me` は [step4](./step4-api-admin-auth.md)
- `/profile` は step1 で TailAdmin のプロフィールを `/demo/profile` に移して空いている
- この step のパスは、特に書かない限り `apps/admin/src/` からの相対

## 対応内容

### 変更するファイル

```
apps/admin/src/
├── app/(dashboard)/layout.tsx                         # Server Component にし、admin と通知を取る
├── app/(dashboard)/profile/page.tsx                   # 新設 マイページ
├── components/layout/AdminShell.tsx                   # 新設 今の layout の中身（client）
├── components/layout/AppHeader.tsx                    # props を受け取って下に配る。検索欄を切り出す
├── components/features/header/HeaderSearch.tsx        # 新設
├── components/features/header/NotificationDropdown.tsx  # 作り直す
├── components/features/header/UserDropdown.tsx        # 作り直す
├── components/features/profile/AdminProfileCards.tsx  # 新設
├── components/ui/avatar/UserAvatar.tsx                # 新設
├── components/ui/avatar/AvatarText.tsx                # 頭文字の切り方
├── features/admin/admin.api.ts                        # 新設 getMe
├── features/admin/admin-display-name.ts               # 新設
├── features/notification/notification.api.ts          # 新設 空の実装
├── features/notification/notification.actions.ts      # 新設 markAllAsReadAction
├── features/notification/notification.entity.ts       # 新設 AdminNotification
├── features/user/user.params.ts                       # USER_LIST_KEYWORD_MAX_LENGTH を export
└── libs/date.ts                                       # formatRelativeTime を足す
```

### テンプレートから写すファイル

次はテンプレートの `apps/admin/src/` の同じパスのファイルを写す（#129 と #131 の後の版）。

| ファイル | 中身 | tech-english との違い |
| --- | --- | --- |
| `components/features/header/HeaderSearch.tsx` | `next/form` の GET 送信で `action?q=...`。⌘K / Ctrl+K でフォーカス（検索欄が隠れている幅では止めない）。props は `action`・`maxLength`・`placeholder` | なし |
| `components/features/header/NotificationDropdown.tsx` | `notifications` を描く。未読があればベルに印。0 件なら「通知はありません」。未読があり `markAllAsReadAction` があるときだけ「すべて既読にする」（`<form>` の中の素の `<button type="submit">`）。経過時間は `formatRelativeTime` | なし |
| `components/features/header/UserDropdown.tsx` | `admin`（`avatar_url`・`email`・`name`）を出す。メニューは「マイページ」（`/profile`）と「ログアウト」（`logoutAction`） | なし |
| `components/features/profile/AdminProfileCards.tsx` | アイコン・名前・email と、基本情報（名前・メールアドレス・登録日時・最終サインイン日時）。「名前とアイコンは Google アカウントのものを表示しています（サインインのたびに更新されます）」 | 日時は tech-english の `formatDateTime`（`YYYY-MM-DD HH:mm`）で出る |
| `components/ui/avatar/UserAvatar.tsx` | 画像が無ければ `AvatarText`。大きさは `sm`（40px）・`md`（44px）・`lg`（80px）。外部の画像なので `unoptimized`・`referrerPolicy="no-referrer"` | `sm` はユーザー一覧で使わないが、テンプレートのまま残す |
| `components/ui/avatar/AvatarText.tsx` | 頭文字は単語ごとの最初の文字（記号を飛ばす。「Admin (dev)」は「AD」）。取れなければ「?」。`twMerge` で `className` を重ねる | 今の TailAdmin の版を置き換える（今はどこからも使っていない） |
| `features/admin/admin.api.ts` | `adminApi.getMe()`（`GET /api/admin/me` を `getAdminMeResponseSchema` で parse）。`server-only` | なし |
| `features/admin/admin-display-name.ts` | `resolveAdminDisplayName`（名前、無ければ email） | なし |
| `features/notification/notification.entity.ts` | `AdminNotification`（`id`・`avatarUrl?`・`body`・`href?`・`isRead`・`createdAt`） | なし |
| `features/notification/notification.api.ts` | `notificationApi.getList()` は空の配列、`markAllAsRead()` は何もしない。`server-only` | 説明の「テンプレートでは通知の元を持たない」を「tech-english には今は通知の元が無い」に直す |
| `features/notification/notification.actions.ts` | `markAllAsReadAction`。失敗しても画面をエラーにしない（catch の先頭で `unstable_rethrow`） | なし |
| `app/(dashboard)/profile/page.tsx` | `adminApi.getMe()` を `AdminProfileCards` に渡す。`metadata.title` は「マイページ」 | なし |

### layout とシェル

`app/(dashboard)/layout.tsx`（今の client component の中身は `AdminShell` に移す）:

```tsx
import { unstable_rethrow } from "next/navigation"
import React from "react"

import AdminShell from "@/components/layout/AdminShell"
import { adminApi } from "@/features/admin/admin.api"
import { markAllAsReadAction } from "@/features/notification/notification.actions"
import { notificationApi } from "@/features/notification/notification.api"
import { USER_LIST_KEYWORD_MAX_LENGTH } from "@/features/user/user.params"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [admin, notifications] = await Promise.all([
    adminApi.getMe(),
    notificationApi.getList().catch((error: unknown) => {
      unstable_rethrow(error)
      console.error("通知を取得できませんでした", error)
      return []
    }),
  ])

  return (
    <AdminShell
      admin={admin}
      markAllAsReadAction={markAllAsReadAction}
      notifications={notifications}
      search={{ action: "/users", maxLength: USER_LIST_KEYWORD_MAX_LENGTH ?? undefined, placeholder: "ユーザーを検索" }}
    >
      {children}
    </AdminShell>
  )
}
```

- 実装では、layout で `/api/admin/me` を呼ぶ理由（proxy は cookie の期限しか見ないので、画面を直接開いたとき・再読み込みのときに api がトークンを確かめる。クライアント側の遷移では layout が描き直されないので、機密を出す画面は自分で api を呼ぶ）と、通知の失敗で画面をエラーにしない理由を、この layout の側に書く（テンプレートと同じ）
- api の 401 は api-client が `/api/auth/signout` に送る。layout では扱わない

`components/layout/AdminShell.tsx`（今の `(dashboard)/layout.tsx` の中身。`min-w-0` を残す）:

```tsx
"use client"

import React from "react"

import AppHeader, { type AppHeaderProps } from "@/components/layout/AppHeader"
import AppSidebar from "@/components/layout/AppSidebar"
import Backdrop from "@/components/layout/Backdrop"
import { useSidebar } from "@/features/sidebar/sidebar.context"

type AdminShellProps = AppHeaderProps & {
  children: React.ReactNode
}

export default function AdminShell({ children, ...headerProps }: AdminShellProps) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar()

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
      ? "lg:ml-[290px]"
      : "lg:ml-[90px]"

  return (
    <div className="min-h-screen xl:flex">
      <AppSidebar />
      <Backdrop />
      <div className={`min-w-0 flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}>
        <AppHeader {...headerProps} />
        <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">{children}</div>
      </div>
    </div>
  )
}
```

- `min-w-0` の理由（flex の子は既定で中身の最小幅より縮まないので、広い表がページを広げる）は、今の layout のコメントを `AdminShell` の側に移す。テンプレートの `AdminShell` には無い
- Server Action（`markAllAsReadAction`）は Server Component から client component に props で渡せる

### `AppHeader`

```typescript
export type AppHeaderProps = {
  admin: GetAdminMeResponse
  markAllAsReadAction?: () => Promise<void>
  notifications: AdminNotification[]
  search?: HeaderSearchProps
}
```

- `export default function AppHeader({ admin, markAllAsReadAction, notifications, search }: AppHeaderProps)` にする
- 今の検索欄（`inputRef` と ⌘K の `useEffect`、`<form>`）を消し、`{search && <HeaderSearch {...search} />}` にする。置く場所（`hidden lg:block` の中）は今のまま
- `<NotificationDropdown markAllAsReadAction={markAllAsReadAction} notifications={notifications} />` と `<UserDropdown admin={admin} />` にする
- スマホ幅のロゴは step2 の `<AppLogo className="lg:hidden" />` のまま
- テンプレートの `AppHeader.tsx` と差分で見比べ、上の 3 つのほかは今の tech-english の版を残す

### 検索の上限（`features/user/user.params.ts`）

```typescript
export const USER_LIST_KEYWORD_MAX_LENGTH = QUERY_FIELDS.q.unwrap().maxLength
```

- `convertSearchParamsToUserListQuery` の `QUERY_FIELDS.q.unwrap().maxLength` もこの定数にする
- テンプレートの `ADMIN_USER_LIST_MAX_QUERY_LENGTH`（`@repo/api-schema`。#128）は使わない。tech-english のユーザー一覧の `q` の上限（`getAdminUserListQueryStringSchema` の `max(200)`）を、今と同じくスキーマから読む
- ヘッダーの検索は `/users?q=...` に移る。並べ替え（`sort`・`order`）は付けないので既定（登録日の新しい順）に戻る

### 相対時刻（`libs/date.ts`）

テンプレートの `libs/date.ts` の `formatRelativeTime`（と、それが使う `relativeTimeFormatter`・`dayFormatter`・秒の定数・`RELATIVE_TIME_LIMIT_DAYS`）を写す。

```typescript
export const formatRelativeTime = (value: string | Date, now: Date = new Date()): string => {
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return "-"
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000))
  if (seconds < SECONDS_PER_MINUTE) return relativeTimeFormatter.format(0, "second")
  if (seconds < SECONDS_PER_HOUR) return relativeTimeFormatter.format(-Math.floor(seconds / SECONDS_PER_MINUTE), "minute")
  if (seconds < SECONDS_PER_DAY) return relativeTimeFormatter.format(-Math.floor(seconds / SECONDS_PER_HOUR), "hour")
  const days = Math.floor(seconds / SECONDS_PER_DAY)
  if (days < RELATIVE_TIME_LIMIT_DAYS) return dayFormatter.format(-days, "day")
  return formatDateTime(date)
}
```

- 日の単位は `numeric: "always"`（「1 日前」）。経過時間で数えるので、`"auto"`（「昨日」）だと暦の上の昨日とずれる（#131 の修正。理由は `dayFormatter` の側に書く）
- 30 日より前は `formatDateTime`（tech-english の書式）で出す
- ロケールは `appConfig.locale`

### ドキュメント

- `apps/admin/CLAUDE.md`
  - 「API 接続の下地」に足す：`(dashboard)/layout.tsx` は Server Component で、`/api/admin/me` と通知を取って `AdminShell` に渡す。ヘッダーの部品は props で受け取る。クライアント側の遷移では layout が描き直されないので、機密を出す画面は自分で api を呼ぶ
  - 「接続済みの画面」の表に `/profile`（マイページ。`AdminProfileCards` + `features/admin/admin.api.ts`）を足す
  - 通知は `features/notification/notification.api.ts` で、今は空を返すスタブ。通知を作るときはここを api の呼び出しに差し替える
- `apps/admin/README.md`：ディレクトリ構成に `components/layout/AdminShell.tsx`・`features/{admin,notification}/` を足す

## 動作確認

```bash
pnpm --filter admin lint
pnpm --filter admin build
```

`verify-web-page` skill で行う（先に `http://localhost:3030/api/dev/login`）。

| 確認 | 期待 |
| --- | --- |
| dev admin でログインしてヘッダーを見る | 「Admin (dev)」と `admin@dev.local`、頭文字「AD」のアイコン |
| ユーザーメニュー → マイページ | `/profile` に admin の情報。登録日時・最終サインイン日時が `YYYY-MM-DD HH:mm` |
| ユーザーメニュー → ログアウト | `/signin` に戻り、cookie が消える |
| ベルを押す | 「通知はありません」。ベルに印が無い |
| `notificationApi.getList` を一時的に未読 2 件・既読 1 件（5 分前・3 時間前・2 日前）を返すように変えて開く | 印が付き、3 件が「5 分前」「3 時間前」「2 日前」で出る。「すべて既読にする」が出る（確かめた後に戻す） |
| ヘッダーの検索に `alice` を入れて Enter | `/users?q=alice` で alice だけの一覧 |
| 201 文字を入れようとする | 200 文字で止まる |
| ⌘K / Ctrl+K | 検索欄にフォーカスする。スマホ幅（検索欄が隠れている）ではブラウザの ⌘K を止めない |
| 広い表の画面（問題一覧・ダッシュボードの問題ごとの成績）を狭い幅で開く | ページ全体が横に広がらず、表の枠の中でスクロールする（`min-w-0` が効いている） |
| api を止めた状態で画面を開く | Next.js のエラー画面。サインイン画面には送らない |
| access / refresh の cookie を両方消して画面を移る | proxy で `/signin` へ |
| ダークモード・スマホ幅 | ヘッダー・ドロップダウン・マイページが崩れない |

PR には、ヘッダー（ユーザーメニューと通知を開いた状態）とマイページのスクリーンショット（ライト / ダーク）を、変更前のヘッダー（TailAdmin のダミー）と並べて付ける。
