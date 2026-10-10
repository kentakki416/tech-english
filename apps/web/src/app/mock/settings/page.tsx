import { AppHeader } from "../_components/AppHeader"

import { SettingsForm } from "./SettingsForm"

/**
 * 設定（モック）
 */
export default function MockSettingsPage() {
  return (
    <>
      <AppHeader current="settings" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-xl font-semibold text-fg">設定</h1>
        <SettingsForm />
      </main>
    </>
  )
}
