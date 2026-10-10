"use client"

import Link from "next/link"
import { useEffect } from "react"

/**
 * ルートセグメントのエラー境界。
 * SSR / レンダリング中に throw された想定外エラー（API が 5xx を返した等）を捕捉し、
 * Next.js デフォルトの汎用画面の代わりにブランドされた 500 ページを表示する。
 * Client Component 必須（reset で再試行できるようにするため）。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-5xl font-bold tracking-tight text-red-500">500</p>
        <h1 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          サーバーエラーが発生しました
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          問題が発生してページを読み込めませんでした。
          <br />
          少し時間をおいて再度お試しください。
        </p>
        {error.digest ? (
          <p className="mt-4 font-mono text-xs text-zinc-400 dark:text-zinc-500">
            エラーID: {error.digest}
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            onClick={reset}
            type="button"
          >
            再読み込み
          </button>
          <Link
            className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            href="/"
          >
            ホームへ戻る
          </Link>
        </div>
      </div>
    </main>
  )
}
