import { create } from "zustand"

import type { GetAttemptResponse } from "@repo/api-schema"

type AttemptState = {
  attemptsById: Record<number, GetAttemptResponse>
  clearStoreAttempts: () => void
  setStoreAttempt: (attempt: GetAttemptResponse) => void
}

/**
 * 開始・提出のレスポンスを挑戦 ID ごとに持つ。解答・結果の画面が開いた直後に、通信を待たずに描画できるようにする
 * （mobile の回線の待ち時間を減らすため）。
 * ユーザーごとのデータなので、ログアウト・強制ログアウト・アカウント削除の後始末で clearStoreAttempts を呼んで空にする
 * （次にログインした別のユーザーに前のユーザーの挑戦を見せないため）
 */
export const useAttemptStore = create<AttemptState>((set) => ({
  attemptsById: {},
  clearStoreAttempts: () => set({ attemptsById: {} }),
  setStoreAttempt: (attempt) => set((state) => ({ attemptsById: { ...state.attemptsById, [attempt.id]: attempt } })),
}))
