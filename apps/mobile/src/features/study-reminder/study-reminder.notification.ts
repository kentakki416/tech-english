import * as Notifications from "expo-notifications"
import { Platform } from "react-native"

import type { GetUserReminderResponse } from "@repo/api-schema"

import { buildStudyReminderRequests, isStudyReminderIdentifier, STUDY_REMINDER_CHANNEL_ID } from "./study-reminder.schedule"

export type NotificationPermission = Pick<Notifications.NotificationPermissionsStatus, "canAskAgain" | "status">

/**
 * web 表示（開発時の確認用）ではローカル通知を予約できない（expo-notifications が UnavailabilityError を投げる）。
 * web では OS の通知に触れず、設定の保存だけを行う（権限は null として扱い、案内も出さない）
 */
const IS_LOCAL_NOTIFICATION_SUPPORTED = Platform.OS !== "web"

/**
 * iOS の provisional（通知センターにだけ静かに届く）も届くので許可とみなす。この app からは provisional を求めない
 */
const convertToNotificationPermission = (result: Notifications.NotificationPermissionsStatus): NotificationPermission => ({
  canAskAgain: result.canAskAgain,
  status: result.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ? Notifications.PermissionStatus.GRANTED : result.status,
})

/**
 * 通知が届く状態か
 */
export const isNotificationPermissionGranted = (permission: NotificationPermission | null): boolean =>
  permission?.status === Notifications.PermissionStatus.GRANTED

/**
 * Android の通知チャンネル。起動時に作る（iOS では何もしない）
 */
export const ensureStudyReminderChannel = async (): Promise<void> => {
  if (Platform.OS !== "android") return
  await Notifications.setNotificationChannelAsync(STUDY_REMINDER_CHANNEL_ID, {
    importance: Notifications.AndroidImportance.DEFAULT,
    name: "学習のリマインダー",
  })
}

/**
 * 今の通知の権限（ダイアログは出さない）
 */
export const fetchNotificationPermission = async (): Promise<NotificationPermission | null> => {
  if (!IS_LOCAL_NOTIFICATION_SUPPORTED) return null
  return convertToNotificationPermission(await Notifications.getPermissionsAsync())
}

/**
 * 通知の許可を求める（まだ決めていなければ OS のダイアログが出る）
 */
export const requestNotificationPermission = async (): Promise<NotificationPermission | null> => {
  if (!IS_LOCAL_NOTIFICATION_SUPPORTED) return null
  return convertToNotificationPermission(await Notifications.requestPermissionsAsync())
}

/**
 * この端末の study-reminder-* の予約をすべて取り消す（他の通知には触れない）
 */
export const cancelScheduledStudyReminders = async (): Promise<void> => {
  if (!IS_LOCAL_NOTIFICATION_SUPPORTED) return
  const requests = await Notifications.getAllScheduledNotificationsAsync()
  await Promise.all(
    requests
      .filter(request => isStudyReminderIdentifier(request.identifier))
      .map(async request => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  )
}

/**
 * 通知センターに届いている study-reminder-* の通知をすべて消す（他の通知には触れない）。
 * 届いた通知の識別子は予約したときの識別子のまま（iOS は UNNotificationRequest、Android は通知の tag）
 */
export const dismissPresentedStudyReminders = async (): Promise<void> => {
  if (!IS_LOCAL_NOTIFICATION_SUPPORTED) return
  const notifications = await Notifications.getPresentedNotificationsAsync()
  await Promise.all(
    notifications
      .filter(notification => isStudyReminderIdentifier(notification.request.identifier))
      .map(async notification => Notifications.dismissNotificationAsync(notification.request.identifier)),
  )
}

/**
 * 全取り消し → 作り直し（冪等）。オフ、または通知が許可されていなければ作らない
 * （許可されたら、前面に戻したときの同期で作られる）
 */
export const rescheduleStudyReminders = async (setting: GetUserReminderResponse, permission: NotificationPermission | null): Promise<void> => {
  await cancelScheduledStudyReminders()
  if (!setting.is_enabled || !isNotificationPermissionGranted(permission)) return
  for (const request of buildStudyReminderRequests(setting)) {
    await Notifications.scheduleNotificationAsync(request)
  }
}
