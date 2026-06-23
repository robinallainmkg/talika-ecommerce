"use client"

import { useEffect, useState } from "react"
import { formatCurrency } from "@/lib/utils"
import { MONTHS_FULL } from "@/components/influence/month-tabs"
import { X, Mail, Phone, ExternalLink, FileText, Loader2, Instagram, Music2, ShoppingBag } from "lucide-react"

interface Drawer { influencerId: string | null; onClose: () => void }

type Code = { id: string; code: string; is_active: boolean }
type MonthAmt = { year: number; month: number; amount: number }
type Invoice = { id: string; year: number; month: number; kind: string; amount: number | null; file_name: string }
type Content = { id: string; type: string | null; platform: string | null; url: string | null; title: string | null; posted_at: string | null }
type Order = { date: string; amount: number; products: string[]; discount_code: string }
type Product = { title: string; quantity: number; revenue: number; orders: number }

interface Detail {
  influencer: {
    id: string; name: string; instagram_handle: string | null; tiktok_handle: string | null
    email: string | null; phone: string | null; tier: string | null; category: string | null
    status: string | null; billing_name: string | null; commission_rate: number | null
    metadata: Record<string, unknown> | null; influencer_codes: Code[]
  }
  fixedFees: MonthAmt[]; commissions: MonthAmt[]; invoices: Invoice[]; content: Content[]
  lastOrders: Order[]; products: Product[]
  stats: { totalRevenue: number; totalOrders: number; totalCost: number; roas: number; totalCommissions: number; totalFixedFees: number }
}

const periodLabel = (y: number, m: number) => `${MONTHS_FULL[m - 1]} ${y}`

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="border-t border-zinc-100 px-5 py-4">
      <h3 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {title}{count != null && <span className="rounded-full bg-zinc-100 px-1.5 text-[10px] text-zinc-500">{count}</span>}
      </h3>
      {children}
    </div>
  )
}

export function InfluencerDrawer({ influencerId, onClose }: Drawer) {
  const [data, setData] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!influencerId) { setData(null); return }
    setLoading(true)
    fetch(`/api/influencers/${influencerId}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => setData(j.error ? null : j)).finally(() => setLoading(false))
  }, [influencerId])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    if (influencerId) window.addEventListener("keydown", onEsc)
    return () => window.removeEventListener("keydown", onEsc)
  }, [influencerId, onClose])

  async function viewInvoice(id: string) {
    const res = await fetch("/api/influencers/invoices", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    })
    const json = await res.json()
    if (json.url) window.open(json.url, "_blank")
  }

  if (!influencerId) return null
  const inf = data?.influencer
  const meta = (inf?.metadata || {}) as Record<string, unknown>
  const followers = meta.followers ?? meta.followers_count ?? null
  const photo = (meta.photo_url ?? meta.avatar ?? meta.image) as string | undefined

  // Collabs = coût mensuel (forfait + commission fusionnés par mois)
  const byMonth: Record<string, { year: number; month: number; fee: number; comm: number }> = {}
  for (const f of data?.fixedFees || []) { const k = `${f.year}-${f.month}`; (byMonth[k] ??= { year: f.year, month: f.month, fee: 0, comm: 0 }).fee += Number(f.amount || 0) }
  for (const c of data?.commissions || []) { const k = `${c.year}-${c.month}`; (byMonth[k] ??= { year: c.year, month: c.month, fee: 0, comm: 0 }).comm += Number(c.amount || 0) }
  const collabs = Object.values(byMonth).sort((a, b) => b.year - a.year || b.month - a.month)

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl">
        {loading || !inf ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
          </div>
        ) : (
          <>
            {/* En-tête */}
            <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-zinc-100 bg-white px-5 py-4">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-lg font-semibold text-white">
                  {inf.name?.[0]?.toUpperCase() || "?"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold text-zinc-900">{inf.name}</h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                  {inf.instagram_handle && (
                    <a href={`https://instagram.com/${inf.instagram_handle.replace("@", "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-zinc-900">
                      <Instagram className="h-3.5 w-3.5" />{inf.instagram_handle}
                    </a>
                  )}
                  {inf.tiktok_handle && (
                    <a href={`https://tiktok.com/@${inf.tiktok_handle.replace("@", "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-zinc-900">
                      <Music2 className="h-3.5 w-3.5" />{inf.tiktok_handle}
                    </a>
                  )}
                  {followers != null && <span>{Number(followers).toLocaleString("fr-FR")} abonnés</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {inf.category && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">{inf.category}</span>}
                  {inf.tier && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">{inf.tier}</span>}
                  {inf.status && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">{inf.status}</span>}
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Contact */}
            {(inf.email || inf.phone || inf.billing_name) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 py-3 text-sm">
                {inf.email && <a href={`mailto:${inf.email}`} className="inline-flex items-center gap-1.5 text-zinc-600 hover:text-zinc-900"><Mail className="h-4 w-4 text-zinc-400" />{inf.email}</a>}
                {inf.phone && <span className="inline-flex items-center gap-1.5 text-zinc-600"><Phone className="h-4 w-4 text-zinc-400" />{inf.phone}</span>}
                {inf.billing_name && <span className="inline-flex items-center gap-1.5 text-zinc-500"><FileText className="h-4 w-4 text-zinc-400" />{inf.billing_name}</span>}
              </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-4 gap-px border-y border-zinc-100 bg-zinc-100 text-center">
              {[
                ["CA via code", formatCurrency(data!.stats.totalRevenue)],
                ["Coût", formatCurrency(data!.stats.totalCost)],
                ["ROI", data!.stats.roas > 0 ? `${data!.stats.roas.toFixed(1)}x` : "—"],
                ["Cmd", String(data!.stats.totalOrders)],
              ].map(([l, v]) => (
                <div key={l} className="bg-white px-2 py-2.5">
                  <div className="text-sm font-semibold text-zinc-900">{v}</div>
                  <div className="text-[10px] uppercase text-zinc-400">{l}</div>
                </div>
              ))}
            </div>

            {/* Collabs (coût mensuel) */}
            <Section title="Collabs (coût par mois)" count={collabs.length}>
              {collabs.length === 0 ? <p className="text-sm text-zinc-400">Aucune collab enregistrée.</p> : (
                <div className="space-y-1">
                  {collabs.map((c) => (
                    <div key={`${c.year}-${c.month}`} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600">{periodLabel(c.year, c.month)}</span>
                      <span className="flex items-center gap-2">
                        {c.fee > 0 && <span className="text-zinc-500">forfait {formatCurrency(c.fee)}</span>}
                        {c.comm > 0 && <span className="text-zinc-500">comm {formatCurrency(c.comm)}</span>}
                        <span className="font-medium text-zinc-900">{formatCurrency(c.fee + c.comm)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Factures */}
            <Section title="Factures" count={data!.invoices.length}>
              {data!.invoices.length === 0 ? <p className="text-sm text-zinc-400">Aucune facture jointe.</p> : (
                <div className="space-y-1">
                  {data!.invoices.map((iv) => (
                    <button key={iv.id} onClick={() => viewInvoice(iv.id)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-zinc-50">
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                        <span className="truncate text-zinc-600">{periodLabel(iv.year, iv.month)} · {iv.file_name}</span>
                      </span>
                      <span className="ml-2 inline-flex shrink-0 items-center gap-1.5">
                        {iv.amount != null && <span className="text-zinc-500">{formatCurrency(iv.amount)}</span>}
                        <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Section>

            {/* Posts / contenus */}
            <Section title="Posts" count={data!.content.length}>
              {data!.content.length === 0 ? <p className="text-sm text-zinc-400">Aucun post enregistré (à ajouter au fil de l&apos;eau).</p> : (
                <div className="space-y-1">
                  {data!.content.map((p) => (
                    <a key={p.id} href={p.url || "#"} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50">
                      <span className="truncate text-zinc-600">{p.posted_at || "—"} · {p.platform || ""} {p.title || p.type || ""}</span>
                      {p.url && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
                    </a>
                  ))}
                </div>
              )}
            </Section>

            {/* Dernières ventes via son code */}
            {data!.lastOrders.length > 0 && (
              <Section title="Dernières ventes via son code" count={data!.lastOrders.length}>
                <div className="space-y-1">
                  {data!.lastOrders.slice(0, 6).map((o, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="truncate text-zinc-600">{new Date(o.date).toLocaleDateString("fr-FR")} · <span className="font-mono text-[11px] text-zinc-400">{o.discount_code}</span></span>
                      <span className="font-medium text-zinc-900">{formatCurrency(o.amount)}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Top produits */}
            {data!.products.length > 0 && (
              <Section title="Top produits vendus" count={data!.products.length}>
                <div className="space-y-1">
                  {data!.products.slice(0, 5).map((p) => (
                    <div key={p.title} className="flex items-center justify-between text-sm">
                      <span className="inline-flex items-center gap-1.5 truncate text-zinc-600"><ShoppingBag className="h-3.5 w-3.5 shrink-0 text-zinc-300" />{p.title}</span>
                      <span className="ml-2 shrink-0 text-zinc-500">{p.quantity}× · {formatCurrency(p.revenue)}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Codes promo */}
            <Section title="Codes promo" count={inf.influencer_codes?.length || 0}>
              <div className="flex flex-wrap gap-1">
                {(inf.influencer_codes || []).map((c) => (
                  <span key={c.id} className={`rounded px-1.5 py-0.5 text-[11px] font-mono ${c.is_active ? "bg-zinc-100 text-zinc-600" : "bg-zinc-50 text-zinc-300 line-through"}`}>{c.code}</span>
                ))}
                {(inf.influencer_codes || []).length === 0 && <span className="text-sm text-zinc-400">Aucun code.</span>}
              </div>
            </Section>
          </>
        )}
      </aside>
    </>
  )
}
