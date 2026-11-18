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

export const attemptApi = {
  /**
   * 挑戦の問題の読み上げの音声。準備中・失敗は status だけ。他人の挑戦・存在しない ID は API が 404
   */
  getAudio: async (id: number): Promise<GetAttemptAudioResponse> => {
    const result = await apiClient.get(`/api/attempt/${id}/audio`)
    return getAttemptAudioResponseSchema.parse(result.data)
  },

  /**
   * status で形が変わる（in_progress は開始時と同じ形、submitted は結果の形、expired は概要だけ）。
   * 他人の挑戦・存在しない ID は API が 404
   */
  getDetail: async (id: number): Promise<GetAttemptResponse> => {
    const result = await apiClient.get(`/api/attempt/${id}`)
    return getAttemptResponseSchema.parse(result.data)
  },

  /**
   * 期限内の挑戦中があれば API は新しく作らずにそれを返す
   */
  start: async (passageId: number): Promise<StartAttemptResponse> => {
    const result = await apiClient.post(`/api/passage/${passageId}/attempt`, {})
    return startAttemptResponseSchema.parse(result.data)
  },

  /**
   * 提出済みなら API は保存済みの結果を返す（冪等なので再送してよい）。期限切れは 409
   */
  submit: async (id: number, input: SubmitAttemptRequest): Promise<SubmitAttemptResponse> => {
    const result = await apiClient.post(`/api/attempt/${id}/submit`, input)
    return submitAttemptResponseSchema.parse(result.data)
  },
}
