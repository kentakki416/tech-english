"use client"

import { useState, useTransition } from "react"

import type { UpdateTimezoneResult } from "@/app/settings/actions"

type UpdateTimezoneAction = (timezone: string) => Promise<UpdateTimezoneResult>

const inputClass = "rounded-lg border border-line-strong bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-amber/70 focus:ring-2 focus:ring-amber/30 disabled:opacity-70"

/**
 * タイムゾーンのセレクト。変えたらその場で保存し、失敗したら元の値に戻す
 */
export function TimezoneSelect({
  action,
  initialTimezone,
  timezones,
}: {
  action: UpdateTimezoneAction
  initialTimezone: string
  timezones: string[]
}) {
  const [timezone, setTimezone] = useState(initialTimezone)
  const [result, setResult] = useState<UpdateTimezoneResult | null>(null)
  const [isPending, startTransition] = useTransition()

  const saveTimezone = (next: string) => {
    const previous = timezone
    setTimezone(next)
    setResult(null)
    startTransition(async () => {
      const saved = await action(next)
      startTransition(() => {
        setResult(saved)
        if (saved.status === "error") setTimezone(previous)
      })
    })
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <select
        aria-label="タイムゾーン"
        className={`${inputClass} block w-full sm:w-72`}
        disabled={isPending}
        onChange={event => saveTimezone(event.target.value)}
        value={timezone}
      >
        {timezones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
      </select>
      {isPending && <p className="text-sm text-fg-faint" role="status">保存しています…</p>}
      {!isPending && result?.status === "saved" && <p className="text-sm text-correct" role="status">タイムゾーンを保存しました</p>}
      {!isPending && result?.status === "error" && (
        <p className="text-sm text-wrong" role="alert">保存に失敗しました。時間をおいて再度お試しください。</p>
      )}
    </div>
  )
}
