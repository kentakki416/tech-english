import type { Metadata } from "next"

import { SourceCreatePage } from "@/components/features/source/SourceCreatePage"

export const metadata: Metadata = {
  title: "ソースの登録（GitHub）",
}

/**
 * GitHub のソースの登録。表示名と URL を読み込んで登録する
 */
export default function NewGitHubSourcePage() {
  return <SourceCreatePage fetchType="github_repository" />
}
