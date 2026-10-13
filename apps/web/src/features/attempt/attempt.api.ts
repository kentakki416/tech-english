import "server-only"

import {
  type GetAttemptAudioResponse,
  getAttemptAudioResponseSchema,
  type GetAttemptResponse,
  getAttemptResponseSchema,
  type StartAttemptResponse,
  startAttemptResponseSchema,
  type SubmitAttemptRequest,
  type SubmitAttemptResponse,
  submitAttemptResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * 挑戦の API 通信層
 */
export const attemptApi = {
  /**
   * 挑戦の問題の読み上げの音声。準備中・失敗は status だけ。他人の挑戦・存在しない ID は API が 404（ApiClientError）
   */
  getAudio: async (id: number): Promise<GetAttemptAudioResponse> => {
    const raw = await apiClient.get<unknown>(`/api/attempt/${id}/audio`)
    return getAttemptAudioResponseSchema.parse(raw)
  },
  /**
   * status で形が変わる（解答中・提出済み・期限切れ）。他人の挑戦・存在しない ID は API が 404（ApiClientError）
   */
  getDetail: async (id: number): Promise<GetAttemptResponse> => {
    const raw = await apiClient.get<unknown>(`/api/attempt/${id}`)
    return getAttemptResponseSchema.parse(raw)
  },
  /**
   * 期限内の挑戦中があれば API は新しく作らずにそれを返す
   */
  start: async (passageId: number): Promise<StartAttemptResponse> => {
    const raw = await apiClient.post<unknown>(`/api/passage/${passageId}/attempt`, {})
    return startAttemptResponseSchema.parse(raw)
  },
  /**
   * 提出済みなら API は保存済みの結果を返す（冪等）。期限切れは 409（ApiClientError）
   */
  submit: async (id: number, input: SubmitAttemptRequest): Promise<SubmitAttemptResponse> => {
    const raw = await apiClient.post<unknown>(`/api/attempt/${id}/submit`, input)
    return submitAttemptResponseSchema.parse(raw)
  },
}
