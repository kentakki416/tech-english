import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "アカウントを削除しました",
}

/**
 * アカウント削除の完了。cookie を消した後に開くので、データを取得せず共通ヘッダーも出さない（proxy.ts の PUBLIC_PATHS に含める）
 */
export default function DeleteAccountDonePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mt-8 rounded-xl border border-line bg-surface p-6 sm:p-8">
        <h1 className="text-xl font-semibold text-fg">アカウントを削除しました</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          学習の記録を含むすべてのデータを削除しました。同じ GitHub アカウントで再びログインすると、新しいアカウントとして始まります。
        </p>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          GitHub 側の連携は、GitHub の Settings → Applications から解除できます。
        </p>
        <Link
          className="mt-6 inline-grid h-10 place-items-center rounded-lg border border-line-strong px-4 text-sm text-fg hover:bg-raised"
          href="/sign-in"
        >
          ログイン画面へ
        </Link>
      </div>
    </main>
  )
}
