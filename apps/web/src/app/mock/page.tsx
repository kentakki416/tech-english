import Link from "next/link"

import { Wordmark } from "./_components/Wordmark"

const SCREENS: { description: string, href: string, spec: string, states?: { href: string, label: string }[], title: string }[] = [
  { description: "GitHub でログイン。英文のデモつき", href: "/mock/sign-in", spec: "github-auth", title: "ログイン" },
  {
    description: "学習カレンダー・連続日数・目標・累計",
    href: "/mock/home",
    spec: "learning-record",
    states: [{ href: "/mock/home?state=empty", label: "まだ 1 問も解いていない" }],
    title: "マイページ",
  },
  {
    description: "公開中の問題と絞り込み",
    href: "/mock/passages",
    spec: "reading-practice",
    states: [{ href: "/mock/passages?state=no-results", label: "絞り込み結果が 0 件" }],
    title: "問題一覧",
  },
  {
    description: "本文を見せる前の確認",
    href: "/mock/passages/57",
    spec: "reading-practice",
    states: [{ href: "/mock/passages/57?state=resume", label: "挑戦中（再開）" }],
    title: "開始確認",
  },
  {
    description: "本文・設問・タイマー・アシスト（最重要）",
    href: "/mock/attempts/42",
    spec: "reading-practice",
    states: [
      { href: "/mock/attempts/42?state=warning", label: "残り 20% 未満" },
      { href: "/mock/attempts/42?state=overtime", label: "時間超過" },
      { href: "/mock/attempts/42?state=paused", label: "一時停止" },
      { href: "/mock/attempts/42?state=confirm", label: "提出確認" },
    ],
    title: "問題を解く",
  },
  {
    description: "スコア・時間・解説・根拠のハイライト",
    href: "/mock/attempts/42/result",
    spec: "reading-practice",
    states: [{ href: "/mock/attempts/42/result?state=overtime", label: "時間超過" }],
    title: "結果・解説",
  },
  { description: "提出した挑戦の一覧", href: "/mock/history", spec: "learning-record", title: "学習履歴" },
  { description: "目標・タイムゾーン・ログアウト・危険な操作", href: "/mock/settings", spec: "learning-record", title: "設定" },
  {
    description: "削除するデータの説明と入力による確認",
    href: "/mock/settings/delete-account",
    spec: "github-auth",
    states: [{ href: "/mock/settings/delete-account?state=done", label: "削除完了" }],
    title: "アカウント削除",
  },
]

/**
 * モックの画面一覧（レビュー用。製品の画面ではない）
 */
export default function MockIndexPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Wordmark href="/mock" />
      <h1 className="mt-8 text-xl font-semibold text-fg">画面モック</h1>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">
        web のユーザー向け画面のモックです。ダミーデータで動き、API は呼びません。各画面の左下の「モック」から状態を切り替えられます。
      </p>
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {SCREENS.map(screen => (
          <li key={screen.href} className="grid gap-2 py-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <div>
              <Link className="text-[15px] font-medium text-fg hover:text-amber-bright" href={screen.href}>{screen.title}</Link>
              <p className="mt-0.5 font-code text-[11px] text-fg-faint">{screen.spec}</p>
            </div>
            <div>
              <p className="text-sm text-fg-muted">{screen.description}</p>
              {screen.states && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {screen.states.map(state => (
                    <Link
                      key={state.href}
                      className="rounded border border-line px-2 py-0.5 text-xs text-fg-muted hover:border-line-strong hover:text-fg"
                      href={state.href}
                    >
                      {state.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
