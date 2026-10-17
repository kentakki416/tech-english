/**
 * ヘッダーに出す通知。中身（何を通知するか）はプロジェクトごとに決める
 */
export type AdminNotification = {
  id: string
  /** 通知を出した人などのアイコン。無ければベルのアイコンを出す */
  avatarUrl?: string
  body: string
  /** クリックしたときの遷移先。無ければ遷移しない */
  href?: string
  isRead: boolean
  createdAt: string
}
