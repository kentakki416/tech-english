import { redirect } from "next/navigation"

import { SOURCE_CREATE_PATHS } from "@/features/source/source.paths"

/**
 * ブックマークなどの /sources/new は GitHub の登録の画面に送る
 */
export default function NewSourcePage() {
  redirect(SOURCE_CREATE_PATHS.github_repository)
}
