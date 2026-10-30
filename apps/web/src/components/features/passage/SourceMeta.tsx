export function SourceMeta({ name }: { name: string }) {
  return (
    <span className="inline-flex min-w-0 text-sm text-fg-muted">
      <span className="truncate">{name}</span>
    </span>
  )
}
