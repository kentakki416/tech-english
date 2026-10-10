import type { Metadata } from "next"

import { MemoForm } from "@/components/features/memo/MemoForm"

import { createMemoAction } from "../actions"

export const metadata: Metadata = { title: "メモを作成" }

/**
 * メモ作成ページ
 */
export default function NewMemoPage() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">メモを作成</h1>
      <div className="mt-6">
        <MemoForm action={createMemoAction} submitLabel="保存する" />
      </div>
      <div className="mt-6 flex gap-3"></div>
    </main>
  )
}