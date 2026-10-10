import { Memo } from "@repo/domain"

/**
 * メモ作成時の入力
 */
export type CreateMemoInput = {
  body: string
  title: string
}

/**
 * メモ更新時の入力
 */
export type UpdateMemoInput = {
  body: string
  title: string
}

/**
 * メモリポジトリのインターフェース
 */
export interface MemoRepository {
  create(data: CreateMemoInput): Promise<Memo>
  deleteById(id: number): Promise<void>
  findAll(): Promise<Memo[]>
  findById(id: number): Promise<Memo | null>
  update(id: number, data: UpdateMemoInput): Promise<Memo>
}
