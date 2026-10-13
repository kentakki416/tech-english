"use server"

import { redirect } from "next/navigation"

import { DELETE_ACCOUNT_CONFIRMATION_TEXT } from "@repo/api-schema"

import { userApi } from "@/features/user/user.api"
import { clearAuthCookies, getRefreshToken } from "@/libs/auth"

/**
 * useActionState に返す削除のフォームの状態
 */
export type DeleteAccountState = { isFailed: boolean }

/**
 * アカウントの削除。成功したらこの端末の cookie を消し、ログアウト状態で開ける完了画面へ移る。
 *
 * 完了を同じページ（useActionState の戻り値）で出さずに別のパスへ redirect するのは、cookie を変えた Server Action の後は
 * 現在のページ（ユーザーを取得する共通ヘッダーを含む）がサーバーで描画し直され、削除済みのユーザーで失敗するため
 */
export const deleteAccountAction = async (
  _prevState: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> => {
  const confirmation = formData.get("confirmation")
  if (typeof confirmation !== "string" || confirmation.trim() !== DELETE_ACCOUNT_CONFIRMATION_TEXT) {
    return { isFailed: true }
  }

  try {
    /**
     * この端末の refresh token も渡し、api 側でその場で失効させる
     */
    const refreshToken = await getRefreshToken()
    await userApi.delete({ confirmation: DELETE_ACCOUNT_CONFIRMATION_TEXT, refresh_token: refreshToken ?? undefined })
  } catch {
    return { isFailed: true }
  }

  await clearAuthCookies()
  /**
   * redirect は例外で遷移するので try の外に置く
   */
  redirect("/settings/delete-account/done")
}
