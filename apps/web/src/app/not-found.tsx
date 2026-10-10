import Link from "next/link"

/**
 * 404 ページ。存在しない URL や notFound() 呼び出し時に表示する。
 * error.tsx と同じトーンで揃える（Server Component で良い）。
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">404</p>
        <h1 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          ページが見つかりません
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          お探しのページは存在しないか、移動した可能性があります。
        </p>
        <div className="mt-8">
          <Link
            className="inline-block rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            href="/"
          >
            ホームへ戻る
          </Link>
        </div>
      </div>
    </main>
  )
}
