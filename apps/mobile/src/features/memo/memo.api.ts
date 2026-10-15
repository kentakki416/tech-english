import axios from "axios"

import { env } from "@/env"

import { Memo } from "./memo.entity"

const client = axios.create({ baseURL: env.EXPO_PUBLIC_API_URL })

export const memoApi = {
  async getAll(): Promise<Memo[]> {
    const result = await client.get("/api/memo")
    return result.data.memos.map((memo: Memo) => new Memo(memo))
  },

  async create(title: string, body: string): Promise<Memo> {
    const result = await client.post("/api/memo", { title, body })
    return new Memo(result.data) // 型安全ではない
  },

  async update(id: string, title: string, body: string): Promise<Memo> {
    const result = await client.put(`/api/memo/${id}`, { title, body })
    return new Memo(result.data)
  },

  async delete(id: string): Promise<void> {
    await client.delete(`/api/memo/${id}`)
    return
  }
}