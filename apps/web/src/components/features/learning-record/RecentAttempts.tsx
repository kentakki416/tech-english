import Link from "next/link"

import type { LearningRecordAttemptResponse } from "@repo/api-schema"

import { ScoreSquares } from "@/components/ui/ScoreSquares"
import { formatSeconds } from "@/libs/format"

export function RecentAttempts({ attempts }: { attempts: LearningRecordAttemptResponse[] }) {
  return (
    <section className="p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm text-fg-muted">最近の挑戦</h2>
        <Link className="text-xs text-fg-muted hover:text-fg" href="/history">すべて見る</Link>
      </div>
      <ul className="mt-2 divide-y divide-line">
        {attempts.map(attempt => (
          <li key={attempt.id}>
            <Link className="block py-2.5 hover:text-amber-bright" href={`/attempts/${attempt.id}/result`}>
              <span className="block truncate font-reading text-[15px] text-fg">{attempt.title}</span>
              <span className="mt-1 flex items-center gap-2 text-xs text-fg-muted tabular-nums">
                <ScoreSquares
                  results={Array.from({ length: attempt.question_count }, (_, index) => index < attempt.correct_count)}
                  size="sm"
                />
                {attempt.correct_count} / {attempt.question_count}
                <span className="ml-auto">{formatSeconds(attempt.elapsed_seconds)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
