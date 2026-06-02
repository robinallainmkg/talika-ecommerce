import { createClient } from "@supabase/supabase-js"

// Assembleur de "pack de contexte" : fusionne la table knowledge_base (savoir
// durable) avec les données live (objectives_2026, calendar_events) en un seul
// brief markdown, injectable dans un prompt ou lisible par Claude Code.
// Voir CLAUDE.md §6 (companion) et §7 (périmètre marque/marché/canal).

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const DEFAULT_MARKET = "FR"
const DEFAULT_CHANNEL = "shopify"

export interface KnowledgeEntry {
  type: string
  key: string
  title: string
  content: string
  payload: Record<string, unknown>
  market: string | null
  channel: string | null
  tags: string[]
  pages: string[]
  priority: number
  valid_from: string | null
  valid_until: string | null
}

export interface ContextOptions {
  page?: string
  market?: string // défaut 'FR'
  channel?: string // défaut 'shopify'
  types?: string[]
  limit?: number
}

// Récupère les entrées knowledge_base actives, filtrées par périmètre, page et validité.
export async function getKnowledge(opts: ContextOptions = {}): Promise<KnowledgeEntry[]> {
  const market = opts.market ?? DEFAULT_MARKET
  const channel = opts.channel ?? DEFAULT_CHANNEL
  const today = new Date().toISOString().slice(0, 10)

  let query = supabase
    .from("knowledge_base")
    .select(
      "type,key,title,content,payload,market,channel,tags,pages,priority,valid_from,valid_until"
    )
    .eq("status", "active")
    .order("priority", { ascending: false })
    .limit(opts.limit ?? 100)

  if (opts.types?.length) query = query.in("type", opts.types)

  const { data, error } = await query
  if (error || !data) return []

  return (data as KnowledgeEntry[]).filter((e) => {
    // Périmètre : NULL = global (vaut pour tous), sinon doit matcher.
    if (e.market && e.market !== market) return false
    if (e.channel && e.channel !== channel) return false
    // Page : pages vide = vaut pour toutes les pages.
    if (opts.page && e.pages.length > 0 && !e.pages.includes(opts.page)) return false
    // Validité temporelle.
    if (e.valid_from && e.valid_from > today) return false
    if (e.valid_until && e.valid_until < today) return false
    return true
  })
}

const TYPE_LABELS: Record<string, string> = {
  rule: "RÈGLES MÉTIER",
  strategy: "STRATÉGIE",
  product: "PRODUITS",
  claim: "CLAIMS VALIDÉS",
  playbook: "PLAYBOOKS",
  glossary: "GLOSSAIRE",
}

function renderKnowledge(entries: KnowledgeEntry[]): string {
  if (!entries.length) return ""
  const byType = new Map<string, KnowledgeEntry[]>()
  for (const e of entries) {
    const list = byType.get(e.type) ?? []
    list.push(e)
    byType.set(e.type, list)
  }
  const parts: string[] = []
  for (const type of Object.keys(TYPE_LABELS)) {
    const items = byType.get(type)
    if (!items?.length) continue
    parts.push(`## ${TYPE_LABELS[type]}`)
    for (const e of items) {
      parts.push(`### ${e.title}`)
      if (e.content) parts.push(e.content.trim())
      const facts = Object.entries(e.payload ?? {})
      if (facts.length) {
        parts.push(
          facts
            .map(([k, v]) => `- ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
            .join("\n")
        )
      }
      parts.push("")
    }
  }
  return parts.join("\n")
}

interface ObjectiveRow {
  month: number
  ca_2025: number | string | null
  ca_2026: number | string | null
  media_spent: number | string | null
  generosite: number | string | null
}

const eur = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " €"

function renderObjectives(rows: ObjectiveRow[]): string {
  if (!rows.length) return ""
  // Comparaison à périmètre égal (YTD) : seulement les mois où le CA 2026 est saisi,
  // comparés aux MÊMES mois de 2025 — sinon on compare une année partielle à une année pleine.
  const ytd = rows.filter((r) => (Number(r.ca_2026) || 0) > 0)
  if (!ytd.length) return ""
  const sum = (k: keyof ObjectiveRow) => ytd.reduce((s, r) => s + (Number(r[k]) || 0), 0)
  const ca26 = sum("ca_2026")
  const ca25 = sum("ca_2025")
  const media = sum("media_spent")
  const growth = ca25 > 0 ? Math.round(((ca26 - ca25) / ca25) * 1000) / 10 : 0
  const genVals = ytd.map((r) => Number(r.generosite) || 0).filter((v) => v > 0)
  const genAvg = genVals.length
    ? Math.round((genVals.reduce((a, b) => a + b, 0) / genVals.length) * 10) / 10
    : null
  const lines = [
    "## OBJECTIFS 2026 (live — table objectives_2026)",
    `- CA 2026 YTD (${ytd.length} mois saisis) : ${eur(ca26)} — vs même période 2025 : ${eur(ca25)} → ${growth > 0 ? "+" : ""}${growth}% (cible +20%)`,
    `- Media spent YTD : ${eur(media)}`,
  ]
  if (genAvg !== null) lines.push(`- Générosité YTD (moyenne) : ${genAvg}% (cible 20%)`)
  lines.push("")
  return lines.join("\n")
}

interface EventRow {
  title: string
  event_type: string
  channel: string | null
  scheduled_at: string
  status: string | null
}

function renderEvents(rows: EventRow[]): string {
  if (!rows.length) return ""
  const lines = rows.map((e) => {
    const d = (e.scheduled_at || "").slice(0, 10)
    return `- ${d} · ${e.title} (${e.event_type}${e.channel ? ", " + e.channel : ""})`
  })
  return ["## CALENDRIER À VENIR (live — table calendar_events)", ...lines, ""].join("\n")
}

// Construit le brief markdown complet : savoir durable + données live.
export async function assembleContextPack(opts: ContextOptions = {}): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)
  const market = opts.market ?? DEFAULT_MARKET
  const channel = opts.channel ?? DEFAULT_CHANNEL

  const [knowledge, objectivesRes, eventsRes] = await Promise.all([
    getKnowledge(opts),
    supabase
      .from("objectives_2026")
      .select("month,ca_2025,ca_2026,media_spent,generosite")
      .order("month"),
    supabase
      .from("calendar_events")
      .select("title,event_type,channel,scheduled_at,status")
      .gte("scheduled_at", today)
      .order("scheduled_at")
      .limit(8),
  ])

  const header = `> Périmètre : ${market} / ${channel}${opts.page ? " · page : " + opts.page : ""} · généré le ${today}`

  return [
    "# Contexte business Talika",
    header,
    "",
    renderKnowledge(knowledge),
    renderObjectives((objectivesRes.data as ObjectiveRow[]) ?? []),
    renderEvents((eventsRes.data as EventRow[]) ?? []),
  ]
    .filter(Boolean)
    .join("\n")
    .trim()
}
