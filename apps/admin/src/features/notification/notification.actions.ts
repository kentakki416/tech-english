"use server"

import "server-only"

import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"

import { notificationApi } from "./notification.api"

/**
 * 通知をすべて既読にする。ヘッダーは全画面にあるので feature の actions に置く。
 * 失敗しても画面はエラーにしない（未読のまま残るだけ）
 */
export const markAllAsReadAction = async () => {
  try {
    await notificationApi.markAllAsRead()
  } catch (error) {
    unstable_rethrow(error)
    console.error("通知を既読にできませんでした", error)
    return
  }
  revalidatePath("/", "layout")
}
