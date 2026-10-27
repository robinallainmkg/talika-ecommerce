import type { Metadata } from "next"
import { createServiceClient } from "@/lib/supabase/client"
import { verifyShareToken } from "@/lib/share-token"

// Planning marketing en LECTURE SEULE, sans compte, via un lien signé qui expire tout seul
// (/share/calendar?t=<exp>.<sig>, cf. src/lib/share-token.ts et scripts/gen-share-link.mjs).
// Ne montre que le planning (titres, dates, statuts, maquettes publiques) : ni avis de l'équipe,
// ni emails, ni liens vers les outils internes (admin Shopify, Spoks, Gmail…).

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export const metadata: Metadata = {
  title: "Talika — Planning marketing",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

type Market = "fr" | "uk" | "us"
interface Item {
  id: string
  market: Market
  kind: "email" | "operation"
  canal: string | null
  date_start: string | null
  date_label: string | null
  heure: string | null
  title: string
  payload: Record<string, unknown> | null
  preview_url: string | null
  pdf_url: string | null
  updated_at: string | null
}

const MARKETS: { key: Market; label: string; tool: string; tz: string }[] = [
  { key: "fr", label: "France", tool: "Klaviyo", tz: "Paris" },
  { key: "uk", label: "Royaume-Uni", tool: "Spoks", tz: "Londres" },
  { key: "us", label: "États-Unis", tool: "Spoks", tz: "New York" },
]
const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."]
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
const CANAL: Record<string, string> = { site: "Site", meta: "Pub Meta", bf: "Black Friday" }

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// Texte affichable : chaîne seulement, adresses email masquées par sécurité.
function txt(v: unknown): string {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string").join(" · ").replace(EMAIL_RE, "[email masqué]")
  return typeof v === "string" ? v.replace(EMAIL_RE, "[email masqué]") : ""
}
// Seuls les aperçus du bucket public du planning sont repris (jamais d'autre lien).
function publicAsset(url: string | null): string | null {
  if (!url) return null
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "")
  return base && url.startsWith(`${base}/storage/v1/object/public/marketing-plan/`) ? url : null
}

const parseDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const mondayOf = (d: Date) => {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7))
  return x
}
const todayParis = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" })
const fmtParis = (ms: number) =>
  new Date(ms).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })

function statusOf(it: Item): { tone: string; text: string } {
  const s = txt(it.payload?.statut).toLowerCase()
  if (it.kind === "operation") {
    if (/en place|fait/.test(s)) return { tone: "ok", text: "En place" }
    if (/décider|decider/.test(s)) return { tone: "idea", text: "À décider" }
    return { tone: "todo", text: "À faire" }
  }
  if (/écarté|ecarte/.test(s)) return { tone: "muted", text: "Écarté" }
  if (/indicatif|à caler|attente de la décision/.test(s)) return { tone: "muted", text: "À caler" }
  if (/envoy/.test(s) && !/à envoyer/.test(s)) return { tone: "ok", text: "Envoyé" }
  if (/programm|déjà|validé|^prévu|maquette prête/.test(s)) return { tone: "ok", text: "Prêt" }
  return { tone: "todo", text: it.preview_url ? "Maquette à valider" : "À créer" }
}
const TONE: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  todo: "bg-amber-50 text-amber-700",
  idea: "bg-violet-50 text-violet-700",
  muted: "border border-zinc-200 text-zinc-500",
}

function Denied({ reason }: { reason: "absent" | "invalide" | "expire" }) {
  return (
    <div className="mx-auto max-w-md p-6 pt-24 text-center">
      <h1 className="text-lg font-semibold text-zinc-900">
        {reason === "expire" ? "Ce lien a expiré" : "Lien invalide"}
      </h1>
      <p className="mt-2 text-sm text-zinc-600">Demandez un nouveau lien à Robin.</p>
    </div>
  )
}

export default async function SharedCalendarPage({ searchParams }: { searchParams: { t?: string | string[] } }) {
  const t = Array.isArray(searchParams.t) ? searchParams.t[0] : searchParams.t
  const check = verifyShareToken("calendar", t)
  if (!check.ok) return <Denied reason={check.reason} />

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("marketing_plan_items")
    .select("id, market, kind, canal, date_start, date_label, heure, title, payload, preview_url, pdf_url, updated_at")
    .eq("active", true)
    .order("date_start", { ascending: true, nullsFirst: false })
  if (error) {
    return <div className="p-6 text-sm text-red-700">Le planning n&apos;a pas pu être chargé. Réessayez dans un instant.</div>
  }
  const items = (data || []) as Item[]
  const from = isoDay(mondayOf(parseDay(todayParis())))
  const lastUpdate = items.reduce((m, i) => (i.updated_at && i.updated_at > m ? i.updated_at : m), "")

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Talika · lecture seule</p>
        <h1 className="text-2xl font-bold text-zinc-900">Planning marketing</h1>
        <p className="text-sm text-zinc-600">
          Emails, site, pubs Meta et Black Friday, à partir de cette semaine.
          {lastUpdate && <> Dernière mise à jour du planning : {fmtParis(Date.parse(lastUpdate))}.</>}{" "}
          Lien valable jusqu&apos;au {fmtParis(check.exp * 1000)} (heure de Paris).
        </p>
        <nav className="flex flex-wrap gap-2 pt-2">
          {MARKETS.map((m) => (
            <a key={m.key} href={`#${m.key}`} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
              {m.label}
            </a>
          ))}
        </nav>
      </header>

      {MARKETS.map((m) => {
        const mine = items.filter((i) => i.market === m.key && (!i.date_start || i.date_start >= from))
        const weeks = new Map<string, Item[]>()
        for (const i of mine) {
          const w = i.date_start ? isoDay(mondayOf(parseDay(i.date_start))) : "sans-date"
          weeks.set(w, [...(weeks.get(w) || []), i])
        }
        return (
          <section key={m.key} id={m.key} className="scroll-mt-4 space-y-4">
            <div className="border-b border-zinc-200 pb-2">
              <h2 className="text-xl font-semibold text-zinc-900">{m.label}</h2>
              <p className="text-xs text-zinc-500">{m.tool} · heures de {m.tz}</p>
            </div>
            {!mine.length && <p className="text-sm text-zinc-500">Rien de prévu pour l&apos;instant.</p>}
            {Array.from(weeks.entries()).map(([w, list]) => (
              <div key={w} className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-700">
                  {w === "sans-date" ? "Sans date" : w === from ? "Cette semaine" : `Semaine du ${parseDay(w).getUTCDate()} ${MOIS[parseDay(w).getUTCMonth()]}`}
                </h3>
                <ol className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
                  {list.map((it) => <Row key={it.id} it={it} />)}
                </ol>
              </div>
            ))}
          </section>
        )
      })}
      <p className="pb-6 text-xs text-zinc-400">Page de consultation : aucune action n&apos;est possible d&apos;ici.</p>
    </div>
  )
}

function Row({ it }: { it: Item }) {
  const st = statusOf(it)
  const p = it.payload || {}
  const d = it.date_start ? parseDay(it.date_start) : null
  const preview = publicAsset(it.preview_url)
  const pdf = publicAsset(it.pdf_url)
  const kind = it.kind === "email" ? "Email" : (it.canal && CANAL[it.canal]) || "Opération"
  const details: [string, string][] = (
    it.kind === "email"
      ? [["Cible", txt(p.cible)], ["Produits", txt(p.produits)], ["Offre", txt(p.offre)], ["But", txt(p.objectif)]]
      : [["", txt(p.detail)]]
  ).filter(([, v]) => v) as [string, string][]
  return (
    <li className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[64px_minmax(0,1fr)_112px]">
      <div className="leading-tight">
        {d ? (
          <>
            <div className="text-xs uppercase text-zinc-500">{JOURS[d.getUTCDay()]}</div>
            <div className="text-xl font-bold text-zinc-900">{d.getUTCDate()}</div>
            <div className="text-xs text-zinc-500">{MOIS[d.getUTCMonth()]}</div>
            {it.heure && <div className="mt-1 font-mono text-[11px] text-zinc-700">{txt(it.heure).replace(/\s*\(.*\)/, "")}</div>}
          </>
        ) : (
          <div className="text-xs text-zinc-500">{txt(it.date_label)}</div>
        )}
      </div>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{kind}</span>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[st.tone]}`}>{st.text}</span>
        </div>
        <div className="font-semibold leading-snug text-zinc-900 break-words">{txt(it.title)}</div>
        {txt(p.preheader) && <p className="text-sm text-zinc-500 break-words">{txt(p.preheader)}</p>}
        {details.length > 0 && (
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm text-zinc-700">
            {details.map(([k, v]) => (
              <div key={k + v.slice(0, 12)} className="contents">
                <dt className="text-zinc-500">{k}</dt>
                <dd className="break-words">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {txt(p.statut) && <p className="text-xs text-zinc-500 break-words">Statut : {txt(p.statut)}</p>}
      </div>
      {(preview || pdf) && (
        <div className="col-span-2 flex items-start gap-3 sm:col-span-1 sm:flex-col">
          {preview && (
            <a href={preview} target="_blank" rel="noopener noreferrer" className="block h-36 w-24 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 sm:h-40 sm:w-full" aria-label={`Voir la maquette : ${txt(it.title)}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt={`Aperçu : ${txt(it.title)}`} className="w-full" loading="lazy" />
            </a>
          )}
          {pdf && (
            <a href={pdf} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">
              Ouvrir le PDF
            </a>
          )}
        </div>
      )}
    </li>
  )
}
