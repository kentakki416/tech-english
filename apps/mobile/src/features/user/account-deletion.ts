import AsyncStorage from "@react-native-async-storage/async-storage"
import * as Notifications from "expo-notifications"

import { DELETE_ACCOUNT_CONFIRMATION_TEXT } from "@repo/api-schema"

import { clearStoredTokens, getStoredTokens } from "@/features/auth/auth.storage"
import { useAuthStore } from "@/features/auth/auth.store"

import { userApi } from "./user.api"

/**
 * 端末の後始末の各処理の名前（失敗したときのログに使う）
 */
const DEVICE_CLEANUP_LABELS = ["scheduled notifications", "stored tokens", "async storage"] as const

/**
 * アカウントを削除し、この端末に残るものを消す。
 * トークンは消すが、ログイン状態（useAuthStore）はまだ変えない。
 * 変えると Stack.Protected がすぐにログイン画面へ移り、完了の表示を出せないため。
 * api の呼び出しに失敗したら（通信エラーなど）何も消さずに throw する（そのまま再試行できる）
 */
export const deleteAccount = async (): Promise<void> => {
  const tokens = await getStoredTokens()
  await userApi.delete({
    confirmation: DELETE_ACCOUNT_CONFIRMATION_TEXT,
    /**
     * この端末の refresh token は api 側でその場で失効させる
     */
    refresh_token: tokens?.refreshToken,
  })
  await clearDeviceData()
}

/**
 * サーバー側は削除済みなので、1 つ失敗しても残りは続け、完了の表示に進む
 */
const clearDeviceData = async (): Promise<void> => {
  const results = await Promise.allSettled([
    /**
     * リマインダーの予約（study-reminder-{曜日}）。この app が予約する通知はリマインダーだけなので全件取り消す。
     * study-reminder step3 の clearStudyReminders() ができたら、こちらに置き換える
     */
    Notifications.cancelAllScheduledNotificationsAsync(),
    clearStoredTokens(),
    /**
     * 解答途中のデータ（キーは挑戦 ID）と表示設定。キーの命名に依存しないよう全消去する
     */
    AsyncStorage.clear(),
  ])
  results.forEach((result, index) => {
    if (result.status === "rejected") console.warn(`Failed to clear ${DEVICE_CLEANUP_LABELS[index]}:`, result.reason)
  })
}

/**
 * 完了の表示の「ログイン画面へ」から呼ぶ。ここで初めてログイン画面に移る（Stack.Protected が移す）
 */
export const finishAccountDeletion = (): void => {
  useAuthStore.getState().setStatus("signedOut")
}
