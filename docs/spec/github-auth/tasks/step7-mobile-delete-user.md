# step7-mobile-delete-user

mobile にアカウント削除の確認画面（スタックの `settings/delete-account`）を作り、削除が成功したら端末の後始末（通知の予約・トークン・端末に保存したデータの削除）をして完了を表示する。App Store の要件どおり web に誘導せず app 内で完結させる。

## 前提

- [step5-api-delete-user](./step5-api-delete-user.md)（`DELETE /api/user`、`DELETE_ACCOUNT_CONFIRMATION_TEXT`）
- [step4-mobile-github-login](./step4-mobile-github-login.md)（`apiClient`、`auth.storage.ts`、`useAuthStore`、`THEME_COLORS` / `appStyles`、ルートレイアウトの `Stack.Protected`）
- [learning-record step5](../../learning-record/tasks/step5-mobile-mypage.md)（設定タブと、その最下部の「危険な操作」区画）
- 仕様: [アカウント削除の処理](../README.md#アカウント削除の処理) の「クライアントの後始末」、[study-reminder の通知の予約と同期](../../study-reminder/README.md#通知の予約と同期)
- デザイン: [mobile の画面](../README.md#mobile-の画面) の「アカウント削除の確認」。見た目の正本は `apps/mobile/src/app/mock/delete-account.tsx`（モックは消さない）

## 対応内容

### 1. API 呼び出し（`apps/mobile/src/features/user/user.api.ts`）

step4 で作った `userApi` に足す。

```typescript
/** DELETE /api/user。成功は 204 */
delete: async (body: DeleteUserRequest): Promise<void> => {
  await apiClient.delete("/api/user", { data: body })
},
```

### 2. 削除と端末の後始末（`apps/mobile/src/features/user/account-deletion.ts`）

```typescript
/**
 * アカウントを削除し、この端末に残るものを消す。
 * トークンは消すが、ログイン状態（useAuthStore）はまだ変えない。
 * 変えると Stack.Protected がすぐにログイン画面へ移り、完了の表示を出せないため
 */
export const deleteAccount = async (): Promise<void> => {
  const tokens = await getStoredTokens()
  await userApi.delete({
    confirmation: DELETE_ACCOUNT_CONFIRMATION_TEXT,
    /** この端末の refresh token は api 側でその場で失効させる */
    refresh_token: tokens?.refreshToken,
  })
  await clearDeviceData()
}

/**
 * サーバー側は削除済みなので、1 つ失敗しても残りは続け、完了の表示に進む
 */
const clearDeviceData = async (): Promise<void> => {
  await Promise.allSettled([
    /** リマインダーの予約（study-reminder-{曜日}）。この app が予約する通知はリマインダーだけなので全件取り消す */
    Notifications.cancelAllScheduledNotificationsAsync(),
    clearStoredTokens(),
    /** 解答途中のデータ（キーは挑戦 ID）と表示設定。キーの命名に依存しないよう全消去する */
    AsyncStorage.clear(),
  ])
}

/**
 * 完了画面の「ログイン画面へ」から呼ぶ。ここで初めてログイン画面に移る
 */
export const finishAccountDeletion = (): void => {
  useAuthStore.getState().setStatus("signedOut")
}
```

- [study-reminder step3](../../study-reminder/tasks/step3-mobile-reminder.md) の `clearStudyReminders()`（予約の取り消し＋リマインダーの store を空にする）が実装済みなら、`cancelAllScheduledNotificationsAsync()` の代わりにそれを呼ぶ。未実装でも動くよう、直接の取り消しで実装順に左右されないようにしている
- `AsyncStorage.clear()` は文字サイズなどの表示設定も消す（アカウントを消した端末に前のユーザーの痕跡を残さない）

### 3. 確認画面（`apps/mobile/src/app/settings/delete-account.tsx`）

`src/app/mock/delete-account.tsx` を移植する。モックからの差分:

- import を `THEME_COLORS` / `THEME_FONTS` / `appStyles` に替え、`MockStatePanel` と `useLocalSearchParams` の `state` の切り替えを除く
- `CONFIRMATION_TEXT` を `@repo/api-schema` の `DELETE_ACCOUNT_CONFIRMATION_TEXT` に替える。`DELETED_ITEMS` はモックのまま（mobile は「この端末に予約された通知」）
- 「アカウントを削除する」の `onPress`:

```tsx
const [isSubmitting, setIsSubmitting] = useState(false)
const [isFailed, setIsFailed] = useState(false)

const handleDelete = async () => {
  setIsSubmitting(true)
  setIsFailed(false)
  try {
    await deleteAccount()
    setIsDone(true)
  } catch {
    setIsFailed(true)
  } finally {
    setIsSubmitting(false)
  }
}
```

- ボタンは `disabled={!isMatched || isSubmitting}`。無効時の見た目はモックの `deleteButtonDisabled` のまま。実行中はボタンの文字の代わりに `ActivityIndicator`（`THEME_COLORS.fgFaint`）
- `isFailed` のとき、入力欄の下に「削除できませんでした。通信状況を確認して、もう一度お試しください。」を `THEME_COLORS.wrong`・13px で出す（トークンもデータも消していないので、そのまま再試行できる）
- 完了の表示（上部バーを消す）はモックのまま。「ログイン画面へ」の `onPress` を `finishAccountDeletion()` に替える（`router.replace` は書かない。`Stack.Protected` が移す）
- 「‹ 設定」と「キャンセル」は `router.back()` のまま。完了の表示中は Android の戻るボタンでも戻らせない（`useFocusEffect` + `BackHandler` で `true` を返す）
- 「ログイン画面へ」は reading-practice step8 が `src/components/ui/` に移した `SecondaryButton` を使う

### 4. ルートに登録する（`apps/mobile/src/app/_layout.tsx`）

`Stack.Protected guard={status === "signedIn"}` の中に `<Stack.Screen name="settings/delete-account" options={{ headerShown: false }} />` を足す（上部バーは画面が自前で持つ）。

### 5. 設定画面からの導線

learning-record step5 の設定タブの「危険な操作」区画の「アカウントを削除」が `router.push("/settings/delete-account")` になっていることを確かめる（モックでは `/mock/delete-account`）。

## 動作確認

```bash
cd packages/schema && pnpm build
pnpm --filter mobile exec expo run:ios   # Android は expo run:android
pnpm --filter mobile lint
pnpm --filter mobile exec tsc --noEmit
```

development build で、使い捨てのユーザー（GitHub でログインし直したユーザー）を使って確認する。

- [ ] 設定タブの「アカウントを削除」から開き、上部に「‹ 設定」。モックの「確認」と見た目が一致する
- [ ] 入力が `delete my account` と一致するまでボタンが無効（自動の大文字化・自動修正が効かない）
- [ ] 「キャンセル」「‹ 設定」で設定タブに戻る
- [ ] 削除すると上部バーが消えて完了の表示になる。Android の戻るボタンで確認画面に戻らない
- [ ] 「ログイン画面へ」でログイン画面に移る。app を終了して起動し直してもログイン画面
- [ ] DB からユーザーと関連データが消え、Redis からこの端末の refresh token の jti が消えている
- [ ] リマインダーを予約していた場合、`Notifications.getAllScheduledNotificationsAsync()` が空になる（study-reminder step3 の実装後）
- [ ] 解答途中で中断した挑戦がある状態で削除すると、AsyncStorage が空になる（reading-practice step9 の実装後）
- [ ] 機内モードで削除 → エラーの文言が出て確認画面のまま。通信を戻して再試行すると削除できる
- [ ] 完了の表示のまま app を終了して起動し直すと、ログイン画面が開く（トークンは消えている）
- [ ] 同じユーザーで web にもログインしていた場合、web は access token の期限切れ後にログイン画面へ戻る
