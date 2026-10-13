import { useEffect } from "react"
import { AppState } from "react-native"

import { useAuthStore } from "@/features/auth/auth.store"
import { ensureStudyReminderChannel } from "@/features/study-reminder/study-reminder.notification"
import { refreshStudyReminders } from "@/features/study-reminder/study-reminder.sync"

const syncStudyReminders = (): void => {
  refreshStudyReminders().catch((error: unknown) => console.warn("Failed to sync study reminders:", error))
}

/**
 * 起動時に通知チャンネルを作り、ログイン直後（起動時にログイン済みを含む）と前面に戻ったときに
 * GET /api/user/reminder の設定で予約を作り直す
 */
export function useStudyReminderSync() {
  /**
   * secure-store の読み込み中（loading）は同期しない
   */
  const isSignedIn = useAuthStore((state) => state.status === "signedIn")

  useEffect(() => {
    ensureStudyReminderChannel().catch((error: unknown) => console.warn("Failed to create notification channel:", error))
  }, [])

  useEffect(() => {
    if (!isSignedIn) return
    syncStudyReminders()
    let previous = AppState.currentState
    const subscription = AppState.addEventListener("change", (next) => {
      /**
       * inactive → active（iOS の許可ダイアログを閉じたとき）では同期しない。保存中の PUT と競合させないため
       */
      if (previous === "background" && next === "active") syncStudyReminders()
      previous = next
    })
    return () => subscription.remove()
  }, [isSignedIn])
}
