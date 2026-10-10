import Link from "next/link"

import { formatSeconds, MOCK_PASSAGE_LIST } from "@/libs/mock-data"

import { AppHeader } from "../../_components/AppHeader"
import { MockStatePanel } from "../../_components/MockStatePanel"
import { DifficultyMeter, SourceMeta } from "../../_components/parts"

const STATES = [
  { key: "new", label: "新しく始める" },
  { key: "resume", label: "挑戦中（再開）" },
]

/**
 * 開始確認（モック）。本文はまだ見せない
 */
export default async function MockPassageStartPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const isResume = state === "resume"
  const passage = MOCK_PASSAGE_LIST[1]

  return (
    <>
      <AppHeader current="passages" />
      <main className="mx-auto max-w-xl px-4 py-10 sm:py-16">
        <Link className="text-sm text-fg-muted hover:text-fg" href="/mock/passages">問題一覧に戻る</Link>

        <div className="mt-6 rounded-xl border border-line bg-surface">
          <div className="px-6 pt-6 pb-5 sm:px-8 sm:pt-8">
            <SourceMeta kind={passage.kind} name={passage.sourceName} />
            <h1 className="mt-3 font-reading text-[28px] leading-tight font-semibold text-fg">{passage.title}</h1>
          </div>

          <dl className="grid grid-cols-2 border-y border-line sm:grid-cols-4">
            <div className="border-r border-line px-6 py-4 sm:px-5">
              <dt className="text-xs text-fg-muted">難易度</dt>
              <dd className="mt-1.5"><DifficultyMeter level={passage.difficulty} /></dd>
            </div>
            <div className="px-6 py-4 sm:border-r sm:border-line sm:px-5">
              <dt className="text-xs text-fg-muted">英単語数</dt>
              <dd className="mt-1 text-lg font-semibold text-fg tabular-nums">{passage.wordCount}<span className="ml-1 text-sm font-normal text-fg-muted">語</span></dd>
            </div>
            <div className="border-t border-r border-line px-6 py-4 sm:border-t-0 sm:px-5">
              <dt className="text-xs text-fg-muted">制限時間</dt>
              <dd className="mt-1 text-lg font-semibold text-fg tabular-nums">{formatSeconds(passage.timeLimitSeconds)}</dd>
            </div>
            <div className="border-t border-line px-6 py-4 sm:border-t-0 sm:px-5">
              <dt className="text-xs text-fg-muted">設問</dt>
              <dd className="mt-1 text-lg font-semibold text-fg tabular-nums">{passage.questionCount}<span className="ml-1 text-sm font-normal text-fg-muted">問</span></dd>
            </div>
          </dl>

          <div className="px-6 py-6 sm:px-8">
            {isResume ? (
              <div className="rounded-lg border border-amber/40 bg-amber-wash px-4 py-3 text-sm leading-relaxed">
                <p className="text-fg">前回の続きから再開できます。</p>
                <p className="mt-1 text-fg-muted tabular-nums">残り 3:12、回答 2 / 4。あと 18 時間で期限切れになります。</p>
              </div>
            ) : (
              <ul className="space-y-1.5 text-sm leading-relaxed text-fg-muted">
                <li>「開始する」を押すとタイマーが動き、本文が表示されます。</li>
                <li>画面を離れている間と一時停止中はタイマーが止まります。</li>
                <li>時間が過ぎても解き続けられます（超過時間が記録されます）。</li>
              </ul>
            )}
            <Link
              className="mt-6 grid h-12 w-full place-items-center rounded-lg bg-amber text-base font-semibold text-amber-ink outline-none hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              href="/mock/attempts/42"
            >
              {isResume ? "再開する" : "開始する"}
            </Link>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-fg-faint">
          出典：{passage.sourceName}（MIT / Apache-2.0）。一部を抜粋・改変しています。
        </p>
      </main>
      <MockStatePanel basePath="/mock/passages/57" current={isResume ? "resume" : "new"} states={STATES} />
    </>
  )
}
