import * as Notifications from "expo-notifications"
import { router } from "expo-router"
import { useEffect, useRef } from "react"
import { Platform } from "react-native"

import { useAuthStore } from "@/features/auth/auth.store"
import { convertNotificationUrlToHref } from "@/features/study-reminder/study-reminder.schedule"
import { useStudyReminderStore } from "@/features/study-reminder/study-reminder.store"

/**
 * リマインダーの通知をタップしたら、ランダムに 1 問の開始確認を開く。
 * 遷移先は store の pendingHref に入れ、ログイン済みになった時点で遷移する
 * （ログインが切れていれば Stack.Protected がログイン画面を出し、ログイン後にここで遷移する）。
 * ナビゲーションの準備ができてから遷移するよう、ルートレイアウトの Stack より後に置いた部品で呼ぶ
 */
export function useNotificationRedirect() {
  /**
   * secure-store の読み込み中（loading）は遷移しない（確認が終わってから判断する）
   */
  const isSignedIn = useAuthStore((state) => state.status === "signedIn")
  const pendingHref = useStudyReminderStore((state) => state.pendingHref)
  const setPendingHref = useStudyReminderStore((state) => state.setPendingHref)
  const handledKeys = useRef(new Set<string>())

  useEffect(() => {
    /**
     * web 表示（開発時の確認用）には通知のタップが無い（getLastNotificationResponse は UnavailabilityError を投げる）
     */
    if (Platform.OS === "web") return
    const handleResponse = (response: Notifications.NotificationResponse) => {
      /**
       * 終了状態からの起動では、初回の取得とリスナーの両方に同じタップが来ることがあるので 1 回だけ扱う
       */
      const key = `${response.notification.request.identifier}:${response.notification.date}`
      if (handledKeys.current.has(key)) return
      handledKeys.current.add(key)
      /**
       * 扱ったタップを消す（ルートレイアウトが作り直されたときに getLastNotificationResponse で拾い直さないため）
       */
      Notifications.clearLastNotificationResponse()
      const href = convertNotificationUrlToHref(response.notification.request.content.data?.url)
      if (href) setPendingHref(href)
    }
    /**
     * app が終了していた場合（getLastNotificationResponseAsync は 0.32 で deprecated）
     */
    const lastResponse = Notifications.getLastNotificationResponse()
    if (lastResponse) handleResponse(lastResponse)
    /**
     * 起動中（前面・背景）の場合
     */
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse)
    return () => subscription.remove()
  }, [setPendingHref])

  useEffect(() => {
    if (!isSignedIn || !pendingHref) return
    setPendingHref(null)
    router.push(pendingHref)
  }, [isSignedIn, pendingHref, setPendingHref])
}
