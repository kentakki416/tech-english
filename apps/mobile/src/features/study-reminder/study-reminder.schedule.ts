import * as Notifications from "expo-notifications"

import type { GetUserReminderResponse } from "@repo/api-schema"

export const STUDY_REMINDER_CHANNEL_ID = "study-reminder"
export const STUDY_REMINDER_URL = "techenglish://passages/random"
const STUDY_REMINDER_HREF = "/passages/random"
const STUDY_REMINDER_ID_PREFIX = "study-reminder-"
const MINUTES_PER_DAY = 24 * 60

/**
 * 通知をタップしたときの遷移先（ランダムに 1 問の開始確認）
 */
export type StudyReminderHref = typeof STUDY_REMINDER_HREF

/**
 * README「通知の内容」の 3 種
 */
const STUDY_REMINDER_MESSAGES = [
  { body: "5 分で読める技術英語を 1 問解きませんか？", title: "今日の 1 問" },
  { body: "公式ドキュメントの英文で、今日も少しだけ。", title: "英語のドキュメント、読んでますか？" },
  { body: "1 問解くと、学習カレンダーの今日のマスが灯ります。", title: "今日のマスを灯そう" },
] as const

/**
 * ISO（1 = 月 〜 7 = 日）→ expo の週次トリガー（1 = 日 〜 7 = 土）。変換はここだけで行う
 */
export const convertIsoWeekdayToExpoWeekday = (isoWeekday: number): number => (isoWeekday % 7) + 1

/**
 * 識別子は ISO の曜日番号で作る（study-reminder-1 = 月曜）
 */
export const buildStudyReminderIdentifier = (isoWeekday: number): string => `${STUDY_REMINDER_ID_PREFIX}${isoWeekday}`

/**
 * この機能が予約した通知か（他の通知の予約には触れないため）
 */
export const isStudyReminderIdentifier = (identifier: string): boolean => identifier.startsWith(STUDY_REMINDER_ID_PREFIX)

/**
 * "HH:mm" を minutes 分ずらす（0:00 をまたいで循環する）
 */
export const shiftReminderTime = (time: string, minutes: number): string => {
  const [hour, minute] = time.split(":").map(Number)
  const total = (((hour * 60 + minute + minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

/**
 * 曜日の付け外し。選択中なら外し、未選択なら足して昇順にする。
 * 最後の 1 つは外さない（その場合は受け取った配列をそのまま返す）
 */
export const toggleWeekday = (weekdays: number[], isoWeekday: number): number[] => {
  if (!weekdays.includes(isoWeekday)) return [...weekdays, isoWeekday].sort((a, b) => a - b)
  if (weekdays.length <= 1) return weekdays
  return weekdays.filter(weekday => weekday !== isoWeekday)
}

/**
 * 通知の data.url から遷移先を決める。知らない URL では遷移しない
 */
export const convertNotificationUrlToHref = (url: unknown): StudyReminderHref | null =>
  url === STUDY_REMINDER_URL ? STUDY_REMINDER_HREF : null

/**
 * 選んだ曜日ごとに毎週の通知を 1 つずつ組み立てる。
 * 文言は昇順に並べた曜日の中での順番で割り当てる（設定が同じなら毎週同じ曜日に同じ文言になり、
 * 月・木のような選び方でも同じ文言が続かない）
 */
export const buildStudyReminderRequests = (setting: GetUserReminderResponse): Notifications.NotificationRequestInput[] => {
  const [hour, minute] = setting.time.split(":").map(Number)
  return [...setting.weekdays]
    .sort((a, b) => a - b)
    .map((isoWeekday, index) => {
      const message = STUDY_REMINDER_MESSAGES[index % STUDY_REMINDER_MESSAGES.length]
      return {
        content: {
          body: message.body,
          data: { url: STUDY_REMINDER_URL },
          title: message.title,
        },
        identifier: buildStudyReminderIdentifier(isoWeekday),
        trigger: {
          channelId: STUDY_REMINDER_CHANNEL_ID,
          hour,
          minute,
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: convertIsoWeekdayToExpoWeekday(isoWeekday),
        },
      }
    })
}
