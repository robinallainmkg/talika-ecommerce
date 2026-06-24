"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { cn, formatCurrency } from "@/lib/utils"
import { STAGES, type Stage } from "@/lib/influence/pipeline"
import { InfluencerDrawer } from "@/components/influence/influencer-drawer"
import { ArrowLeft, Plus, RefreshCw, X, Instagram, Megaphone, UserPlus, Trash2 } from "lucide-react"

const inp = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"

interface Campaign { id: string; name: string; theme: string | null; status: string; collab_count: number }
interface Collab {
  id: string; influencer_id: string; name: string; instagram_handle: string | null
  niche: string | null; followers: number | null; stage: Stage; owner: string | null
  next_action: string | null; next_action_date: string | null
  comp_type: string | null; comp_amount: number | null
}
interface InfLite { id: string; name: string }

function CardPhoto({ handle, name }: { handle: string | null; name: string }) {
  const [err, setErr] = useState(false)
  const h = handle?.replace(/^@/, "")
  if (h && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`https://unavatar.io/instagram/${h}?fallback=false`} alt="" onError={() => setErr(true)} className="h-8 w-8 shrink-0 rounded-full object-cover" />
  }
  return <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">{name?.[0]?.toUpperCase() || "?"}</div>
}

export default function PipelinePage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selected, setSelected] = useState<string>("")
  const [collabs, setCollabs] = useState<Collab[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [showCampaign, setShowCampaign] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [allInf, setAllInf] = useState<InfLite[]>([])

  const loadCampaigns = useCallback(async () => {
    const res = await fetch("/api/influencers/campaigns", { cache: "no-store" })
    const data = await res.json()
    const list: Campaign[] = data.campaigns || []
    setCampaigns(list)
    setSelected((cur) => cur || list[0]?.id || "")
  }, [])

  const loadCollabs = useCallback(async (campaign: string) => {
    if (!campaign) { setCollabs([]); setLoading(false); return }
    setLoading(true)
    const res = await fetch(`/api/influencers/pipeline?campaign=${campaign}`, { cache: "no-store" })
    const data = await res.json()
    setCollabs(data.collabs || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadCampaigns() }, [loadCampaigns])
  useEffect(() => { loadCollabs(selected) }, [selected, loadCollabs])
  useEffect(() => {
    fetch("/api/influencers?year=2026", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAllInf((d.influencers || []).map((i: { id: string; name: string }) => ({ id: i.id, name: i.name })).sort((a: InfLite, b: InfLite) => a.name.localeCompare(b.name))))
      .catch(() => {})
  }, [])

  async function moveStage(id: string, stage: Stage) {
    setCollabs((prev) => prev.map((c) => (c.id === id ? { ...c, stage } : c)))
    await fetch("/api/influencers/pipeline", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, stage }),
    })
    loadCampaigns()
  }

  async function removeCollab(id: string) {
    if (!confirm("Retirer cette influenceuse de la campagne ?")) return
    setCollabs((prev) => prev.filter((c) => c.id !== id))
    await fetch(`/api/influencers/pipeline?id=${id}`, { method: "DELETE" })
    loadCampaigns()
  }

  const isOverdue = (d: string | null) => d != null && new Date(d) < new Date(new Date().toDateString())

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/influencers" className="mb-1 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
              <ArrowLeft className="h-4 w-4" /> Influence
            </Link>
            <h1 className="text-2xl font-semibold text-zinc-900">Pipeline de prospection</h1>
            <p className="text-sm text-zinc-500">Sourcer → contacter → négocier → confirmer → activer, par campagne.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={selected} onChange={(e) => setSelected(e.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
              {campaigns.length === 0 && <option value="">Aucune campagne</option>}
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.collab_count})</option>)}
            </select>
            <button onClick={() => setShowCampaign(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
              <Megaphone className="h-4 w-4" /> Campagne
            </button>
            {selected && (
              <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">
                <UserPlus className="h-4 w-4" /> Ajouter
              </button>
            )}
            <button onClick={() => loadCollabs(selected)} className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-600 hover:bg-zinc-50" title="Rafraîchir">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {campaigns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
            Crée une première campagne (ex. « Lancement Mascara XXL ») pour commencer à prospecter.
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {STAGES.map((stage) => {
              const cards = collabs.filter((c) => c.stage === stage.key)
              return (
                <div
                  key={stage.key}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragId) { moveStage(dragId, stage.key); setDragId(null) } }}
                  className="flex w-64 shrink-0 flex-col rounded-xl border border-zinc-200 bg-zinc-100/60"
                >
                  <div className="flex items-center justify-between px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <span>{stage.label}</span>
                    <span className="rounded-full bg-white px-1.5 text-[10px] text-zinc-500">{cards.length}</span>
                  </div>
                  <div className="flex min-h-[120px] flex-col gap-2 px-2 pb-2">
                    {cards.map((c) => (
                      <div
                        key={c.id}
                        draggable
                        onDragStart={() => setDragId(c.id)}
                        onClick={() => setDrawerId(c.influencer_id)}
                        className="group cursor-pointer rounded-lg border border-zinc-200 bg-white p-2.5 shadow-sm hover:border-zinc-300"
                      >
                        <div className="flex items-start gap-2">
                          <CardPhoto handle={c.instagram_handle} name={c.name} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-zinc-900">{c.name}</div>
                            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                              {c.instagram_handle && <span className="inline-flex items-center gap-0.5"><Instagram className="h-3 w-3" />{c.instagram_handle.replace(/^@/, "")}</span>}
                              {c.followers != null && <span>· {Number(c.followers).toLocaleString("fr-FR")}</span>}
                            </div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); removeCollab(c.id) }} className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500" title="Retirer">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          {c.niche && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">{c.niche}</span>}
                          {c.comp_amount != null && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">{formatCurrency(c.comp_amount)}</span>}
                        </div>
                        {c.next_action && (
                          <div className={cn("mt-1.5 text-[11px]", isOverdue(c.next_action_date) ? "text-red-600" : "text-zinc-500")}>
                            → {c.next_action}{c.next_action_date ? ` (${new Date(c.next_action_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })})` : ""}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showCampaign && <CampaignModal onClose={() => setShowCampaign(false)} onCreated={(id) => { setShowCampaign(false); loadCampaigns().then(() => setSelected(id)) }} />}
      {showAdd && selected && <AddModal campaignId={selected} allInf={allInf} inPipeline={new Set(collabs.map((c) => c.influencer_id))} onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); loadCollabs(selected); loadCampaigns() }} />}
      <InfluencerDrawer influencerId={drawerId} onClose={() => setDrawerId(null)} />
    </div>
  )
}

function CampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({ name: "", theme: "", objective: "", start_date: "", end_date: "", budget: "" })
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    const res = await fetch("/api/influencers/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    const data = await res.json()
    setSaving(false)
    if (data.campaign?.id) onCreated(data.campaign.id)
  }
  return (
    <Modal title="Nouvelle campagne" onClose={onClose}>
      <Field label="Nom *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Lancement Mascara XXL" className={inp} autoFocus /></Field>
      <Field label="Produit / thème"><input value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} className={inp} /></Field>
      <Field label="Objectif"><input value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} placeholder="Reach, ventes, contenu…" className={inp} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Début"><input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={inp} /></Field>
        <Field label="Fin"><input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={inp} /></Field>
      </div>
      <Field label="Budget (€)"><input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} className={inp} /></Field>
      <button onClick={save} disabled={saving || !form.name.trim()} className="mt-2 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">{saving ? "Création…" : "Créer la campagne"}</button>
    </Modal>
  )
}

function AddModal({ campaignId, allInf, inPipeline, onClose, onAdded }: { campaignId: string; allInf: InfLite[]; inPipeline: Set<string>; onClose: () => void; onAdded: () => void }) {
  const [tab, setTab] = useState<"existante" | "nouvelle">("existante")
  const [q, setQ] = useState("")
  const [np, setNp] = useState({ new_name: "", new_handle: "", new_niche: "", new_followers: "" })
  const [saving, setSaving] = useState(false)
  async function add(body: Record<string, unknown>) {
    setSaving(true)
    await fetch("/api/influencers/pipeline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaign_id: campaignId, ...body }) })
    setSaving(false); onAdded()
  }
  const filtered = allInf.filter((i) => !inPipeline.has(i.id) && i.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <Modal title="Ajouter à la campagne" onClose={onClose}>
      <div className="mb-3 flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm">
        <button onClick={() => setTab("existante")} className={cn("flex-1 rounded-md px-3 py-1.5 font-medium", tab === "existante" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}>Existante</button>
        <button onClick={() => setTab("nouvelle")} className={cn("flex-1 rounded-md px-3 py-1.5 font-medium", tab === "nouvelle" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}>Nouveau prospect</button>
      </div>
      {tab === "existante" ? (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une influenceuse…" className={cn(inp, "mb-2")} autoFocus />
          <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-200">
            {filtered.slice(0, 50).map((i) => (
              <button key={i.id} disabled={saving} onClick={() => add({ influencer_id: i.id })} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-50">
                {i.name} <Plus className="h-3.5 w-3.5 text-zinc-400" />
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-4 text-center text-sm text-zinc-400">Aucune (déjà toutes dans la campagne ?)</p>}
          </div>
        </>
      ) : (
        <>
          <Field label="Nom *"><input value={np.new_name} onChange={(e) => setNp({ ...np, new_name: e.target.value })} className={inp} autoFocus /></Field>
          <Field label="@instagram"><input value={np.new_handle} onChange={(e) => setNp({ ...np, new_handle: e.target.value })} placeholder="@handle (→ photo auto)" className={inp} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Niche"><input value={np.new_niche} onChange={(e) => setNp({ ...np, new_niche: e.target.value })} className={inp} /></Field>
            <Field label="Followers"><input type="number" value={np.new_followers} onChange={(e) => setNp({ ...np, new_followers: e.target.value })} className={inp} /></Field>
          </div>
          <button onClick={() => add(np)} disabled={saving || !np.new_name.trim()} className="mt-2 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">{saving ? "Ajout…" : "Créer + ajouter au pipeline"}</button>
        </>
      )}
    </Modal>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-600">{label}</label>
      {children}
    </div>
  )
}
