import { Alert } from "react-native"

import type { UpdateUserReminderRequest } from "@repo/api-schema"

import { studyReminderApi } from "./study-reminder.api"
import {
  cancelScheduledStudyReminders,
  dismissPresentedStudyReminders,
  fetchNotificationPermission,
  isNotificationPermissionGranted,
  type NotificationPermission,
  rescheduleStudyReminders,
} from "./study-reminder.notification"
import { useStudyReminderStore } from "./study-reminder.store"

/**
 * 取得・保存を 1 つずつ実行する直列キュー。
 * 同期と保存が並行すると「取り消し → 予約」が交互に走り、古い設定の予約が残るため
 */
let queue: Promise<void> = Promise.resolve()

/**
 * まだ PUT していない最新の変更。連打されたら最後の値だけを送る
 */
let pendingSave: UpdateUserReminderRequest | null = null

/**
 * オンにして通知の許可を待っている間。編集中として扱い、取得・保存の結果で画面の値を戻さない
 * （Android は許可のダイアログで AppState が background → active になり、待っている間に前面復帰の同期が走る）
 */
let isAwaitingPermission = false

/**
 * ログアウト・ログイン切れのたびに進める世代。キューの処理は積んだときの世代を持ち、世代が変わっていたら
 * （await から戻ったときを含む）結果を反映せず予約もしない。取り消しをキューの前の処理を待たずに行うため
 */
let generation = 0

const runSerially = async (task: () => Promise<void>): Promise<void> => {
  const result = queue.then(task)
  queue = result.catch(() => undefined)
  return result
}

/**
 * 今の世代のうちだけ true を返す関数を作る（キューに積むときに呼ぶ）
 */
const captureGeneration = (): (() => boolean) => {
  const captured = generation
  return () => captured === generation
}

/**
 * まだ送っていない変更があるか（あれば取得・保存の結果で画面の値を変えない）
 */
const isEditing = (): boolean => pendingSave !== null || isAwaitingPermission

/**
 * 取得に失敗したときの予約。通知が許可されていれば、最後に API と一致した値（savedSetting）で作り直す。
 * 拒否中（予約 0 件）に OS の設定で許可し、オフライン（または取得の timeout）で前面に戻したとき、
 * 案内は消えたのに予約が 0 件のままにならないようにするため（許可済みで予約がある場合も同じ値で作り直すだけ）。
 * 許可されていない、または savedSetting が無い（このログインでまだ取得も保存もできていない）なら予約に触れない
 */
const rescheduleWithSavedSetting = async (permission: NotificationPermission | null): Promise<void> => {
  const { savedSetting } = useStudyReminderStore.getState()
  if (!savedSetting || !isNotificationPermissionGranted(permission)) return
  await rescheduleStudyReminders(savedSetting, permission)
}

/**
 * ログイン直後・前面復帰。権限は取得より先に読んで反映する（オフラインで取得に失敗しても、OS の設定で許可したら案内を消す）。
 * 取得に失敗したら（オフライン・timeout）、savedSetting で予約を作り直してから取得のエラーを投げる（rescheduleWithSavedSetting）
 */
export const refreshStudyReminders = async (): Promise<void> => {
  const isCurrent = captureGeneration()
  return runSerially(async () => {
    if (!isCurrent()) return
    const permission = await fetchNotificationPermission()
    if (!isCurrent()) return
    useStudyReminderStore.getState().setPermission(permission)
    const setting = await studyReminderApi.get().catch(async (error: unknown) => {
      if (isCurrent()) await rescheduleWithSavedSetting(permission)
      throw error
    })
    if (!isCurrent()) return
    useStudyReminderStore.getState().applyFetchedSetting(setting, permission, isEditing())
    await rescheduleStudyReminders(setting, permission)
  })
}

/**
 * 設定画面の変更。画面の値を先に変え、キューの順番が来たら最後の値だけを PUT する（キューに積まれた古い保存は何もしない）
 */
export const saveStudyReminder = async (setting: UpdateUserReminderRequest): Promise<void> => {
  useStudyReminderStore.getState().editSetting(setting)
  pendingSave = setting
  const isCurrent = captureGeneration()
  return runSerially(async () => {
    const target = pendingSave
    if (!isCurrent() || !target) return
    pendingSave = null
    const saved = await studyReminderApi.put(target).catch((error: unknown) => {
      console.warn("Failed to save study reminder:", error)
      return null
    })
    /**
     * 送っている間にログアウトした・ログインが切れたなら、結果も「保存できませんでした」も出さない
     */
    if (!isCurrent()) return
    /**
     * 送っている間に次の変更が来ていれば、画面の値はそのまま（古い値に戻すと連打の途中で表示が巻き戻り、
     * 次の「＋」がその値から計算される）。失敗の扱いも次の保存の結果に任せる
     */
    const isEditingNext = isEditing()
    if (!saved) {
      if (isEditingNext) return
      useStudyReminderStore.getState().revertSetting()
      Alert.alert("保存できませんでした", "通信できる状態で、もう一度お試しください。")
      return
    }
    useStudyReminderStore.getState().applySavedSetting(saved, isEditingNext)
    const permission = await fetchNotificationPermission()
    if (!isCurrent()) return
    await rescheduleStudyReminders(saved, permission)
  })
}

/**
 * オンにして通知の許可を求めている間（task の実行中）を編集中として扱う
 */
export const runWhileAwaitingPermission = async <T>(task: () => Promise<T>): Promise<T> => {
  isAwaitingPermission = true
  try {
    return await task()
  } finally {
    isAwaitingPermission = false
  }
}

/**
 * ログアウト・アカウント削除。この端末の予約と、通知センターに届き済みのリマインダーをすべて消して store を空にする
 * （別のユーザーがこの端末でログインしたとき、前のユーザーのリマインダーを残さない）。
 * キューの前の処理は待たない（応答の無い通信の後ろで待つと、ログアウト・アカウント削除が終わらない）。
 * 前の処理は世代が変わるので結果を反映しないが、予約し直している途中だった処理が後から足した予約も消えるよう、
 * キューの最後でももう一度取り消す（こちらは待たない）
 */
export const clearStudyReminders = async (): Promise<void> => {
  generation += 1
  pendingSave = null
  /**
   * 取り消しに失敗しても前のユーザーの設定を画面に残さない
   */
  useStudyReminderStore.getState().reset()
  runSerially(cancelScheduledStudyReminders).catch((error: unknown) => console.warn("Failed to cancel study reminders:", error))
  await Promise.all([cancelScheduledStudyReminders(), dismissPresentedStudyReminders()])
}

/**
 * ログインの成功時（ログイン中にして同期が始まる前）。この端末の予約をすべて取り消す。
 * 強制ログアウトでは予約を残すので、そのあと別のユーザーがログインして最初の取得に失敗すると、前のユーザーの予約が残るため。
 * 同じユーザーでも次の同期（取得の成功）で作り直される。clearStudyReminders と同じく、キューの前の処理は待たずに取り消し、
 * キューの最後でももう一度取り消す（ログイン後の同期はその後ろに積まれる）。
 * store はログインしていない間に discardStudyReminderSetting で空にしてあるので触れない
 */
export const cancelStudyRemindersOnSignIn = async (): Promise<void> => {
  runSerially(cancelScheduledStudyReminders).catch((error: unknown) => console.warn("Failed to cancel study reminders:", error))
  await cancelScheduledStudyReminders()
}

/**
 * ログインが切れたとき（refresh の失敗による強制ログアウトを含む）。前のユーザーの設定と権限を画面に残さず、
 * キューに残った前のユーザーの処理の結果も反映しない（次のユーザーの取得に失敗したときに前のユーザーの値が出たり、
 * その値で PUT したりしないため）。予約は取り消さない（ログインが切れても通知は届き、タップでログイン画面に進む仕様）。
 * 通知のタップの遷移待ち（pendingHref）は残す（ログイン後に開始確認を開くため）
 */
export const discardStudyReminderSetting = (): void => {
  generation += 1
  pendingSave = null
  useStudyReminderStore.getState().clearSetting()
}
