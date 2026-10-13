import { useFocusEffect } from "@react-navigation/native"
import { useCallback, useState } from "react"
import { Linking, StyleSheet, Switch, Text, View } from "react-native"

import type { UpdateUserReminderRequest } from "@repo/api-schema"

import { appStyles } from "@/components/ui/app-styles"
import { THEME_COLORS } from "@/const/design-theme"
import {
  isNotificationPermissionGranted,
  type NotificationPermission,
  requestNotificationPermission,
} from "@/features/study-reminder/study-reminder.notification"
import { shiftReminderTime, toggleWeekday } from "@/features/study-reminder/study-reminder.schedule"
import { useStudyReminderStore } from "@/features/study-reminder/study-reminder.store"
import { refreshStudyReminders, runWhileAwaitingPermission, saveStudyReminder } from "@/features/study-reminder/study-reminder.sync"

import { ReminderPermissionNotice } from "./ReminderPermissionNotice"
import { ReminderTimeStepper } from "./ReminderTimeStepper"
import { WeekdaySelector } from "./WeekdaySelector"

const syncStudyReminders = (): void => {
  refreshStudyReminders().catch((error: unknown) => console.warn("Failed to sync study reminders:", error))
}

/**
 * 変更はその場で保存して予約を作り直す（保存ボタンは置かない）。PUT の失敗は saveStudyReminder が知らせて元に戻す
 */
const saveSetting = (setting: UpdateUserReminderRequest): void => {
  saveStudyReminder(setting).catch((error: unknown) => console.warn("Failed to schedule study reminders:", error))
}

/**
 * 許可を求めて store に反映し、求めた後の権限を返す。失敗しても（OS の不具合など）設定の保存は続ける（null を返す）
 */
const requestPermission = async (): Promise<NotificationPermission | null> => {
  try {
    const permission = await requestNotificationPermission()
    useStudyReminderStore.getState().setPermission(permission)
    return permission
  } catch (error) {
    console.warn("Failed to request notification permission:", error)
    return null
  }
}

/**
 * 設定画面のリマインダーの区画。オン / オフ、曜日、時刻。オンなのに通知が許可されていなければ案内を出す。
 * 値はログイン直後・前面復帰の同期（useStudyReminderSync）で取得済みの store から読む。取得前はスイッチを押せない
 */
export function ReminderSection() {
  const setting = useStudyReminderStore((state) => state.setting)
  const permission = useStudyReminderStore((state) => state.permission)
  /**
   * 許可のダイアログを出している間は案内を出さない（オンに切り替えた直後に案内が一瞬出るのを防ぐ）
   */
  const [isRequestingPermission, setIsRequestingPermission] = useState(false)

  /**
   * ログイン直後の同期に失敗していたら（通信できなかったなど）、画面を開いたときに取り直す
   */
  useFocusEffect(
    useCallback(() => {
      if (useStudyReminderStore.getState().setting === null) syncStudyReminders()
    }, []),
  )

  /**
   * オンにするときは表示を先に切り替え、許可を求めてから保存する。拒否されてもオンのまま保存する（案内が出る）。
   * 許可を待つ間は編集中として扱い（前面復帰の同期で表示を戻さない）、保存する値は待った後の最新の画面の値から作る。
   * オフは許可を求めずに保存する
   */
  const changeEnabled = async (isEnabled: boolean) => {
    const current = useStudyReminderStore.getState().setting
    if (!current) return
    if (!isEnabled) {
      saveSetting({ ...current, is_enabled: false })
      return
    }
    useStudyReminderStore.getState().editSetting({ ...current, is_enabled: true })
    setIsRequestingPermission(true)
    await runWhileAwaitingPermission(requestPermission)
    setIsRequestingPermission(false)
    /**
     * 待っている間にログアウトした（画面の値が空になった）なら保存しない
     */
    const latest = useStudyReminderStore.getState().setting
    if (latest) saveSetting({ ...latest, is_enabled: true })
  }

  /**
   * 最後の 1 つは外せない（toggleWeekday が同じ配列を返す）ので保存しない
   */
  const changeWeekday = (isoWeekday: number) => {
    const current = useStudyReminderStore.getState().setting
    if (!current) return
    const weekdays = toggleWeekday(current.weekdays, isoWeekday)
    if (weekdays === current.weekdays) return
    saveSetting({ ...current, weekdays })
  }

  /**
   * 連打されても store の最新の値から計算する（保存は saveStudyReminder が最後の値にまとめる）
   */
  const shiftTime = (minutes: number) => {
    const current = useStudyReminderStore.getState().setting
    if (!current) return
    saveSetting({ ...current, time: shiftReminderTime(current.time, minutes) })
  }

  /**
   * まだ求められる端末（別の端末でオンにした場合など）ならその場で求め、許可されたら予約し直す。
   * 許可されなければ OS のこのアプリの設定画面を開く（許可して戻ると前面復帰の同期で案内が消える）。
   * Android 13 以上で実行時の権限はあるのに通知をオフにしているときは、canAskAgain が true のまま
   * 求めてもダイアログが出ずに拒否で返るため、ここで設定画面に進める
   */
  const openNotificationSettings = async () => {
    if (permission?.canAskAgain && isNotificationPermissionGranted(await requestPermission())) {
      syncStudyReminders()
      return
    }
    Linking.openSettings().catch((error: unknown) => console.warn("Failed to open settings:", error))
  }

  const isEnabled = setting?.is_enabled ?? false
  const isPermissionMissing = isEnabled && permission !== null && !isNotificationPermissionGranted(permission) && !isRequestingPermission

  return (
    <View style={appStyles.card}>
      {isPermissionMissing && <ReminderPermissionNotice onOpenSettings={() => void openNotificationSettings()} />}
      <View style={[styles.cardBody, styles.switchRow]}>
        <View style={styles.flex}>
          <Text style={styles.rowTitle}>学習のリマインダー</Text>
          <Text style={styles.hint}>決めた曜日と時刻に「今日の 1 問」を通知します。</Text>
        </View>
        <Switch
          accessibilityLabel="学習のリマインダー"
          disabled={setting === null}
          thumbColor={isEnabled ? THEME_COLORS.amberInk : THEME_COLORS.fg}
          trackColor={{ false: THEME_COLORS.heat0, true: THEME_COLORS.amber }}
          value={isEnabled}
          onValueChange={value => void changeEnabled(value)}
        />
      </View>
      {setting !== null && setting.is_enabled && (
        <>
          <View style={appStyles.divider} />
          <View style={styles.cardBody}>
            <Text style={styles.label}>曜日</Text>
            <WeekdaySelector weekdays={setting.weekdays} onToggle={changeWeekday} />
            <Text style={[styles.label, styles.labelSpaced]}>時刻</Text>
            <ReminderTimeStepper time={setting.time} onShift={shiftTime} />
            <Text style={styles.hint}>端末の時刻で通知します。今日すでに学習していても通知は届きます。</Text>
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  cardBody: {
    padding: 16,
  },
  flex: {
    flex: 1,
  },
  hint: {
    color: THEME_COLORS.fgMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  label: {
    color: THEME_COLORS.fg,
    fontSize: 14,
  },
  labelSpaced: {
    marginTop: 16,
  },
  rowTitle: {
    color: THEME_COLORS.fg,
    fontSize: 15,
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
})
