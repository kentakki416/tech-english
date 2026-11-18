import { Memo } from "@repo/domain"

export type CreateMemoInput = {
  body: string
  title: string
}

export type UpdateMemoInput = {
  body: string
  title: string
}

export interface MemoRepository {
  create(data: CreateMemoInput): Promise<Memo>
  deleteById(id: number): Promise<void>
  findAll(): Promise<Memo[]>
  findById(id: number): Promise<Memo | null>
  update(id: number, data: UpdateMemoInput): Promise<Memo>
}
