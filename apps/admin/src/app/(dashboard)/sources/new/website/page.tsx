import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { SourceCreatePage } from "@/components/features/source/SourceCreatePage"
import { isLocalEnvironment } from "@/libs/environment"

export const metadata: Metadata = {
  title: "ソースの登録（サイト）",
}

/**
 * サイトのソースの登録。サイトのソースはローカルだけなので、ローカル以外では 404
 */
export default function NewWebsiteSourcePage() {
  if (!isLocalEnvironment) notFound()
  return <SourceCreatePage fetchType="website" />
}
