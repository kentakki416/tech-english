import type { ReminderSetting } from "@repo/domain"

/**
 * リマインダーの設定の保存（upsert）の入力。すべての項目を上書きする。
 * time は "HH:mm"、weekdays は ISO の曜日番号（1〜7）の配列（値域・並び順は呼び出し側で整える）
 */
export type UpsertReminderSettingInput = Pick<ReminderSetting, "isEnabled" | "time" | "weekdays">

/**
 * リマインダーの設定（reminder_settings。1 ユーザー 1 行）のリポジトリ
 */
export interface ReminderSettingRepository {
  /**
   * 未保存なら null
   */
  findByUserId(userId: number): Promise<ReminderSetting | null>
  /**
   * user_id の行があれば全項目を上書き、無ければ作る。存在しない userId は外部キー違反で throw する
   */
  upsertByUserId(userId: number, data: UpsertReminderSettingInput): Promise<ReminderSetting>
}
