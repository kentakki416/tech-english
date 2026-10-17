/**
 * サインイン画面の `?error=` の値と、画面に出す文言。Google の callback もこのキーで送る
 */
export const SIGN_IN_ERROR_MESSAGES = {
  auth_failed: "サインインに失敗しました。もう一度お試しください",
  not_admin: "このアカウントには管理画面の権限がありません",
  oauth_denied: "Google アカウントへのアクセスが拒否されました",
  state_mismatch: "セッションが切れました。もう一度お試しください",
} as const

export type SignInError = keyof typeof SIGN_IN_ERROR_MESSAGES
