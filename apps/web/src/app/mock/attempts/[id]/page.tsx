import { MockStatePanel } from "../../_components/MockStatePanel"

import { type SolvingMockState, SolvingScreen } from "./SolvingScreen"

const STATES: { key: SolvingMockState, label: string }[] = [
  { key: "normal", label: "通常" },
  { key: "warning", label: "残り 20% 未満" },
  { key: "overtime", label: "時間超過" },
  { key: "paused", label: "一時停止" },
  { key: "confirm", label: "提出確認" },
]

/**
 * 問題を解く画面（モック）
 */
export default async function MockAttemptPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const current = STATES.find(item => item.key === state)?.key ?? "normal"
  return (
    <>
      <SolvingScreen initialState={current} key={current} />
      <MockStatePanel basePath="/mock/attempts/42" current={current} states={STATES} />
    </>
  )
}
