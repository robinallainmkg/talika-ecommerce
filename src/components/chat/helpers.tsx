export function relativeTime(iso: string | null): string {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "à l’instant"
  if (min < 60) return `il y a ${min} min`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `il y a ${days} j`
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  bot: { label: "Bot", className: "bg-zinc-100 text-zinc-600" },
  queued: { label: "À traiter", className: "bg-amber-100 text-amber-700" },
  human: { label: "Humain", className: "bg-blue-100 text-blue-700" },
  closed: { label: "Fermée", className: "bg-zinc-50 text-zinc-400" },
}

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.bot
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.className}`}>
      {style.label}
    </span>
  )
}
