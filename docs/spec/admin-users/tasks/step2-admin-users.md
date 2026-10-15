# step2-admin-users

admin にユーザー一覧（`/users`）とユーザーの詳細（`/users/[id]`）を足し、サイドバーに「ユーザー」を足す。

## 前提

- [step1-api-admin-users](./step1-api-admin-users.md)
- 見た目は README の [UI 設計](../README.md#ui-設計) とモック（`apps/admin/src/app/(dashboard)/mock/users/`）に従う。モックの部品（`UserAvatar`・`UserCalendar` など）は本実装の `components/features/user/` に移して使う（`mock/` は import しない）
- admin の画面の作り方は `apps/admin/CLAUDE.md` の「API 接続の下地」。学習カレンダーの草は、web のマイページ（learning-record の UI 設計）と同じ見た目を admin の部品で作る（web の部品は import できない）

## 対応内容

### 1. API の呼び出し

`src/features/user/user.api.ts`（先頭に `import "server-only"`）。

```typescript
/** apps/admin/src/features/user/user.api.ts */
import "server-only"

export const userApi = {
  getList: async (query: { order: "asc" | "desc"; page: number; q?: string; sort: AdminUserSort }) => { /** GET /api/admin/user */ },
  /**
   * ユーザーが居なければ null（404）
   */
  getDetail: async (id: number) => { /** GET /api/admin/user/:id */ },
  getCalendar: async (id: number, range?: { from: string; to: string }) => { /** GET /api/admin/user/:id/calendar */ },
  getAttempts: async (id: number, query: { cursor?: number; limit: number }) => { /** GET /api/admin/user/:id/attempts */ },
}
```

- `searchParams` の検証（不正・未指定は `created_at`・`desc`・1 ページ目）は `src/features/user/user.params.ts` の純関数にする
- ログイン方法の表示名（`github` → GitHub、`google` → Google、`dev` → dev、知らない値はそのまま）は `src/features/user/user.labels.ts`

### 2. ユーザー一覧（`/users`）

- `app/(dashboard)/users/page.tsx`（`await connection()`）と `components/features/user/UserTable.tsx`
- 列の見出しが並べ替えのリンク、名前・メールアドレスの絞り込み（`?q=`。GET の form）、ページ送り、全体の件数
- 行は `/users/[id]` へのリンク。名前が無ければ「（名前なし）」、最後に学習した日が無ければ「—」
- `metadata.title` は「ユーザー | tech-english admin」

### 3. ユーザーの詳細（`/users/[id]`）

- `app/(dashboard)/users/[id]/page.tsx`。詳細・カレンダー・学習履歴の 1 ページ目を `Promise.all` で取る。ユーザーが居なければ `notFound()`
- `components/features/user/`：
  - `UserProfileCard.tsx`：アイコン・名前・メールアドレス・ユーザー ID・ログイン方法・登録日時（日本時間。`formatDateTime`）・タイムゾーン
  - `UserStatsCards.tsx`：連続学習日数・解いた回数と問題の数・正答率・学習時間・種類ごとの正答率・アシストなしの正答率・週の目標
  - `UserCalendar.tsx`：学習カレンダーの草（直近 1 年）
  - `UserAttemptList.tsx`（`"use client"`）：学習履歴。「さらに読み込む」は Server Action（`app/(dashboard)/users/[id]/actions.ts` の `loadMoreAttemptsAction`）で次の cursor を読む。問題名は `/passages/[id]` へのリンク
  - `UserVocabularyCard.tsx`：単語帳の枚数（学習中・覚えた・まだ出ていない）、今日やる枚数、次に出る日
- パンくずは「ユーザー > {名前}」

### 4. サイドバー

- `src/components/layout/AppSidebar.tsx` の `navItems` の末尾に `{ icon: <UserCircleIcon />, name: "ユーザー", path: "/users" }` を足す（並びは「ダッシュボード」「問題」「ソース」「ユーザー」）
- `apps/admin/CLAUDE.md` の「接続済みの画面」の表にユーザー一覧と詳細を足す

## 動作確認

```bash
pnpm --filter @repo/api-schema build
cd apps/admin && pnpm build && pnpm lint:fix
```

`apps/admin/CLAUDE.md` の「動作確認（必須）」のとおり Playwright MCP で確かめ、after のスクショ（`docs/screenshots/admin-users/`）を PR に載せる（新しい画面なので before は無し）。

- [ ] `/users` に dev の seed のユーザー（alice / bob）が出て、console のエラーが 0 件
- [ ] 「alice」・メールアドレスの一部で絞り込める。並べ替え・ページ送りで URL が変わり、再読み込みしても保たれる
- [ ] 詳細の学習のまとめ・カレンダー・単語帳の枚数が、alice で web のマイページを開いたときと同じ
- [ ] 学習履歴の「さらに読み込む」で続きが出て、最後まで読むとボタンが消える
- [ ] 存在しないユーザーの詳細は 404 の画面になる
- [ ] サイドバーの「ユーザー」が `/users` と `/users/[id]` で選択中になる
- [ ] スマホ幅（390px）で表が横にスクロールでき、詳細のカードが縦に並ぶ
