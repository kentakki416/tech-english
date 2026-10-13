import { Alert } from "react-native"

import type { UpdateUserReminderRequest } from "@repo/api-schema"

import { studyReminderApi } from "./study-reminder.api"
import { cancelScheduledStudyReminders, fetchNotificationPermission, rescheduleStudyReminders } from "./study-reminder.notification"
import { useStudyReminderStore } from "./study-reminder.store"

/**
 * 取得・保存・取り消しを 1 つずつ実行する直列キュー。
 * 同期と保存が並行すると「取り消し → 予約」が交互に走り、古い設定の予約が残るため
 */
let queue: Promise<void> = Promise.resolve()

/**
 * まだ PUT していない最新の変更。連打されたら最後の値だけを送る
 */
let pendingSave: UpdateUserReminderRequest | null = null

const runSerially = async (task: () => Promise<void>): Promise<void> => {
  const result = queue.then(task)
  queue = result.catch(() => undefined)
  return result
}

/**
 * ログイン直後・前面復帰。取得に失敗したら予約に触れない（オフラインでも前の予約で通知を出す）
 */
export const refreshStudyReminders = async (): Promise<void> =>
  runSerially(async () => {
    const setting = await studyReminderApi.get()
    const permission = await fetchNotificationPermission()
    useStudyReminderStore.getState().applyFetchedSetting(setting, permission, pendingSave !== null)
    await rescheduleStudyReminders(setting, permission)
  })

/**
 * 設定画面の変更。画面の値を先に変え、キューの順番が来たら最後の値だけを PUT する（キューに積まれた古い保存は何もしない）
 */
export const saveStudyReminder = async (setting: UpdateUserReminderRequest): Promise<void> => {
  useStudyReminderStore.getState().editSetting(setting)
  pendingSave = setting
  return runSerially(async () => {
    const target = pendingSave
    if (!target) return
    pendingSave = null
    const saved = await studyReminderApi.put(target).catch((error: unknown) => {
      console.warn("Failed to save study reminder:", error)
      return null
    })
    /**
     * 送っている間に次の変更が来ていれば、画面の値はそのまま（古い値に戻すと連打の途中で表示が巻き戻り、
     * 次の「＋」がその値から計算される）。失敗の扱いも次の保存の結果に任せる
     */
    const isEditing = pendingSave !== null
    if (!saved) {
      if (isEditing) return
      useStudyReminderStore.getState().revertSetting()
      Alert.alert("保存できませんでした", "通信できる状態で、もう一度お試しください。")
      return
    }
    useStudyReminderStore.getState().applySavedSetting(saved, isEditing)
    await rescheduleStudyReminders(saved, await fetchNotificationPermission())
  })
}

/**
 * ログアウト・アカウント削除。この端末の予約をすべて取り消して store を空にする
 * （取り消しに失敗しても前のユーザーの設定を画面に残さない）
 */
export const clearStudyReminders = async (): Promise<void> =>
  runSerially(async () => {
    pendingSave = null
    try {
      await cancelScheduledStudyReminders()
    } finally {
      useStudyReminderStore.getState().reset()
    }
  })
