"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Loader2, X, FileText, Check, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"

// Planning marketing (emails, Black Friday, site, pubs Meta) préparé par Pilotage (Claude Code).
// L'équipe consulte chaque maquette et donne son avis : « Valider » ou « Envoyer mes retours ».
// Rien ne part d'ici : Pilotage lit les avis et prépare les brouillons dans Klaviyo / Spoks.

type Market = "fr" | "uk" | "us"
type Lane = "tout" | "emails" | "site" | "meta" | "bf"

interface Review {
  item_id: string
  decision: "valide" | "retours"
  comment: string | null
  reviewer_email: string | null
  created_at: string
  processed: boolean
  processed_note: string | null
}

interface PlanItem {
  id: string
  market: Market
  kind: "email" | "operation"
  canal: string | null
  date_start: string | null
  date_label: string | null
  heure: string | null
  title: string
  payload: Record<string, any>
  preview_url: string | null
  pdf_url: string | null
  review: Review | null
  // Notes et validations du lien partagé /share/calendar (cf. src/lib/plan-feedback.ts).
  shared: { validated: { at: string } | null; notes: { at: string; text: string }[] } | null
}

function SharedFeedback({ item }: { item: PlanItem }) {
  const s = item.shared
  if (!s || (!s.validated && !s.notes.length)) return null
  return (
    <div className="mt-1 space-y-1 rounded-md bg-sky-50 px-2.5 py-1.5 text-sm text-sky-900">
      {s.validated && <p>✓ Validé par Sophie (lien partagé) le {fmtWhen(s.validated.at)}</p>}
      {s.notes.map((n) => (
        <p key={n.at} className="break-words">
          Note de Sophie (lien partagé), {fmtWhen(n.at)} : {n.text}
        </p>
      ))}
    </div>
  )
}

const MARKETS: { key: Market; label: string; tz: string; tool: string }[] = [
  { key: "fr", label: "France", tz: "Paris", tool: "Klaviyo" },
  { key: "uk", label: "Royaume-Uni", tz: "Londres", tool: "Spoks" },
  { key: "us", label: "États-Unis", tz: "New York", tool: "Spoks" },
]

const LANES: { key: Lane; label: string }[] = [
  { key: "tout", label: "Tout" },
  { key: "emails", label: "Emails" },
  { key: "site", label: "Site" },
  { key: "meta", label: "Pubs Meta" },
  { key: "bf", label: "Black Friday" },
]

const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."]
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]

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
const label = (d: Date) => `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })

// Statut affiché : l'avis de l'équipe passe avant le statut écrit par Pilotage.
function statusOf(it: PlanItem): { tone: "ok" | "todo" | "idea" | "muted"; text: string } {
  const r = it.review
  const isOp = it.kind === "operation"
  if (r?.decision === "valide") return { tone: "ok", text: isOp ? "D'accord" : "Validé" }
  if (r?.decision === "retours") return { tone: "todo", text: isOp ? "Réponse envoyée" : "Retours envoyés" }
  const s = String(it.payload?.statut || "").toLowerCase()
  if (isOp) {
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

function Chip({ tone, text }: { tone: string; text: string }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE[tone])}>{text}</span>
}

export default function PlanningMarketingPage() {
  const [items, setItems] = useState<PlanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [market, setMarket] = useState<Market>("fr")
  const [lane, setLane] = useState<Lane>("tout")
  const [open, setOpen] = useState<PlanItem | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/calendar/plan", { cache: "no-store" })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setItems(json.items || [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du chargement")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const mine = useMemo(() => items.filter((i) => i.market === market), [items, market])
  const emails = mine.filter((i) => i.kind === "email")
  const ops = mine.filter((i) => i.kind === "operation")
  const bf = ops.filter((o) => o.canal === "bf")

  // Fenêtre : du premier email jusqu'au 1er décembre (fin du Black Friday), semaine par semaine.
  const weeks = useMemo(() => {
    const dated = mine.filter((i) => i.date_start)
    if (!dated.length) return [] as { start: string; end: string }[]
    const first = mondayOf(parseDay(dated.map((i) => i.date_start!).sort()[0]))
    const lastIso = [...dated.map((i) => i.date_start!), "2026-12-01"].sort().slice(-1)[0]
    const out: { start: string; end: string }[] = []
    for (const w = new Date(first); isoDay(w) <= lastIso; w.setUTCDate(w.getUTCDate() + 7)) {
      const e = new Date(w)
      e.setUTCDate(e.getUTCDate() + 6)
      out.push({ start: isoDay(w), end: isoDay(e) })
    }
    return out
  }, [mine])

  const toValidate = (m: Market) =>
    items.filter((i) => i.market === m && i.kind === "email" && statusOf(i).text === "Maquette à valider").length

  const onSaved = (r: Review) => {
    setItems((prev) => prev.map((i) => (i.id === r.item_id ? { ...i, review: r } : i)))
    setOpen((o) => (o && o.id === r.item_id ? { ...o, review: r } : o))
  }

  const showMail = lane === "tout" || lane === "emails"
  const showSite = lane === "tout" || lane === "site"
  const showMeta = lane === "tout" || lane === "meta"
  const tz = MARKETS.find((m) => m.key === market)!

  return (
    <div>
      <Header title="Planning marketing" subtitle="Emails, site, pubs Meta et Black Friday : voir chaque maquette et donner son avis" />

      <div className="space-y-5 p-4 sm:p-6">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <div className="flex flex-wrap gap-2">
          {MARKETS.map((m) => {
            const n = toValidate(m.key)
            return (
              <button
                key={m.key}
                onClick={() => setMarket(m.key)}
                className={cn(
                  "rounded-lg border px-4 py-2 text-left",
                  market === m.key ? "border-blue-600 bg-blue-50" : "border-zinc-200 bg-white hover:bg-zinc-50"
                )}
              >
                <div className="text-sm font-semibold text-zinc-900">{m.label}</div>
                <div className="text-xs text-zinc-500">{n ? `${n} à valider` : "rien à valider"}</div>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {LANES.map((l) => (
            <button
              key={l.key}
              onClick={() => setLane(l.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                lane === l.key ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              )}
            >
              {l.label}
            </button>
          ))}
        </div>

        <p className="text-sm text-zinc-500">
          {tz.tool} · heures de {tz.tz}. Rien n&apos;est programmé ni mis en ligne sans validation.
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement du planning…
          </div>
        )}

        {!loading && !mine.length && (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500">
            Le planning de ce pays n&apos;est pas encore publié ici.
          </div>
        )}

        {(lane === "tout" || lane === "bf") && bf.length > 0 && (
          <details open={lane === "bf"} className="rounded-xl border border-zinc-200 bg-white p-4">
            <summary className="cursor-pointer">
              <span className="text-xs font-semibold uppercase tracking-wider text-red-600">Black Friday</span>
              <span className="ml-2 font-semibold text-zinc-900">Le calendrier jusqu&apos;au 1er décembre</span>
              <span className="ml-2 text-sm text-zinc-500">({bf.length} étapes)</span>
            </summary>
            <ol className="mt-3 divide-y divide-zinc-100">
              {bf.map((o) => (
                <OpRow key={o.id} item={o} onOpen={setOpen} />
              ))}
            </ol>
          </details>
        )}

        {lane !== "bf" &&
          weeks.map((w, idx) => {
            const inWeek = (i: PlanItem) => !!i.date_start && i.date_start >= w.start && i.date_start <= w.end
            const wkMails = showMail ? emails.filter(inWeek) : []
            const wkSite = showSite ? ops.filter((o) => o.canal === "site" && inWeek(o)) : []
            const wkMeta = showMeta ? ops.filter((o) => o.canal === "meta" && inWeek(o)) : []
            if (!wkMails.length && !wkSite.length && !wkMeta.length) return null
            const nSends = emails.filter(inWeek).filter((i) => !["Écarté", "À caler"].includes(statusOf(i).text)).length
            return (
              <section key={w.start} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold text-zinc-900">
                    {idx === 0 ? "Cette semaine" : `Semaine du ${label(parseDay(w.start))}`}
                  </h2>
                  {showMail && (
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs", nSends >= 2 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
                      {nSends} envoi{nSends > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {wkMails.map((m) => (
                  <MailCard key={m.id} item={m} onOpen={setOpen} />
                ))}
                {wkSite.length > 0 && (
                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Sur le site</h3>
                    <ol className="divide-y divide-zinc-100">
                      {wkSite.map((o) => (
                        <OpRow key={o.id} item={o} onOpen={setOpen} />
                      ))}
                    </ol>
                  </div>
                )}
                {wkMeta.length > 0 && (
                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Pubs Meta</h3>
                    <ol className="divide-y divide-zinc-100">
                      {wkMeta.map((o) => (
                        <OpRow key={o.id} item={o} onOpen={setOpen} />
                      ))}
                    </ol>
                  </div>
                )}
              </section>
            )
          })}

        {showMail && emails.filter((e) => !e.date_start).map((m) => <MailCard key={m.id} item={m} onOpen={setOpen} />)}
      </div>

      {open && <ReviewModal item={open} onClose={() => setOpen(null)} onSaved={onSaved} />}
    </div>
  )
}

function MailCard({ item, onOpen }: { item: PlanItem; onOpen: (i: PlanItem) => void }) {
  const st = statusOf(item)
  const p = item.payload || {}
  const d = item.date_start ? parseDay(item.date_start) : null
  return (
    <article className="grid grid-cols-[64px_minmax(0,1fr)] gap-4 rounded-xl border border-zinc-200 bg-white p-4 md:grid-cols-[80px_minmax(0,1fr)_150px]">
      <div className="leading-tight">
        {d ? (
          <>
            <div className="text-xs uppercase text-zinc-500">{JOURS[d.getUTCDay()]}</div>
            <div className="text-2xl font-bold text-zinc-900">{d.getUTCDate()}</div>
            <div className="text-xs text-zinc-500">{MOIS[d.getUTCMonth()]}</div>
            {item.heure && <div className="mt-1 font-mono text-xs text-zinc-700">{item.heure.replace(/\s*\(.*\)/, "")}</div>}
          </>
        ) : (
          <div className="text-xs text-zinc-500">{item.date_label}</div>
        )}
      </div>
      <div className="min-w-0 space-y-1.5">
        <Chip tone={st.tone} text={st.text} />
        <h3 className="font-semibold leading-snug text-zinc-900">{item.title}</h3>
        {p.preheader && <p className="text-sm text-zinc-500">{p.preheader}</p>}
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
          {p.cible && (<><dt className="text-zinc-500">Cible</dt><dd className="break-words">{p.cible}</dd></>)}
          {p.produits && (<><dt className="text-zinc-500">Produits</dt><dd className="break-words">{Array.isArray(p.produits) ? p.produits.join(" · ") : p.produits}</dd></>)}
          {p.offre && (<><dt className="text-zinc-500">Offre</dt><dd className="break-words">{p.offre}</dd></>)}
          {p.objectif && (<><dt className="text-zinc-500">But</dt><dd className="break-words">{p.objectif}</dd></>)}
        </dl>
        {item.review?.comment && (
          <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-sm text-amber-800">
            Retours de {item.review.reviewer_email?.split("@")[0] || "l'équipe"} : {item.review.comment}
          </p>
        )}
        <SharedFeedback item={item} />
      </div>
      <div className="col-span-2 flex items-start gap-3 md:col-span-1 md:flex-col">
        {item.preview_url ? (
          <>
            <button onClick={() => onOpen(item)} className="h-40 w-28 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 md:h-48 md:w-full" aria-label="Voir l'email en entier">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.preview_url} alt={`Aperçu : ${item.title}`} className="w-full" loading="lazy" />
            </button>
            <Button size="sm" variant={item.review ? "outline" : "primary"} onClick={() => onOpen(item)}>
              {item.review ? (item.review.decision === "valide" ? "Validé · revoir" : "Revoir") : "À valider"}
            </Button>
          </>
        ) : (
          <span className="rounded-md border border-dashed border-zinc-300 p-3 text-center text-xs text-zinc-500">
            {st.tone === "ok" ? "Déjà dans l'outil" : "Pas de maquette"}
          </span>
        )}
      </div>
    </article>
  )
}

function OpRow({ item, onOpen }: { item: PlanItem; onOpen: (i: PlanItem) => void }) {
  const st = statusOf(item)
  const p = item.payload || {}
  const decide = /décider|decider/i.test(String(p.statut || ""))
  return (
    <li className="grid grid-cols-[80px_minmax(0,1fr)] gap-3 py-2.5 sm:grid-cols-[96px_minmax(0,1fr)_auto]">
      <span className="pt-0.5 font-mono text-xs text-zinc-500">{item.date_label || item.date_start}</span>
      <div className="min-w-0">
        <div className="font-medium text-zinc-900">{item.title}</div>
        {p.type && <div className="text-xs text-zinc-500">{p.type}</div>}
        <div className="text-sm text-zinc-600">
          {p.detail}
          {p.lien && (
            <>
              {" "}
              <a href={p.lien} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Ouvrir</a>
            </>
          )}
        </div>
        {item.review?.comment && (
          <p className="mt-1 rounded-md bg-amber-50 px-2.5 py-1.5 text-sm text-amber-800">Réponse : {item.review.comment}</p>
        )}
        <SharedFeedback item={item} />
      </div>
      <div className="col-start-2 flex items-center gap-2 sm:col-start-auto sm:flex-col sm:items-end">
        <Chip tone={st.tone} text={st.text} />
        {p.qui && <span className="text-xs text-zinc-500">{p.qui}</span>}
        {(decide || item.review) && (
          <Button size="sm" variant={item.review ? "outline" : "primary"} onClick={() => onOpen(item)}>
            {item.review ? "Revoir" : "Décider"}
          </Button>
        )}
      </div>
    </li>
  )
}

function ReviewModal({ item, onClose, onSaved }: { item: PlanItem; onClose: () => void; onSaved: (r: Review) => void }) {
  const isOp = item.kind === "operation"
  const [comment, setComment] = useState(item.review?.comment || "")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const p = item.payload || {}

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const save = async (decision: "valide" | "retours") => {
    if (decision === "retours" && !comment.trim()) {
      setMsg(isOp ? "Écrivez votre réponse avant de l'envoyer." : "Écrivez vos retours avant de les envoyer.")
      return
    }
    setBusy(true)
    setMsg("Enregistrement…")
    try {
      const res = await fetch("/api/calendar/plan/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id, decision, comment }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || "L'enregistrement n'a pas abouti")
      onSaved(json.review)
      setMsg(
        isOp
          ? decision === "valide" ? "Noté : on fait comme proposé." : "Réponse envoyée."
          : decision === "valide" ? "Validé. Le brouillon sera préparé dans l'outil." : "Retours envoyés. La maquette sera refaite."
      )
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "L'enregistrement n'a pas abouti. Réessayez.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-3 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        className="flex max-h-full w-full max-w-[480px] flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-3">
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase text-zinc-500">
              {item.date_label || item.date_start} {item.heure ? `· ${item.heure.replace(/\s*\(.*\)/, "")}` : ""} · {item.market.toUpperCase()}
            </div>
            <div className="font-semibold leading-snug text-zinc-900">{item.title}</div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {item.preview_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.preview_url} alt={`Maquette : ${item.title}`} className="w-full" />
          )}
          {isOp && <p className="p-4 text-[15px] leading-relaxed text-zinc-700">{p.detail}</p>}
        </div>

        <div className="space-y-2 border-t border-zinc-200 p-3">
          {item.review && (
            <p className="rounded-md bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-600">
              {item.review.decision === "valide" ? (isOp ? "D'accord" : "Validé") : isOp ? "Réponse envoyée" : "Retours envoyés"} par{" "}
              {item.review.reviewer_email || "l'équipe"} le {fmtWhen(item.review.created_at)}
              {item.review.processed ? ` · traité${item.review.processed_note ? ` : ${item.review.processed_note}` : ""}` : ""}
            </p>
          )}
          <label htmlFor="plan-comment" className="text-xs text-zinc-500">
            {isOp ? "Votre réponse (ce que vous décidez, ou une autre option)" : "Vos retours (texte, visuel, offre, date…)"}
          </label>
          <textarea
            id="plan-comment"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full resize-y rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={isOp ? "Ex. : oui mais à partir du 1er/11" : "Ex. : changer le visuel, décaler au jeudi"}
          />
          <div className="flex flex-wrap gap-2">
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => save("valide")}>
              <Check className="h-4 w-4" />
              {isOp ? "D'accord avec la proposition" : "Valider cet email"}
            </Button>
            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => save("retours")}>
              <MessageSquare className="h-4 w-4" />
              {isOp ? "Envoyer ma réponse" : "Envoyer mes retours"}
            </Button>
          </div>
          {msg && <p className="text-xs text-zinc-600" aria-live="polite">{msg}</p>}
          {item.pdf_url && (
            <a href={item.pdf_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 underline">
              <FileText className="h-3.5 w-3.5" /> Ouvrir le PDF
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
