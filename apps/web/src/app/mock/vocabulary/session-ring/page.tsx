import { MockStatePanel } from "../../_components/MockStatePanel"

import { type RingBookMockState, RingBookSessionMock } from "./RingBookSessionMock"

const STATES: { key: RingBookMockState, label: string }[] = [
  { key: "first", label: "はじめ（表紙の裏）" },
  { key: "turned", label: "めくった後" },
  { key: "stamped", label: "答えた後（ハンコ）" },
  { key: "review", label: "ふりかえり" },
]

/**
 * 単語帳の 1 回分（モック・デザイン 2：リングの単語帳）
 */
export default async function MockVocabularyRingSessionPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const current = STATES.find(item => item.key === state)?.key ?? "first"
  return (
    <>
      <RingBookSessionMock initialState={current} key={current} />
      <MockStatePanel basePath="/mock/vocabulary/session-ring" current={current} links={[{ href: "/mock/vocabulary/session", label: "デザイン 1 へ" }]} states={STATES} />
    </>
  )
}
