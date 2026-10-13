import { create } from "zustand"

import type { GetUserReminderResponse } from "@repo/api-schema"

import type { NotificationPermission } from "./study-reminder.notification"
import type { StudyReminderHref } from "./study-reminder.schedule"

type StudyReminderState = {
  /**
   * 取得した設定と権限を反映する。isEditing（まだ送っていない変更がある）なら画面の値は変えない
   */
  applyFetchedSetting: (setting: GetUserReminderResponse, permission: NotificationPermission | null, isEditing: boolean) => void
  /**
   * 保存できた設定を反映する。isEditing（まだ送っていない変更がある）なら画面の値は変えない
   */
  applySavedSetting: (setting: GetUserReminderResponse, isEditing: boolean) => void
  /**
   * ログインが切れたとき（強制ログアウトを含む）に設定と権限を空にする。通知のタップの遷移待ち（pendingHref）は残す
   */
  clearSetting: () => void
  /**
   * 画面の値を先に変える（保存の完了を待たない）
   */
  editSetting: (setting: GetUserReminderResponse) => void
  /**
   * 通知のタップ後、ログインを待っている遷移先
   */
  pendingHref: StudyReminderHref | null
  permission: NotificationPermission | null
  /**
   * ログアウト・アカウント削除で空にする
   */
  reset: () => void
  /**
   * 保存に失敗したとき、画面の値を最後に API と一致した値へ戻す
   */
  revertSetting: () => void
  /**
   * 最後に API と一致した値
   */
  savedSetting: GetUserReminderResponse | null
  setPendingHref: (href: StudyReminderHref | null) => void
  setPermission: (permission: NotificationPermission | null) => void
  /**
   * 画面に出す値。取得前は null
   */
  setting: GetUserReminderResponse | null
}

const INITIAL_STATE = {
  pendingHref: null,
  permission: null,
  savedSetting: null,
  setting: null,
} satisfies Partial<StudyReminderState>

/**
 * リマインダーの設定・権限・通知タップ後の遷移待ち。
 * API の値の反映は study-reminder.sync.ts の直列キューから行う
 */
export const useStudyReminderStore = create<StudyReminderState>((set) => ({
  ...INITIAL_STATE,
  applyFetchedSetting: (setting, permission, isEditing) => set((state) => ({
    permission,
    savedSetting: setting,
    setting: isEditing ? state.setting : setting,
  })),
  applySavedSetting: (setting, isEditing) => set((state) => ({
    savedSetting: setting,
    setting: isEditing ? state.setting : setting,
  })),
  clearSetting: () => set({ permission: null, savedSetting: null, setting: null }),
  editSetting: (setting) => set({ setting }),
  reset: () => set(INITIAL_STATE),
  revertSetting: () => set((state) => ({ setting: state.savedSetting })),
  setPendingHref: (pendingHref) => set({ pendingHref }),
  setPermission: (permission) => set({ permission }),
}))
