import Link from "next/link"

import { MOCK_VOCABULARY_CARDS, MOCK_VOCABULARY_SESSION_SIZE, MOCK_VOCABULARY_SUMMARY } from "@/libs/mock-data"

import { AppHeader } from "../_components/AppHeader"
import { MockStatePanel } from "../_components/MockStatePanel"
import { CardStackBehind, PaperCardFront, PaperSheet } from "../_components/PaperCard"

const STATES = [
  { key: "normal", label: "今日の分がある" },
  { key: "done", label: "今日の分が終わった" },
  { key: "empty", label: "まだ単語が無い" },
]

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"]

const formatDayLabel = (date: string): string => {
  const value = new Date(`${date}T00:00:00Z`)
  return `${value.getUTCMonth() + 1}月${value.getUTCDate()}日（${WEEKDAY_LABELS[value.getUTCDay()]}）`
}

/**
 * 復習の間隔（README「復習の間隔」）を 1 行で示す
 */
const INTERVAL_STEPS = ["翌日", "3 日後", "7 日後", "30 日後"]

/**
 * 束になったカードの見本（一番上は今日の 1 枚目の表）
 */
function DeckPreview({ isDimmed = false }: { isDimmed?: boolean }) {
  return (
    <div aria-hidden className={`relative mx-auto w-full max-w-[260px] pt-2 pb-7 sm:max-w-[320px] ${isDimmed ? "opacity-45 saturate-50" : ""}`}>
      <div className="relative h-[164px] rotate-[-2deg] sm:h-[200px]">
        <CardStackBehind count={2} />
        <PaperSheet className="absolute inset-0">
          <div className="h-[161.3%] w-[161.3%] origin-top-left scale-[0.62]">
            <PaperCardFront card={MOCK_VOCABULARY_CARDS[0]} />
          </div>
        </PaperSheet>
      </div>
    </div>
  )
}

function CountStat({ label, unit, value }: { label: string, unit: string, value: number }) {
  return (
    <div>
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-fg tabular-nums">
        {value}
        <span className="ml-1 text-sm font-normal text-fg-muted">{unit}</span>
      </p>
    </div>
  )
}

/**
 * 単語帳のトップ（モック）
 */
export default async function MockVocabularyPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const current = STATES.find(item => item.key === state)?.key ?? "normal"
  const summary = current === "done"
    ? { ...MOCK_VOCABULARY_SUMMARY, dueCount: 0, newCount: 0 }
    : current === "empty"
      ? { ...MOCK_VOCABULARY_SUMMARY, dueCount: 0, learningCount: 0, masteredCount: 0, newCount: 0 }
      : MOCK_VOCABULARY_SUMMARY
  const todayCount = Math.min(summary.dueCount + summary.newCount, MOCK_VOCABULARY_SESSION_SIZE)

  return (
    <>
      <AppHeader current="vocabulary" />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-xl font-semibold text-fg">単語帳</h1>
        <p className="mt-1 text-sm text-fg-muted">長文で出会った単語を、カードをめくって覚えます。</p>

        {current === "empty" ? (
          <section className="mt-8 rounded-xl border border-amber/40 bg-amber-wash px-6 py-6">
            <h2 className="text-base font-semibold text-fg">まだ単語がありません</h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              問題を解くと、読んだ本文の単語と調べた単語がここに並びます。
              <br />
              解答中に単語をタップして意味を調べると、その単語から先に出ます。
            </p>
            <Link className="mt-5 inline-flex rounded-lg bg-amber px-5 py-2.5 text-sm font-semibold text-amber-ink hover:bg-amber-bright" href="/mock/passages">
              問題一覧へ
            </Link>
          </section>
        ) : (
          <section className="mt-8 grid items-center gap-8 overflow-hidden rounded-xl border border-line bg-surface px-6 py-7 sm:grid-cols-[minmax(0,1fr)_minmax(0,320px)] sm:px-8">
            <div>
              <h2 className="text-sm font-medium text-fg-muted">今日の分</h2>
              {todayCount > 0 ? (
                <>
                  <div className="mt-3 flex gap-8">
                    <CountStat label="今日の復習" unit="枚" value={summary.dueCount} />
                    <CountStat label="新しい単語" unit="語" value={summary.newCount} />
                  </div>
                  <Link
                    className="mt-6 inline-flex items-center gap-2 rounded-lg bg-amber px-6 py-3 text-sm font-semibold text-amber-ink shadow-[0_0_24px_-6px_rgb(243_178_76/0.7)] hover:bg-amber-bright"
                    href="/mock/vocabulary/session"
                  >
                    はじめる
                    <span className="font-normal opacity-80">（{todayCount} 枚）</span>
                  </Link>
                  <p className="mt-3 text-xs text-fg-faint">1〜2 分で終わります。途中でやめても、答えた分は残ります。</p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-lg font-semibold text-fg">今日の分は終わりました</p>
                  <p className="mt-1 text-sm text-fg-muted">
                    次の復習は <span className="text-fg">{formatDayLabel(summary.nextDueDate)}</span> です。
                  </p>
                  <Link className="mt-5 inline-flex rounded-lg border border-line-strong px-5 py-2.5 text-sm text-fg hover:bg-raised" href="/mock/passages">
                    問題を解いて単語を増やす
                  </Link>
                </>
              )}
            </div>
            <DeckPreview isDimmed={todayCount === 0} />
          </section>
        )}

        {current !== "empty" && (
          <section className="mt-8 grid gap-6 border-t border-line pt-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-12">
            <div className="flex gap-8">
              <CountStat label="復習中" unit="語" value={summary.learningCount} />
              <CountStat label="覚えた単語" unit="語" value={summary.masteredCount} />
            </div>
            <div>
              <p className="text-xs text-fg-muted">復習の間隔</p>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg">
                <span className="text-fg-muted">覚えた</span>
                {INTERVAL_STEPS.slice(1).map(step => (
                  <span key={step} className="flex items-center gap-2">
                    <span aria-hidden className="text-fg-faint">→</span>
                    {step}
                  </span>
                ))}
                <span aria-hidden className="text-fg-faint">→</span>
                <span className="text-amber">覚えた単語</span>
              </p>
              <p className="mt-1 text-xs text-fg-faint">「まだ」を付けたカードは{INTERVAL_STEPS[0]}にもう一度出ます。</p>
            </div>
          </section>
        )}
      </main>
      <MockStatePanel basePath="/mock/vocabulary" current={current} states={STATES} />
    </>
  )
}
