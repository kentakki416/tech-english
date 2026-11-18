import type { Metadata } from "next"

import { SourceCreatePage } from "@/components/features/source/SourceCreatePage"

export const metadata: Metadata = {
  title: "ソースの登録（GitHub）",
}

export default function NewGitHubSourcePage() {
  return <SourceCreatePage fetchType="github_repository" />
}
