import { useEffect } from "react"
import { AppState } from "react-native"

import { useAuthStore } from "@/features/auth/auth.store"
import { ensureStudyReminderChannel } from "@/features/study-reminder/study-reminder.notification"
import { discardStudyReminderSetting, refreshStudyReminders } from "@/features/study-reminder/study-reminder.sync"

const syncStudyReminders = (): void => {
  refreshStudyReminders().catch((error: unknown) => console.warn("Failed to sync study reminders:", error))
}

/**
 * 起動時に通知チャンネルを作り、ログイン直後（起動時にログイン済みを含む）と前面に戻ったときに
 * 取得した設定で予約を作り直す。ログインが切れたら前のユーザーの設定と権限を store から消す
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
    if (!isSignedIn) {
      /**
       * ログアウトに加え、refresh の失敗による強制ログアウト（signOut を通らない）でもここで消す。
       * 予約と通知のタップの遷移待ちは残す（起動直後の loading でも呼ばれるが、まだ何も無い）
       */
      discardStudyReminderSetting()
      return
    }
    syncStudyReminders()
    let previous = AppState.currentState
    const subscription = AppState.addEventListener("change", (next) => {
      /**
       * background → active だけで同期する。iOS の許可のダイアログは active → inactive → active なので同期しないが、
       * Android は AppState に inactive が無く、許可のダイアログでも background → active になって同期が走る
       * （オンにして許可を待っている間の画面の値は、study-reminder.sync.ts が編集中として扱い、取得した値で戻さない）
       */
      if (previous === "background" && next === "active") syncStudyReminders()
      previous = next
    })
    return () => subscription.remove()
  }, [isSignedIn])
}
