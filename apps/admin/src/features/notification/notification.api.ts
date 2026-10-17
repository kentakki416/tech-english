import "server-only"

import type { AdminNotification } from "./notification.entity"

/**
 * 通知の API 通信層
 *
 * tech-english には今は通知の元が無いため、常に空を返す。
 * 通知を作るときは、ここを API の呼び出しに差し替える（画面側は変えなくてよい）
 */
export const notificationApi = {
  getList: async (): Promise<AdminNotification[]> => [],

  markAllAsRead: async (): Promise<void> => {},
}
