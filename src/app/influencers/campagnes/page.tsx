"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { cn, formatCurrency } from "@/lib/utils"
import { STAGES, type Stage } from "@/lib/influence/pipeline"
import { MONTH_NAMES } from "@/lib/influence/monthly-campaign"
import { InfluencerDrawer } from "@/components/influence/influencer-drawer"
import { Header } from "@/components/layout/header"
import { Plus, X, Instagram, Megaphone, UserPlus, Trash2, Pencil, RotateCw, Send } from "lucide-react"
import { OutreachCompose } from "@/components/influence/outreach-compose"
import { useMarket } from "@/components/layout/market-gate"

const inp = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"

interface Campaign {
  id: string; name: string; themes: string[]; year: number | null; month: number | null
  status: string; collab_count: number
  objective?: string | null; budget?: number | null; theme?: string | null
}
interface Collab {
  id: string; influencer_id: string; name: string; email: string | null; instagram_handle: string | null
  niche: string | null; followers: number | null; stage: Stage; owner: string | null
  next_action: string | null; next_action_date: string | null
  themes: string[]; fee: number; commission: number; commission_rate: number | null
  message_count: number; last_message_at: string | null; awaiting_reply: boolean
}
interface InfLite { id: string; name: string }

const cost = (c: Collab) => (c.fee || 0) + (c.commission || 0)

function CardPhoto({ handle, name }: { handle: string | null; name: string }) {
  const [err, setErr] = useState(false)
  const h = handle?.replace(/^@/, "")
  if (h && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`https://unavatar.io/instagram/${h}?fallback=false`} alt="" onError={() => setErr(true)} className="h-8 w-8 shrink-0 rounded-full object-cover" />
  }
  return <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">{name?.[0]?.toUpperCase() || "?"}</div>
}

export default function CampagnesPage() {
  const market = useMarket()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selected, setSelected] = useState<string>("")
  const [collabs, setCollabs] = useState<Collab[]>([])
  const [syncing, setSyncing] = useState(false)
  // Drawer unifié à onglets : clic sur la CARTE → onglet Chat, clic sur le NOM → onglet Profil.
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [drawerTab, setDrawerTab] = useState<"chat" | "profile">("profile")
  const [dragId, setDragId] = useState<string | null>(null)
  const [showCampaign, setShowCampaign] = useState(false)
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [allInf, setAllInf] = useState<InfLite[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [showCompose, setShowCompose] = useState(false)
  const toggleSel = (id: string) => setSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const loadCampaigns = useCallback(async () => {
    const res = await fetch(`/api/influencers/campaigns?market=${market}`, { cache: "no-store" })
    const data = await res.json()
    // Campagnes mensuelles d'abord, plus récentes en tête.
    const list: Campaign[] = (data.campaigns || []).sort((a: Campaign, b: Campaign) =>
      (b.year ?? 0) - (a.year ?? 0) || (b.month ?? 0) - (a.month ?? 0))
    setCampaigns(list)
    setSelected((cur) => (list.some((c) => c.id === cur) ? cur : list[0]?.id || ""))
  }, [market])

  const loadCollabs = useCallback(async (campaign: string) => {
    if (!campaign) { setCollabs([]); return }
    const res = await fetch(`/api/influencers/collabs?campaign=${campaign}`, { cache: "no-store" })
    const data = await res.json()
    setCollabs(data.collabs || [])
  }, [])

  useEffect(() => { loadCampaigns() }, [loadCampaigns])
  useEffect(() => { loadCollabs(selected); setSel(new Set()) }, [selected, loadCollabs])
  useEffect(() => {
    fetch(`/api/influencers?year=2026&market=${market}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAllInf((d.influencers || []).map((i: { id: string; name: string }) => ({ id: i.id, name: i.name })).sort((a: InfLite, b: InfLite) => a.name.localeCompare(b.name))))
      .catch(() => {})
  }, [market])

  const selectedCampaign = useMemo(() => campaigns.find((c) => c.id === selected), [campaigns, selected])
  const palette = useMemo(() => selectedCampaign?.themes || [], [selectedCampaign])

  // Récap coût par thème : le coût d'une influ est réparti à parts égales entre ses
  // thèmes → la somme des thèmes (+ "sans thème") = total campagne.
  const rollup = useMemo(() => {
    const stats = palette.map((t) => {
      let c0 = 0, n = 0
      for (const c of collabs) if (c.themes?.includes(t)) { c0 += cost(c) / (c.themes.length || 1); n++ }
      return { theme: t, cost: c0, count: n }
    })
    const untagged = collabs.filter((c) => !c.themes?.length)
    const total = collabs.reduce((s, c) => s + cost(c), 0)
    return { stats, untaggedCount: untagged.length, untaggedCost: untagged.reduce((s, c) => s + cost(c), 0), total }
  }, [palette, collabs])

  const selectedCollabs = collabs.filter((c) => sel.has(c.id))

  // Après un envoi outreach réel : SEULES les cartes réellement envoyées passent en
  // "Contacté". Les contacts sans email (skip) RESTENT en Prospect (sinon on croit
  // à tort qu'ils ont été contactés).
  async function afterCompose(results: { id: string; result: string }[]) {
    const sentIds = new Set(results.filter((r) => r.result === "sent").map((r) => r.id))
    await Promise.all(
      selectedCollabs.filter((c) => c.stage === "prospect" && sentIds.has(c.influencer_id)).map((c) =>
        fetch("/api/influencers/collabs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, stage: "contacte" }) })
      )
    )
    setShowCompose(false); setSel(new Set())
    loadCollabs(selected); loadCampaigns()
  }

  async function moveStage(id: string, stage: Stage) {
    setCollabs((prev) => prev.map((c) => (c.id === id ? { ...c, stage } : c)))
    await fetch("/api/influencers/collabs", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, stage }),
    })
    loadCampaigns()
  }

  async function toggleTheme(c: Collab, theme: string) {
    const themes = c.themes?.includes(theme) ? c.themes.filter((t) => t !== theme) : [...(c.themes || []), theme]
    setCollabs((prev) => prev.map((x) => (x.id === c.id ? { ...x, themes } : x)))
    await fetch("/api/influencers/collabs", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, themes }),
    })
  }

  async function removeCollab(id: string) {
    if (!confirm("Retirer cette influenceuse de la campagne ?")) return
    setCollabs((prev) => prev.filter((c) => c.id !== id))
    await fetch(`/api/influencers/collabs?id=${id}`, { method: "DELETE" })
    loadCampaigns()
  }

  async function syncMonth() {
    if (!selectedCampaign?.year || !selectedCampaign?.month) return
    setSyncing(true)
    try {
      await fetch("/api/influencers/campaigns/sync-month", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: selectedCampaign.year, month: selectedCampaign.month }),
      })
      await Promise.all([loadCollabs(selected), loadCampaigns()])
    } finally {
      setSyncing(false)
    }
  }

  const isOverdue = (d: string | null) => d != null && new Date(d) < new Date(new Date().toDateString())

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header
        title="Campagnes"
        subtitle="Une campagne par mois, auto-remplie depuis les ventes/coûts. Tague chaque collab par thème."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select value={selected} onChange={(e) => setSelected(e.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
              {campaigns.length === 0 && <option value="">Aucune campagne</option>}
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.collab_count})</option>)}
            </select>
            {selectedCampaign && (
              <button onClick={() => setEditCampaign(selectedCampaign)} className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-600 hover:bg-zinc-50" title="Éditer la campagne (thèmes…)">
                <Pencil className="h-4 w-4" />
              </button>
            )}
            <button onClick={() => setShowCampaign(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
              <Megaphone className="h-4 w-4" /> Campagne
            </button>
            {selectedCampaign?.year && selectedCampaign?.month && (
              <button onClick={syncMonth} disabled={syncing} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50" title="Ajouter les influenceuses qui ont une vente/un coût ce mois">
                <RotateCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> Synchroniser le mois
              </button>
            )}
            {selected && (
              <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">
                <UserPlus className="h-4 w-4" /> Ajouter
              </button>
            )}
          </div>
        }
      />
      <div className="p-4 sm:p-6 space-y-4">

        {/* Récap coût par thème (lentille "coûts" de la campagne du mois) */}
        {selected && (palette.length > 0 || rollup.total > 0) && (
          <div className="flex flex-wrap items-stretch gap-2">
            {rollup.stats.map((s) => (
              <div key={s.theme} className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                <div className="text-xs font-medium text-zinc-700">{s.theme}</div>
                <div className="text-sm font-semibold text-zinc-900">{formatCurrency(s.cost)}</div>
                <div className="text-[10px] text-zinc-400">{s.count} influ.</div>
              </div>
            ))}
            {rollup.untaggedCount > 0 && (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-3 py-2">
                <div className="text-xs font-medium text-zinc-400">Sans thème</div>
                <div className="text-sm font-semibold text-zinc-500">{formatCurrency(rollup.untaggedCost)}</div>
                <div className="text-[10px] text-zinc-400">{rollup.untaggedCount} influ.</div>
              </div>
            )}
            <div className="rounded-xl border border-zinc-900 bg-zinc-900 px-3 py-2 text-white">
              <div className="text-xs font-medium text-zinc-300">Total campagne</div>
              <div className="text-sm font-semibold">{formatCurrency(rollup.total)}</div>
              <div className="text-[10px] text-zinc-400">{collabs.length} influ.</div>
            </div>
          </div>
        )}

        {/* Barre d'action sélection → Outreach */}
        {sel.size > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-zinc-900 bg-zinc-900 px-4 py-2.5 text-white">
            <span className="text-sm font-medium">{sel.size} sélectionnée{sel.size > 1 ? "s" : ""}</span>
            <button onClick={() => setShowCompose(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100">
              <Send className="h-4 w-4" /> Outreach
            </button>
            <button onClick={() => setSel(new Set())} className="text-sm text-zinc-300 hover:text-white">Désélectionner</button>
          </div>
        )}

        {campaigns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
            Crée une première campagne pour commencer.
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
                        onClick={() => { setDrawerTab("chat"); setDrawerId(c.influencer_id) }}
                        className="group cursor-pointer rounded-lg border border-zinc-200 bg-white p-2.5 shadow-sm hover:border-zinc-300"
                        title="Voir la conversation"
                      >
                        <div className="flex items-start gap-2">
                          <input type="checkbox" checked={sel.has(c.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleSel(c.id)}
                            className="mt-1 h-3.5 w-3.5 shrink-0 cursor-pointer accent-zinc-900" title="Sélectionner pour l'outreach" />
                          <CardPhoto handle={c.instagram_handle} name={c.name} />
                          <div className="min-w-0 flex-1">
                            {/* Nom → profil ; carte → conversation */}
                            <button
                              onClick={(e) => { e.stopPropagation(); setDrawerTab("profile"); setDrawerId(c.influencer_id) }}
                              className="block max-w-full truncate text-left text-sm font-medium text-zinc-900 hover:underline"
                              title="Voir le profil">
                              {c.name}
                            </button>
                            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                              {c.instagram_handle && <span className="inline-flex items-center gap-0.5"><Instagram className="h-3 w-3" />{c.instagram_handle.replace(/^@/, "")}</span>}
                              {c.followers != null && <span>· {Number(c.followers).toLocaleString("fr-FR")}</span>}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1">
                              {c.message_count > 0 && (
                                <span
                                  className={cn("inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium",
                                    c.awaiting_reply ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-500")}
                                  title={c.awaiting_reply ? "Dernier message reçu — réponse attendue" : "Conversation"}>
                                  💬 {c.message_count}
                                  {c.last_message_at && <span>· {new Date(c.last_message_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>}
                                </span>
                              )}
                              {!c.email && <span className="inline-block rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700" title="Pas d'email — ne peut pas être contactée par outreach">✉️ email manquant</span>}
                            </div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); removeCollab(c.id) }} className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500" title="Retirer">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Coût du mois (forfait + commission) */}
                        {(c.fee > 0 || c.commission > 0) && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
                            {c.fee > 0 && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600">forfait {formatCurrency(c.fee)}</span>}
                            {c.commission > 0 && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">comm{c.commission_rate ? ` ${c.commission_rate}%` : ""} · {formatCurrency(c.commission)}</span>}
                          </div>
                        )}

                        {/* Thèmes : toggle depuis la palette de la campagne */}
                        {palette.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                            {palette.map((t) => {
                              const on = c.themes?.includes(t)
                              return (
                                <button key={t} onClick={() => toggleTheme(c, t)}
                                  className={cn("rounded px-1.5 py-0.5 text-[10px] transition-colors", on ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200")}>
                                  {t}
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {c.niche && !palette.length && (
                          <div className="mt-1.5"><span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">{c.niche}</span></div>
                        )}

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

      {(showCampaign || editCampaign) && (
        <CampaignModal
          campaign={editCampaign || undefined}
          market={market}
          onClose={() => { setShowCampaign(false); setEditCampaign(null) }}
          onSaved={(id) => { setShowCampaign(false); setEditCampaign(null); loadCampaigns().then(() => setSelected(id)) }}
        />
      )}
      {showAdd && selected && <AddModal campaignId={selected} allInf={allInf} inCampaign={new Set(collabs.map((c) => c.influencer_id))} onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); loadCollabs(selected); loadCampaigns() }} />}
      <InfluencerDrawer
        influencerId={drawerId}
        initialTab={drawerTab}
        onClose={() => setDrawerId(null)}
      />
      {showCompose && sel.size > 0 && (
        <OutreachCompose
          ids={selectedCollabs.map((c) => c.influencer_id)}
          names={selectedCollabs.map((c) => c.name)}
          onClose={() => setShowCompose(false)}
          onDone={afterCompose}
        />
      )}
    </div>
  )
}

function CampaignModal({ campaign, market, onClose, onSaved }: { campaign?: Campaign; market: string; onClose: () => void; onSaved: (id: string) => void }) {
  const now = new Date()
  const [form, setForm] = useState({
    name: campaign?.name ?? "",
    objective: campaign?.objective ?? "",
    budget: campaign?.budget != null ? String(campaign.budget) : "",
    year: campaign?.year ?? now.getFullYear(),
    month: campaign?.month ?? now.getMonth() + 1,
  })
  const [themes, setThemes] = useState<string[]>(campaign?.themes ?? [])
  const [themeInput, setThemeInput] = useState("")
  const [saving, setSaving] = useState(false)
  const editing = !!campaign?.id

  function addTheme() {
    const t = themeInput.trim()
    if (t && !themes.includes(t)) setThemes((p) => [...p, t])
    setThemeInput("")
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    const body = { ...form, themes, budget: form.budget, market }
    const res = await fetch("/api/influencers/campaigns", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing ? { id: campaign!.id, ...body } : body),
    })
    const data = await res.json()
    setSaving(false)
    onSaved(editing ? campaign!.id : data.campaign?.id)
  }

  return (
    <Modal title={editing ? "Éditer la campagne" : "Nouvelle campagne mensuelle"} onClose={onClose}>
      <Field label="Nom *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mai 2026" className={inp} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mois">
          <select value={form.month} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })} className={inp}>
            {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </Field>
        <Field label="Année">
          <select value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} className={inp}>
            {[2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Thèmes (labels assignables aux collabs)">
        <div className="flex gap-2">
          <input value={themeInput} onChange={(e) => setThemeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTheme() } }}
            placeholder="Lancement Led Mask, Soldes été…" className={inp} />
          <button type="button" onClick={addTheme} className="shrink-0 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-600 hover:bg-zinc-50">Ajouter</button>
        </div>
        {themes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {themes.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                {t}
                <button type="button" onClick={() => setThemes((p) => p.filter((x) => x !== t))} className="text-zinc-400 hover:text-red-500"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Objectif"><input value={form.objective ?? ""} onChange={(e) => setForm({ ...form, objective: e.target.value })} placeholder="CA, reach…" className={inp} /></Field>
        <Field label="Budget (€)"><input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} className={inp} /></Field>
      </div>
      <button onClick={save} disabled={saving || !form.name.trim()} className="mt-2 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
        {saving ? "Enregistrement…" : editing ? "Enregistrer" : "Créer la campagne"}
      </button>
    </Modal>
  )
}

function AddModal({ campaignId, allInf, inCampaign, onClose, onAdded }: { campaignId: string; allInf: InfLite[]; inCampaign: Set<string>; onClose: () => void; onAdded: () => void }) {
  const [tab, setTab] = useState<"existante" | "nouvelle">("existante")
  const [q, setQ] = useState("")
  const [np, setNp] = useState({ new_name: "", new_handle: "", new_email: "", new_niche: "", new_followers: "" })
  const [saving, setSaving] = useState(false)
  async function add(body: Record<string, unknown>) {
    setSaving(true)
    await fetch("/api/influencers/collabs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaign_id: campaignId, ...body }) })
    setSaving(false); onAdded()
  }
  const filtered = allInf.filter((i) => !inCampaign.has(i.id) && i.name.toLowerCase().includes(q.toLowerCase()))
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
          <Field label="Email"><input type="email" value={np.new_email} onChange={(e) => setNp({ ...np, new_email: e.target.value })} placeholder="pour l'outreach (optionnel)" className={inp} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Niche"><input value={np.new_niche} onChange={(e) => setNp({ ...np, new_niche: e.target.value })} className={inp} /></Field>
            <Field label="Followers"><input type="number" value={np.new_followers} onChange={(e) => setNp({ ...np, new_followers: e.target.value })} className={inp} /></Field>
          </div>
          <button onClick={() => add(np)} disabled={saving || !np.new_name.trim()} className="mt-2 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">{saving ? "Ajout…" : "Créer + ajouter à la campagne"}</button>
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
