/**
 * アプリの名前と表示の設定
 *
 * - name: サイドバー・スマホ幅のヘッダー・サインイン画面のロゴの文字、タブのタイトル（`<ページ名> | <name>`）
 * - description: サインイン画面の説明文、ページの description
 * - lang / locale: `<html lang>` と、日時の表示の書式
 * - timeZone: 日時の表示だけに使う。ダッシュボードの集計の日の区切りは api 側の `@repo/domain` の ADMIN_STATS_TIME_ZONE で、変えるときは両方を変える
 *
 * client component からも import する（秘密の値は置かない。env は src/env.ts）
 */
export const appConfig = {
  description: "tech-english の管理画面",
  lang: "ja",
  locale: "ja-JP",
  name: "tech-english admin",
  timeZone: "Asia/Tokyo",
} as const
