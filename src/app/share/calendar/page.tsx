import type { Metadata } from "next"
import { createServiceClient } from "@/lib/supabase/client"
import { verifyShareToken } from "@/lib/share-token"
import { SHARED_AUTHOR, foldShared, type FeedbackRow, type SharedState } from "@/lib/plan-feedback"
import { Feedback } from "./feedback"

// Planning marketing, VUE ÉQUIPE, sans compte, via un lien signé qui expire tout seul
// (/share/calendar?t=<exp>.<sig>, cf. src/lib/share-token.ts et scripts/gen-share-link.mjs).
// Robin, 27/10 : « il est incompréhensible le calendrier ». Ne montre donc QUE les lignes que Pilotage
// a réécrites pour l'équipe (payload.equipe_visible = true) : titre clair, une phrase « ce que voient
// les clientes », pour qui, et 4 statuts (Prévu, Prêt, Envoyé / En ligne, Annulé). Jamais la cible
// technique, l'offre technique, le but, l'outil ni un identifiant. Les réglages internes restent
// dans /calendar/planning (vue complète, connectée).
// Seule écriture possible : Valider / Annuler la validation / une note (route /api/share/calendar/feedback).

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export const metadata: Metadata = {
  title: "Talika — Planning marketing",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

type Market = "fr" | "uk" | "us"
type Statut = "prevu" | "pret" | "envoye" | "annule"
interface Item {
  id: string
  market: Market
  kind: "email" | "operation"
  canal: string | null
  date_start: string | null
  heure: string | null
  payload: Record<string, unknown> | null
  preview_url: string | null
  updated_at: string | null
}

const MARKETS: { key: Market; code: string; label: string; tz: string }[] = [
  { key: "fr", code: "FR", label: "France", tz: "heure de Paris" },
  { key: "uk", code: "UK", label: "Royaume-Uni", tz: "heure de Londres" },
  { key: "us", code: "US", label: "États-Unis", tz: "heure de New York" },
]
const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."]
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const txt = (v: unknown): string => (typeof v === "string" ? v.replace(EMAIL_RE, "[email masqué]").trim() : "")
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
const addDays = (iso: string, n: number) => {
  const d = parseDay(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return isoDay(d)
}
const mondayOf = (iso: string) => addDays(iso, -((parseDay(iso).getUTCDay() + 6) % 7))
const dayLabel = (iso: string) => `${parseDay(iso).getUTCDate()} ${MOIS[parseDay(iso).getUTCMonth()]}`
const todayParis = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" })
const fmtParis = (ms: number) =>
  new Date(ms).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
// « 14:30 (America/New_York) » → « 14 h 30 »
const heureFr = (h: string | null) => {
  const m = /(\d{1,2})[:h ]\s*(\d{2})/.exec(txt(h))
  return m ? `${Number(m[1])} h ${m[2]}` : ""
}

function typeOf(it: Item): string {
  const t = txt(it.payload?.equipe_type)
  if (t) return t
  if (it.kind === "email") return "Email"
  if (it.canal === "bf") return "Black Friday"
  return txt(it.payload?.type) === "mécanique" ? "Offre" : "Site"
}
// Statut d'équipe écrit par Pilotage ; à défaut, déduit du statut interne.
function statutOf(it: Item): Statut {
  const s = txt(it.payload?.equipe_statut) as Statut
  if (["prevu", "pret", "envoye", "annule"].includes(s)) return s
  const raw = txt(it.payload?.statut).toLowerCase()
  if (/annul|écarté|arrêt/.test(raw)) return "annule"
  if (/envoy|en place|en ligne/.test(raw) && !/à envoyer/.test(raw)) return "envoye"
  if (/programm|brouillon prêt/.test(raw)) return "pret"
  return "prevu"
}
const STATUT: Record<Statut, { email: string; other: string; cls: string }> = {
  prevu: { email: "Prévu", other: "Prévu", cls: "st-prevu" },
  pret: { email: "Prêt", other: "Prêt", cls: "st-pret" },
  envoye: { email: "Envoyé", other: "En ligne", cls: "st-ok" },
  annule: { email: "Annulé", other: "Annulé", cls: "st-annule" },
}

function Denied({ reason }: { reason: "absent" | "invalide" | "expire" }) {
  return (
    <div className="mx-auto max-w-md p-6 pt-24 text-center">
      <h1 className="text-lg font-semibold text-zinc-900">{reason === "expire" ? "Ce lien a expiré" : "Lien invalide"}</h1>
      <p className="mt-2 text-sm text-zinc-600">Demandez un nouveau lien à Robin.</p>
    </div>
  )
}

const CSS = `
.eq{--bg:#ffffff;--page:#f6f6f4;--ink:#1c1c1a;--muted:#6b6b66;--line:#e3e2dd;--note-bg:#f3f1ea;
--prevu-bg:#f1f0ec;--prevu-ink:#55534d;--pret-bg:#e7effb;--pret-ink:#1f4f8f;--ok-bg:#e5f3ea;--ok-ink:#1d6b3a;
--annule-bg:transparent;--annule-ink:#8a8984;--bad-ink:#b3261e;--chip:#efeee9;
background:var(--page);color:var(--ink);min-height:100vh}
@media (prefers-color-scheme: dark){.eq{--bg:#1d1d1b;--page:#141413;--ink:#ecebe6;--muted:#a3a29c;--line:#34332f;--note-bg:#2a2925;
--prevu-bg:#2b2a27;--prevu-ink:#c9c7c0;--pret-bg:#1d2b40;--pret-ink:#9ec1f0;--ok-bg:#183323;--ok-ink:#8fd3a6;
--annule-ink:#8f8e88;--bad-ink:#f2a39c;--chip:#2b2a27}}
.eq .st{display:inline-flex;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;white-space:nowrap}
.eq .st-prevu{background:var(--prevu-bg);color:var(--prevu-ink)}
.eq .st-pret{background:var(--pret-bg);color:var(--pret-ink)}
.eq .st-ok{background:var(--ok-bg);color:var(--ok-ink)}
.eq .st-annule{border:1px solid var(--line);color:var(--annule-ink);text-decoration:line-through}
`

export default async function SharedCalendarPage({ searchParams }: { searchParams: { t?: string | string[] } }) {
  const t = Array.isArray(searchParams.t) ? searchParams.t[0] : searchParams.t
  const check = verifyShareToken("calendar", t)
  if (!check.ok) return <Denied reason={check.reason} />
  const token = t as string

  const supabase = createServiceClient()
  const [{ data, error }, { data: fb }] = await Promise.all([
    supabase
      .from("marketing_plan_items")
      .select("id, market, kind, canal, date_start, heure, payload, preview_url, updated_at")
      .eq("active", true)
      .eq("payload->>equipe_visible", "true")
      .order("date_start", { ascending: true, nullsFirst: false }),
    supabase
      .from("marketing_plan_reviews")
      .select("item_id, decision, comment, reviewer_email, created_at")
      .eq("reviewer_email", SHARED_AUTHOR)
      .order("created_at", { ascending: true })
      .limit(3000),
  ])
  if (error) {
    return <div className="p-6 text-sm text-red-700">Le planning n&apos;a pas pu être chargé. Réessayez dans un instant.</div>
  }
  const shared = foldShared((fb || []) as FeedbackRow[])
  const items = (data || []) as Item[]
  const today = todayParis()
  const from = addDays(today, -7) // on montre aussi ce qui est parti la semaine passée
  const lastUpdate = items.reduce((m, i) => (i.updated_at && i.updated_at > m ? i.updated_at : m), "")
  const empty: SharedState = { validated: null, notes: [] }

  return (
    <div className="eq">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Talika · planning de l&apos;équipe</p>
          <h1 className="text-2xl font-bold">Ce qui part chez les clientes</h1>
          <p className="text-sm text-[var(--muted)]">
            Emails, offres et site, pays par pays, de la semaine passée au Black Friday. Pour chaque ligne : ce que les clientes
            voient, et où on en est. Vous pouvez valider une ligne ou laisser une note pour Robin.
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--muted)]">
            <li className="flex items-center gap-1.5"><span className="st st-prevu">Prévu</span> pas encore préparé</li>
            <li className="flex items-center gap-1.5"><span className="st st-pret">Prêt</span> préparé, pas encore parti</li>
            <li className="flex items-center gap-1.5"><span className="st st-ok">Envoyé / En ligne</span></li>
            <li className="flex items-center gap-1.5"><span className="st st-annule">Annulé</span></li>
          </ul>
          <p className="text-xs text-[var(--muted)]">
            {lastUpdate && <>Mis à jour le {fmtParis(Date.parse(lastUpdate))}. </>}
            Lien valable jusqu&apos;au {fmtParis(check.exp * 1000)} (heure de Paris).
          </p>
          <nav className="flex flex-wrap gap-2 pt-1" aria-label="Pays">
            {MARKETS.map((m) => (
              <a key={m.key} href={`#${m.key}`} className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm font-medium">
                {m.code} · {m.label}
              </a>
            ))}
          </nav>
        </header>

        {MARKETS.map((m) => {
          const mine = items.filter((i) => i.market === m.key)
          const fin = (i: Item) => txt(i.payload?.date_fin) || i.date_start || ""
          // « En ce moment » : offres et site en ligne sur une période qui couvre aujourd'hui.
          const now = mine.filter(
            (i) => i.kind === "operation" && i.date_start && i.date_start <= today && fin(i) >= today && fin(i) !== i.date_start && statutOf(i) === "envoye"
          )
          const nowIds = new Set(now.map((i) => i.id))
          const timeline = mine.filter((i) => !nowIds.has(i.id) && (!i.date_start || i.date_start >= from || fin(i) >= today))
          const weeks = new Map<string, Item[]>()
          for (const i of timeline) {
            const w = i.date_start ? mondayOf(i.date_start < from ? from : i.date_start) : "sans-date"
            weeks.set(w, [...(weeks.get(w) || []), i])
          }
          const thisWeek = mondayOf(today)
          return (
            <section key={m.key} id={m.key} className="scroll-mt-4 space-y-4">
              <div className="border-b border-[var(--line)] pb-2">
                <h2 className="text-xl font-semibold">
                  <span className="mr-2 rounded bg-[var(--chip)] px-1.5 py-0.5 text-sm font-bold">{m.code}</span>
                  {m.label}
                </h2>
                <p className="text-xs text-[var(--muted)]">Heures des emails : {m.tz}</p>
              </div>
              {!mine.length && <p className="text-sm text-[var(--muted)]">Rien de prévu pour l&apos;instant.</p>}
              {now.length > 0 && (
                <Group title="En ce moment sur le site">
                  {now.map((it) => <Row key={it.id} it={it} code={m.code} token={token} fb={shared[it.id] || empty} />)}
                </Group>
              )}
              {Array.from(weeks.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([w, list]) => (
                  <Group
                    key={w}
                    title={
                      w === "sans-date" ? "Sans date" : w === thisWeek ? "Cette semaine" : w < thisWeek ? "Semaine passée" : `Semaine du ${dayLabel(w)}`
                    }
                  >
                    {list.map((it) => <Row key={it.id} it={it} code={m.code} token={token} fb={shared[it.id] || empty} />)}
                  </Group>
                ))}
            </section>
          )
        })}
        <p className="pb-6 text-xs text-[var(--muted)]">
          Les validations et les notes arrivent chez Robin. Rien n&apos;est envoyé ni modifié chez les clientes depuis cette page.
        </p>
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-[var(--muted)]">{title}</h3>
      <ol className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--bg)]">{children}</ol>
    </div>
  )
}

function Row({ it, code, token, fb }: { it: Item; code: string; token: string; fb: SharedState }) {
  const p = it.payload || {}
  const st = STATUT[statutOf(it)]
  const isEmail = it.kind === "email"
  const d = it.date_start ? parseDay(it.date_start) : null
  const fin = txt(p.date_fin)
  const preview = isEmail ? publicAsset(it.preview_url) : null
  const titre = txt(p.equipe_titre)
  const phrase = txt(p.equipe_phrase)
  const pour = txt(p.equipe_pour)
  return (
    <li className="grid grid-cols-[52px_minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[60px_minmax(0,1fr)_96px]">
      <div className="leading-tight">
        {d ? (
          <>
            <div className="text-xs uppercase text-[var(--muted)]">{JOURS[d.getUTCDay()]}</div>
            <div className="text-xl font-bold">{d.getUTCDate()}</div>
            <div className="text-xs text-[var(--muted)]">{MOIS[d.getUTCMonth()]}</div>
            {isEmail && heureFr(it.heure) && <div className="mt-1 text-xs font-medium">{heureFr(it.heure)}</div>}
            {!isEmail && fin && fin !== it.date_start && <div className="mt-1 text-[11px] text-[var(--muted)]">→ {dayLabel(fin)}</div>}
          </>
        ) : (
          <div className="text-xs text-[var(--muted)]">À dater</div>
        )}
      </div>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-[var(--chip)] px-1.5 py-0.5 text-[11px] font-bold">{code}</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">{typeOf(it)}</span>
          <span className={`st ${st.cls}`}>{isEmail ? st.email : st.other}</span>
        </div>
        <div className="font-semibold leading-snug break-words">{titre}</div>
        {phrase && <p className="text-sm leading-relaxed break-words">{phrase}</p>}
        {pour && <p className="text-sm text-[var(--muted)] break-words">Pour : {pour}.</p>}
        <Feedback token={token} itemId={it.id} initial={fb} />
      </div>
      {preview && (
        <a
          href={preview}
          target="_blank"
          rel="noopener noreferrer"
          className="col-span-2 block h-32 w-24 overflow-hidden rounded-md border border-[var(--line)] sm:col-span-1 sm:h-36 sm:w-full"
          aria-label={`Voir l'email : ${titre}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={`Aperçu de l'email : ${titre}`} className="w-full" loading="lazy" />
        </a>
      )}
    </li>
  )
}
