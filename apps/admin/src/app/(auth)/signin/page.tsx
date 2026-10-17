import { Metadata } from "next"
import { redirect } from "next/navigation"

import GoogleSignInButton from "@/components/features/auth/GoogleSignInButton"
import Alert from "@/components/ui/alert/Alert"
import { SIGN_IN_ERROR_MESSAGES, SignInError } from "@/features/auth/sign-in-errors"
import { getAccessToken } from "@/libs/auth"
import { isAccessTokenExpiringSoon } from "@/libs/auth-cookies"
import { resolveSafeRedirectPath } from "@/libs/safe-redirect"

import { startGoogleOAuth } from "./actions"

export const metadata: Metadata = {
  title: "サインイン",
}

const isProduction = process.env.NODE_ENV === "production"

type Props = {
  searchParams: Promise<{ error?: string; redirect?: string }>
}

export default async function SignIn({ searchParams }: Props) {
  const { error, redirect: redirectParam } = await searchParams
  const redirectPath = resolveSafeRedirectPath(redirectParam)

  /**
   * 有効な access の cookie があれば元の画面に戻す。proxy の更新が、同時に来た別のリクエストに
   * 先を越されて 401 になった場合（新しい cookie は先のリクエストで届いている）の受け口
   */
  const accessToken = await getAccessToken()
  if (accessToken && !isAccessTokenExpiringSoon(accessToken)) {
    redirect(redirectPath)
  }

  /**
   * Object.hasOwn で引く（`?error=__proto__` で Object.prototype を取り出して描画で落ちないように）
   */
  const errorMessage = error
    ? Object.hasOwn(SIGN_IN_ERROR_MESSAGES, error)
      ? SIGN_IN_ERROR_MESSAGES[error as SignInError]
      : SIGN_IN_ERROR_MESSAGES.auth_failed
    : null

  return (
    <div className="flex w-full flex-1 flex-col lg:w-1/2">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-5 sm:mb-8">
          <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">
            サインイン
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            管理画面に登録された Google アカウントでサインインしてください
          </p>
        </div>

        {errorMessage && (
          <div className="mb-5">
            <Alert message={errorMessage} title="サインインできませんでした" variant="error" />
          </div>
        )}

        <form action={startGoogleOAuth}>
          <input name="redirect" type="hidden" value={redirectPath} />
          <GoogleSignInButton />
        </form>

        {!isProduction && (
          <>
            <div className="relative py-3 sm:py-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-800" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white p-2 text-gray-400 dark:bg-gray-900 sm:px-5 sm:py-2">
                  開発環境のみ
                </span>
              </div>
            </div>
            {/**
             * Route Handler（cookie を書いて / に送る）なので、先読みされる Link ではなく a にする
             */}
            <a
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium text-gray-700 ring-1 ring-gray-300 transition ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/3 dark:hover:text-gray-300"
              href="/api/dev/login"
            >
              dev admin でログイン
            </a>
          </>
        )}
      </div>
    </div>
  )
}
