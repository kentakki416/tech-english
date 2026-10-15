import { type PassageSourceKind, SOURCE_KIND_LABELS } from "./labels"

export function SourceMeta({ kind, name }: { kind: PassageSourceKind, name: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-sm text-fg-muted">
      <span
        className={`shrink-0 rounded border px-1.5 py-px text-[11px] font-medium ${
          kind === "github" ? "border-line-strong text-fg" : "border-amber/40 text-amber"
        }`}
      >
        {SOURCE_KIND_LABELS[kind]}
      </span>
      <span className="truncate">{name}</span>
    </span>
  )
}
