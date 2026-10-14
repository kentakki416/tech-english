/**
 * 学習リマインダーの設定（1 ユーザー 1 行）
 */
export type ReminderSetting = {
  id: number
  isEnabled: boolean
  /**
   * 通知する時刻。"HH:mm"（端末の時刻、15 分刻み）
   */
  time: string
  userId: number
  /**
   * 通知する曜日。ISO の曜日番号（1 = 月曜 〜 7 = 日曜）の昇順の配列。1 つ以上
   */
  weekdays: number[]
  createdAt: Date
  updatedAt: Date
}
