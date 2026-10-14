import { MockStatePanel } from "../../_components/MockStatePanel"

import { type VocabularySessionMockState, VocabularySessionMock } from "./VocabularySessionMock"

const STATES: { key: VocabularySessionMockState, label: string }[] = [
  { key: "front", label: "表" },
  { key: "back", label: "めくった後" },
  { key: "pron_word", label: "単語を再生中" },
  { key: "pron_sentence", label: "1 文を再生中（裏）" },
  { key: "word_pending", label: "単語が準備中" },
  { key: "no_sentence", label: "1 文の音声なし" },
  { key: "review", label: "ふりかえり" },
  { key: "save_failed", label: "保存できなかった" },
  { key: "done", label: "今日の分が終わった" },
]

/**
 * 単語帳の 1 回分（モック）
 */
export default async function MockVocabularySessionPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const current = STATES.find(item => item.key === state)?.key ?? "front"
  return (
    <>
      <VocabularySessionMock initialState={current} key={current} />
      <MockStatePanel basePath="/mock/vocabulary/session" current={current} states={STATES} />
    </>
  )
}
