import { MOCK_RESULT } from "@/libs/mock-data"

import { MockStatePanel } from "../../../_components/MockStatePanel"

import { ResultScreen } from "./ResultScreen"

const STATES = [
  { key: "normal", label: "時間内" },
  { key: "overtime", label: "時間超過" },
]

/**
 * 結果・解説画面（モック）
 */
export default async function MockResultPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const current = STATES.find(item => item.key === state)?.key ?? "normal"
  return (
    <>
      <ResultScreen key={current} elapsedSeconds={current === "overtime" ? 402 : MOCK_RESULT.elapsedSeconds} />
      <MockStatePanel basePath="/mock/attempts/42/result" current={current} states={STATES} />
    </>
  )
}
