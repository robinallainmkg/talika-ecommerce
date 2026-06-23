"use client"

import { useState, useEffect, useCallback, Fragment } from "react"
import Link from "next/link"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MonthTabs } from "@/components/influence/month-tabs"
import { formatCurrency } from "@/lib/utils"
import {
  Users,
  DollarSign,
  TrendingUp,
  Target,
  Loader2,
  Plus,
  X,
  Save,
  Tag,
  ToggleLeft,
  ToggleRight,
} from "lucide-react"
import { DataInsights } from "@/components/data-insights"

// ─── Types ───────────────────────────────────────────────────────
interface InfluencerCode {
  id: string
  influencer_id: string
  code: string
  discount_percent: number
  is_active: boolean
  created_at: string
}

interface Influencer {
  id: string
  name: string
  instagram_handle: string | null
  tiktok_handle: string | null
  email: string | null
  phone: string | null
  tier: string | null
  category: string | null
  status: string | null
  commission_rate: number | null
  notes: string | null
  has_fixed_fee: boolean
  fixed_fee_amount: number | null
  total_sales: number
  total_orders: number
  total_commissions: number
  total_fixed_fees: number
  created_at: string
  updated_at: string | null
  influencer_codes: InfluencerCode[]
}

interface CodeWithInfluencer extends InfluencerCode {
  influencers: { id: string; name: string } | null
  code_type?: string
  total_orders?: number
  total_revenue?: number
  total_discount?: number
}

interface UnassignedCode {
  code: string
  orders: number
  revenue: number
  discount: number
}

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]

// ─── Categories matching the Générosité page exactly ─────
const GENEROSITE_CATEGORIES: Record<string, string> = {
  influence: "Codes Influenceurs",
  gifting: "Dotations (MKG)",
  welcome: "Codes Génériques (Welcome)",
  offre_site: "Offres Site (promos)",
  auto_discounts: "Remises automatiques (volume)",
  logistique: "Erreurs Logistiques (LA Poste)",
  service_client: "Retours / SAV",
  autre: "Autres codes",
}

// Labels for displaying code types in the codes table
const CODE_TYPE_LABELS: Record<string, string> = {
  ...GENEROSITE_CATEGORIES,
  influencer: "Influenceur",
  site: "Code site",
  internal: "Interne",
  presse: "Presse / RP",
}

// ─── Helpers ─────────────────────────────────────────────────────
function getType(inf: Influencer): string {
  if (inf.has_fixed_fee && inf.commission_rate && inf.commission_rate > 0) return "Mixte"
  if (inf.has_fixed_fee) return "Fixe"
  return "Commission"
}

function getTypeBadge(type: string): "info" | "warning" | "default" {
  if (type === "Mixte") return "warning"
  if (type === "Fixe") return "info"
  return "default"
}

// Flag de performance d'une influenceuse sur la période (ventes via code vs coût).
type PerfFlag = "ok" | "watch" | "deficit" | "none"
function perfFlag(sales: number, cost: number): PerfFlag {
  if (cost > 0 && sales === 0) return "deficit"
  if (cost === 0) return sales > 0 ? "ok" : "none"
  const roi = sales / cost
  if (roi < 1) return "deficit"
  if (roi < 3) return "watch"
  return "ok"
}
const FLAG_META: Record<PerfFlag, { label: string; cls: string }> = {
  ok: { label: "Rentable", cls: "bg-emerald-50 text-emerald-700" },
  watch: { label: "À surveiller", cls: "bg-amber-50 text-amber-700" },
  deficit: { label: "Déficitaire", cls: "bg-red-50 text-red-700" },
  none: { label: "—", cls: "bg-zinc-50 text-zinc-400" },
}

// ─── Page ────────────────────────────────────────────────────────
export default function InfluencersPage() {
  const [activeTab, setActiveTab] = useState<"influenceurs" | "codes">("influenceurs")
  const [showAllInfluencers, setShowAllInfluencers] = useState(false)
  const [influencers, setInfluencers] = useState<Influencer[]>([])
  const [allCodes, setAllCodes] = useState<CodeWithInfluencer[]>([])
  const [unassignedCodes, setUnassignedCodes] = useState<UnassignedCode[]>([])
  const [codeSelections, setCodeSelections] = useState<Record<string, { category: string; influencerId?: string; newInfluencerName?: string }>>({})
  const [savingCodes, setSavingCodes] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState(2026)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null) // null = année complète

  // Add influencer modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({
    name: "",
    instagram_handle: "",
    email: "",
    commission_rate: 12,
    has_fixed_fee: false,
    fixed_fee_amount: 0,
    notes: "",
  })
  const [addSaving, setAddSaving] = useState(false)

  // Codes section
  const [codeForm, setCodeForm] = useState({
    influencer_id: "",
    code: "",
    discount_percent: 15,
  })
  const [codeSaving, setCodeSaving] = useState(false)

  // ─── Fetch data ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [infRes, codesRes] = await Promise.all([
        fetch(`/api/influencers?year=${selectedYear}${selectedMonth ? `&month=${selectedMonth}` : ""}`, { cache: "no-store" }),
        fetch("/api/influencers/codes", { cache: "no-store" }),
      ])
      const infJson = await infRes.json()
      const codesJson = await codesRes.json()

      if (infJson.error) throw new Error(infJson.error)
      if (codesJson.error) throw new Error(codesJson.error)

      setInfluencers(infJson.influencers || [])
      const codes = codesJson.codes || []
      setAllCodes(codes)

      // Build unassigned codes from Shopify data_cache
      const cacheRes = await fetch("/api/influencers/unassigned", { cache: "no-store" })
      const cacheJson = await cacheRes.json()
      if (cacheJson.codes) {
        // L'endpoint /api/influencers/unassigned exclut déjà les codes catégorisés
        // (matching normalisé, source de vérité = influencer_codes.code_type).
        setUnassignedCodes(cacheJson.codes as UnassignedCode[])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement")
    } finally {
      setLoading(false)
    }
  }, [selectedYear, selectedMonth])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ─── Add influencer ───────────────────────────────────────────
  async function handleAddInfluencer() {
    if (!addForm.name.trim()) return
    setAddSaving(true)
    try {
      const res = await fetch("/api/influencers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setShowAddModal(false)
      setAddForm({
        name: "",
        instagram_handle: "",
        email: "",
        commission_rate: 12,
        has_fixed_fee: false,
        fixed_fee_amount: 0,
        notes: "",
      })
      await fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur")
    } finally {
      setAddSaving(false)
    }
  }

  // ─── Codes handlers ───────────────────────────────────────────
  async function handleAssignCode() {
    if (!codeForm.influencer_id || !codeForm.code.trim()) return
    setCodeSaving(true)
    try {
      const res = await fetch("/api/influencers/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(codeForm),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setCodeForm({ influencer_id: "", code: "", discount_percent: 15 })
      await fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur")
    } finally {
      setCodeSaving(false)
    }
  }

  // Re-assign a single code (used in the existing codes table)
  async function handleQuickAssign(code: string, influencerId: string) {
    if (!influencerId) return
    const discountMatch = code.match(/(\d+)$/)
    const discount = discountMatch ? parseInt(discountMatch[1]) : 15
    const res = await fetch("/api/influencers/codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ influencer_id: influencerId, code, discount_percent: discount }),
    })
    const json = await res.json()
    if (json.error) alert(json.error)
    else await fetchData()
  }

  async function handleMarkAsCategory(code: string, category: string) {
    const discountMatch = code.match(/(\d+)$/)
    const discount = discountMatch ? parseInt(discountMatch[1]) : 0
    const res = await fetch("/api/influencers/codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, discount_percent: discount, code_type: category }),
    })
    const json = await res.json()
    if (json.error) alert(json.error)
    else await fetchData()
  }

  // Batch save for unassigned codes classification
  async function handleSaveClassifications() {
    const entries = Object.entries(codeSelections).filter((entry) => {
      const sel = entry[1]
      if (!sel.category) return false
      if (sel.category === "influence") {
        if (!sel.influencerId) return false // no influencer selected
        if (sel.influencerId === "__new__" && !sel.newInfluencerName?.trim()) return false // new but no name typed
      }
      return true
    })
    if (entries.length === 0) return

    setSavingCodes(true)
    const errors: string[] = []
    const saved: string[] = []

    for (const [code, sel] of entries) {
      try {
        let influencerId = sel.influencerId
        const discountMatch = code.match(/(\d+)$/)
        const discount = discountMatch ? parseInt(discountMatch[1]) : 0

        // Create new influencer if needed
        if (sel.category === "influence" && sel.influencerId === "__new__" && sel.newInfluencerName?.trim()) {
          const createRes = await fetch("/api/influencers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: sel.newInfluencerName, commission_rate: discount || 15 }),
          })
          const createJson = await createRes.json()
          if (createJson.error) { errors.push(code + ": " + createJson.error); continue }
          influencerId = createJson.influencer?.id || createJson.id
        }

        const body = sel.category === "influence"
          ? { code, influencer_id: influencerId, discount_percent: discount || 15 }
          : { code, discount_percent: discount, code_type: sel.category }
        const res = await fetch("/api/influencers/codes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (json.error) { errors.push(code + ": " + json.error) }
        else { saved.push(code) }
      } catch (err) {
        errors.push(code + ": " + (err instanceof Error ? err.message : "Erreur"))
      }
    }

    if (errors.length > 0) alert("Erreurs: " + errors.join(", "))

    // Remove saved codes from local list, refresh influencer list for new ones
    const savedSet = new Set(saved)
    setUnassignedCodes((prev) => prev.filter((uc) => !savedSet.has(uc.code)))
    setCodeSelections({})
    setSavingCodes(false)
    if (saved.length > 0) await fetchData()
  }

  async function handleToggleCode(codeId: string) {
    try {
      const res = await fetch("/api/influencers/codes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: codeId }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      await fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur")
    }
  }

  // ─── Render ────────────────────────────────────────────────────
  // Liste triée alphabétiquement pour les menus déroulants d'attribution.
  const sortedInfluencers = [...influencers].sort((a, b) => a.name.localeCompare(b.name, "fr"))
  return (
    <div>
      <Header
        title="Gestion Influenceurs"
        subtitle="Tracking, commissions et performance des influenceurs"
        actions={
          <div className="flex gap-2 items-center flex-wrap">
            <select
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            >
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
            <Button size="sm" onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          </div>
        }
      />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <MonthTabs allowAll month={selectedMonth} onSelect={setSelectedMonth} />
        <DataInsights page="influencers" />

        {/* Error banner */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        ) : (
          <>
            {/* ── Tab Bar ──────────────────────────────────── */}
            <div className="flex gap-1 bg-zinc-100 rounded-lg p-1 w-fit">
              <button onClick={() => setActiveTab("influenceurs")} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "influenceurs" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
                <Users className="h-4 w-4 inline mr-1.5" />
                Influenceurs
              </button>
              <button onClick={() => setActiveTab("codes")} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "codes" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
                <Tag className="h-4 w-4 inline mr-1.5" />
                Codes promo
                {unassignedCodes.length > 0 && <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5">{unassignedCodes.length}</span>}
              </button>
            </div>

            {activeTab === "influenceurs" && (() => {
              const rows = influencers.map((inf) => {
                const cost = (inf.total_commissions || 0) + (inf.total_fixed_fees || 0)
                const sales = inf.total_sales || 0
                return { inf, cost, sales, roi: cost > 0 ? sales / cost : null, flag: perfFlag(sales, cost) }
              })
              const activeRows = rows.filter((r) => r.sales > 0 || r.cost > 0)
              const displayed = showAllInfluencers ? rows : activeRows
              const totalSales = activeRows.reduce((s, r) => s + r.sales, 0)
              const totalCost = activeRows.reduce((s, r) => s + r.cost, 0)
              const roiGlobal = totalCost > 0 ? totalSales / totalCost : 0
              const periodLabel = selectedMonth ? `${MONTHS_FR[selectedMonth - 1]} ${selectedYear}` : `Année ${selectedYear}`
              return (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                    <KPICard label="Influenceuses actives" value={activeRows.length} icon={<Users className="h-5 w-5" />} />
                    <KPICard label="CA via influence" value={formatCurrency(totalSales)} icon={<DollarSign className="h-5 w-5" />} />
                    <KPICard label="Coût influence" value={formatCurrency(totalCost)} icon={<TrendingUp className="h-5 w-5" />} />
                    <KPICard label="ROI global" value={roiGlobal > 0 ? `${roiGlobal.toFixed(1)}x` : "--"} icon={<Target className="h-5 w-5" />} />
                  </div>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-zinc-500" /> Performance — {periodLabel}
                      </CardTitle>
                      <button onClick={() => setShowAllInfluencers((v) => !v)} className="text-xs text-zinc-500 hover:text-zinc-800">
                        {showAllInfluencers ? `Voir actives (${activeRows.length})` : `Voir toutes (${rows.length})`}
                      </button>
                    </CardHeader>
                    <CardContent>
                      <p className="mb-3 text-xs text-zinc-400">
                        « Ventes » = CA des commandes utilisant le code de l&apos;influenceuse (brut, attribution code). ROI = ventes ÷ coût (forfait + commission).
                      </p>
                      <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b-2 border-zinc-300 text-xs uppercase text-zinc-400">
                              <th className="pb-3 text-left font-medium min-w-[180px]">Influenceuse</th>
                              <th className="pb-3 text-center font-medium min-w-[90px]">Type</th>
                              <th className="pb-3 text-right font-medium min-w-[120px]">Ventes (CA via code)</th>
                              <th className="pb-3 text-right font-medium min-w-[70px]">Cmd</th>
                              <th className="pb-3 text-right font-medium min-w-[100px]">Coût</th>
                              <th className="pb-3 text-right font-medium min-w-[70px]">ROI</th>
                              <th className="pb-3 text-center font-medium min-w-[110px]">Perf</th>
                              <th className="pb-3 text-left font-medium min-w-[140px]">Codes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayed.map(({ inf, cost, sales, roi, flag }) => {
                              const type = getType(inf)
                              const fm = FLAG_META[flag]
                              const codes = (inf.influencer_codes || []).filter((c) => c.is_active)
                              return (
                                <tr key={inf.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                                  <td className="py-3">
                                    <Link href={`/influencers/${inf.id}`} className="font-medium text-zinc-900 hover:underline">{inf.name}</Link>
                                  </td>
                                  <td className="py-3 text-center"><Badge variant={getTypeBadge(type)}>{type}</Badge></td>
                                  <td className="py-3 text-right font-medium">{sales > 0 ? formatCurrency(sales) : "—"}</td>
                                  <td className="py-3 text-right text-zinc-500">{inf.total_orders || 0}</td>
                                  <td className="py-3 text-right">{cost > 0 ? formatCurrency(cost) : "—"}</td>
                                  <td className="py-3 text-right font-semibold">{roi != null ? `${roi.toFixed(1)}x` : sales > 0 ? "∞" : "—"}</td>
                                  <td className="py-3 text-center"><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${fm.cls}`}>{fm.label}</span></td>
                                  <td className="py-3">
                                    <div className="flex flex-wrap gap-1">
                                      {codes.slice(0, 3).map((c) => (
                                        <span key={c.id} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-mono text-zinc-600">{c.code}</span>
                                      ))}
                                      {codes.length === 0 && <span className="text-[11px] text-zinc-300">aucun</span>}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                            {displayed.length === 0 && (
                              <tr><td colSpan={8} className="py-8 text-center text-sm text-zinc-400">Aucune influenceuse {showAllInfluencers ? "" : "active "}sur cette période.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )
            })()}

            {activeTab === "codes" && (<>
            {/* ── Codes Non Attribués ──────────────────────── */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Tag className="h-5 w-5 text-amber-500" />
                    Codes promo non attribués
                  </CardTitle>
                  {unassignedCodes.length > 0 ? (
                    <Badge variant="warning">{unassignedCodes.length} à attribuer</Badge>
                  ) : (
                    <Badge variant="success">Tout est catégorisé</Badge>
                  )}
                </CardHeader>
                <CardContent>
                  {unassignedCodes.length === 0 ? (
                    <p className="text-sm text-zinc-500 py-4 text-center">
                      Tous les codes promo Shopify sont attribués ou catégorisés. Les nouveaux codes apparaîtront ici automatiquement après chaque sync.
                    </p>
                  ) : (
                  <>
                  <p className="text-sm text-zinc-500 mb-4">
                    Ces codes génèrent des ventes sur Shopify mais ne sont pas encore associés à un influenceur ou classés comme code site/interne.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-zinc-300">
                          <th className="pb-3 text-left font-medium text-zinc-500">Code</th>
                          <th className="pb-3 text-right font-medium text-zinc-500">Commandes</th>
                          <th className="pb-3 text-right font-medium text-zinc-500">CA</th>
                          <th className="pb-3 text-right font-medium text-zinc-500">Remises</th>
                          <th className="pb-3 text-left font-medium text-zinc-500 min-w-[200px]">Catégorie générosité</th>
                          <th className="pb-3 text-left font-medium text-zinc-500 min-w-[200px]">Influenceur</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unassignedCodes.map((uc) => {
                          const sel = codeSelections[uc.code]
                          return (
                          <tr key={uc.code} className={
                            sel?.category
                              ? "border-b border-zinc-100 bg-emerald-50/40"
                              : "border-b border-zinc-100 hover:bg-amber-50/30 transition-colors"
                          }>
                            <td className="py-2.5">
                              <Badge variant={sel?.category ? "success" : "warning"} className="font-mono">{uc.code}</Badge>
                            </td>
                            <td className="py-2.5 text-right font-medium text-zinc-700">{uc.orders}</td>
                            <td className="py-2.5 text-right font-medium text-zinc-700">{formatCurrency(uc.revenue)}</td>
                            <td className="py-2.5 text-right text-zinc-500">{formatCurrency(uc.discount)}</td>
                            <td className="py-2.5">
                              <select
                                className="w-full rounded-md border-2 border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                                value={sel?.category || ""}
                                onChange={(e) => {
                                  setCodeSelections((prev) => ({
                                    ...prev,
                                    [uc.code]: { category: e.target.value, influencerId: undefined },
                                  }))
                                }}
                              >
                                <option value="">Choisir...</option>
                                {Object.entries(GENEROSITE_CATEGORIES).map(([key, label]) => (
                                  <option key={key} value={key}>{label}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2.5">
                              {sel?.category === "influence" ? (
                                <div className="flex gap-1.5">
                                  {sel?.influencerId === "__new__" ? (
                                    <div className="flex gap-1 flex-1">
                                      <input
                                        type="text"
                                        placeholder="Nom du nouvel influenceur"
                                        className="flex-1 rounded-md border-2 border-blue-300 bg-blue-50 px-2 py-1.5 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none"
                                        value={sel?.newInfluencerName || ""}
                                        onChange={(e) => {
                                          setCodeSelections((prev) => ({
                                            ...prev,
                                            [uc.code]: { ...prev[uc.code], newInfluencerName: e.target.value },
                                          }))
                                        }}
                                        autoFocus
                                      />
                                      <button
                                        className="text-xs px-2 rounded bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                                        onClick={() => {
                                          setCodeSelections((prev) => ({
                                            ...prev,
                                            [uc.code]: { ...prev[uc.code], influencerId: undefined, newInfluencerName: undefined },
                                          }))
                                        }}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <select
                                      className="w-full rounded-md border-2 border-blue-300 bg-blue-50 px-2 py-1.5 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none"
                                      value={sel?.influencerId || ""}
                                      onChange={(e) => {
                                        setCodeSelections((prev) => ({
                                          ...prev,
                                          [uc.code]: { ...prev[uc.code], influencerId: e.target.value, newInfluencerName: undefined },
                                        }))
                                      }}
                                    >
                                      <option value="">Choisir...</option>
                                      {sortedInfluencers.map((inf) => (
                                        <option key={inf.id} value={inf.id}>{inf.name}</option>
                                      ))}
                                      <option value="__new__">+ Nouveau influenceur</option>
                                    </select>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-zinc-400 px-2">—</span>
                              )}
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Save button */}
                  {Object.keys(codeSelections).length > 0 && (
                    <div className="mt-4 flex items-center justify-between border-t pt-4">
                      <p className="text-sm text-zinc-500">
                        {Object.values(codeSelections).filter((s) => {
                          if (!s.category) return false
                          if (s.category === "influence") {
                            if (!s.influencerId) return false
                            if (s.influencerId === "__new__" && !s.newInfluencerName?.trim()) return false
                          }
                          return true
                        }).length} code(s) prêt(s) à enregistrer
                      </p>
                      <Button
                        onClick={handleSaveClassifications}
                        disabled={savingCodes}
                        className="gap-2"
                      >
                        {savingCodes ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Enregistrement...</>
                        ) : (
                          <><Save className="h-4 w-4" /> Enregistrer</>
                        )}
                      </Button>
                    </div>
                  )}
                  </>
                  )}
                </CardContent>
              </Card>

            {/* ── Codes Promo Section ───────────────────────── */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5 text-zinc-500" />
                  Codes promo influenceurs
                </CardTitle>
                <Badge variant="info">{allCodes.length} codes</Badge>
              </CardHeader>
              <CardContent>
                {/* Assign new code form */}
                <div className="flex flex-wrap items-end gap-3 mb-6 p-4 rounded-lg bg-zinc-50 border border-zinc-200">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-medium text-zinc-500 mb-1">
                      Influenceur
                    </label>
                    <select
                      className="w-full rounded-md border-2 border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                      value={codeForm.influencer_id}
                      onChange={(e) =>
                        setCodeForm({ ...codeForm, influencer_id: e.target.value })
                      }
                    >
                      <option value="">Selectionner un influenceur...</option>
                      {sortedInfluencers.map((inf) => (
                        <option key={inf.id} value={inf.id}>
                          {inf.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-40">
                    <label className="block text-xs font-medium text-zinc-500 mb-1">
                      Code promo
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-md border-2 border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 uppercase focus:border-zinc-900 focus:outline-none"
                      value={codeForm.code}
                      onChange={(e) =>
                        setCodeForm({ ...codeForm, code: e.target.value })
                      }
                      placeholder="CODE15"
                    />
                  </div>
                  <div className="w-24">
                    <label className="block text-xs font-medium text-zinc-500 mb-1">
                      Remise %
                    </label>
                    <input
                      type="number"
                      className="w-full rounded-md border-2 border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                      value={codeForm.discount_percent}
                      onChange={(e) =>
                        setCodeForm({
                          ...codeForm,
                          discount_percent: parseFloat(e.target.value) || 0,
                        })
                      }
                      min={0}
                      max={100}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAssignCode}
                    disabled={codeSaving || !codeForm.influencer_id || !codeForm.code.trim()}
                  >
                    {codeSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Attribuer
                  </Button>
                </div>

                {/* Codes list */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-zinc-300">
                        <th className="pb-3 text-left font-medium text-zinc-500">Influenceur</th>
                        <th className="pb-3 text-left font-medium text-zinc-500">Code</th>
                        <th className="pb-3 text-right font-medium text-zinc-500">Remise</th>
                        <th className="pb-3 text-center font-medium text-zinc-500">Statut</th>
                        <th className="pb-3 text-center font-medium text-zinc-500">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allCodes.map((c) => (
                        <tr
                          key={c.id}
                          className="border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors"
                        >
                          <td className="py-2.5 text-zinc-700 font-medium">
                            {c.influencers?.name ? (
                              c.influencers.name
                            ) : c.code_type && c.code_type !== "influencer" ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200">
                                {CODE_TYPE_LABELS[c.code_type] || c.code_type}
                              </span>
                            ) : (
                              <select
                                className="w-full rounded-md border-2 border-amber-300 bg-amber-50 px-2 py-1 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                                value=""
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  if (!e.target.value) return
                                  const val = e.target.value
                                  if (val.startsWith("cat:")) {
                                    handleMarkAsCategory(c.code, val.replace("cat:", ""))
                                  } else {
                                    handleQuickAssign(c.code, val)
                                  }
                                }}
                              >
                                <option value="">Attribuer...</option>
                                <optgroup label="Influenceurs">
                                  {sortedInfluencers.map((inf) => (
                                    <option key={inf.id} value={inf.id}>{inf.name}</option>
                                  ))}
                                </optgroup>
                                <optgroup label="Catégorie générosité">
                                  {Object.entries(GENEROSITE_CATEGORIES).filter(([k]) => k !== "influence").map(([key, label]) => (
                                    <option key={key} value={"cat:" + key}>{label}</option>
                                  ))}
                                </optgroup>
                              </select>
                            )}
                          </td>
                          <td className="py-2.5">
                            <Badge variant="info" className="font-mono">
                              {c.code}
                            </Badge>
                          </td>
                          <td className="py-2.5 text-right text-zinc-600">
                            {c.discount_percent}%
                          </td>
                          <td className="py-2.5 text-center">
                            <Badge variant={c.is_active ? "success" : "danger"}>
                              {c.is_active ? "Actif" : "Inactif"}
                            </Badge>
                          </td>
                          <td className="py-2.5 text-center">
                            <button
                              onClick={() => handleToggleCode(c.id)}
                              className="text-zinc-400 hover:text-zinc-700 transition-colors"
                              title={c.is_active ? "Desactiver" : "Activer"}
                            >
                              {c.is_active ? (
                                <ToggleRight className="h-5 w-5 text-emerald-600" />
                              ) : (
                                <ToggleLeft className="h-5 w-5 text-zinc-400" />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {allCodes.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-zinc-400">
                            Aucun code promo attribue
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            </>)}
          </>
        )}
      </div>

      {/* ── Add Influencer Modal ────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowAddModal(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-zinc-900">Ajouter un influenceur</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Nom <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full rounded-md border-2 border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="Nom de l'influenceur"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Instagram
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-md border-2 border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                    value={addForm.instagram_handle}
                    onChange={(e) =>
                      setAddForm({ ...addForm, instagram_handle: e.target.value })
                    }
                    placeholder="@handle"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
                  <input
                    type="email"
                    className="w-full rounded-md border-2 border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    placeholder="email@exemple.com"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Commission (%)
                  </label>
                  <input
                    type="number"
                    className="w-full rounded-md border-2 border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                    value={addForm.commission_rate}
                    onChange={(e) =>
                      setAddForm({
                        ...addForm,
                        commission_rate: parseFloat(e.target.value) || 0,
                      })
                    }
                    min={0}
                    max={100}
                    step={0.5}
                  />
                </div>
                <div className="flex items-end gap-3">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Fee fixe
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setAddForm({ ...addForm, has_fixed_fee: !addForm.has_fixed_fee })
                      }
                      className="py-2"
                    >
                      {addForm.has_fixed_fee ? (
                        <ToggleRight className="h-6 w-6 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="h-6 w-6 text-zinc-400" />
                      )}
                    </button>
                  </div>
                  {addForm.has_fixed_fee && (
                    <input
                      type="number"
                      className="flex-1 rounded-md border-2 border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                      value={addForm.fixed_fee_amount}
                      onChange={(e) =>
                        setAddForm({
                          ...addForm,
                          fixed_fee_amount: parseFloat(e.target.value) || 0,
                        })
                      }
                      placeholder="Montant"
                    />
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Notes</label>
                <textarea
                  className="w-full rounded-md border-2 border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                  rows={2}
                  value={addForm.notes}
                  onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                  placeholder="Notes internes..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddModal(false)}
              >
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={handleAddInfluencer}
                disabled={addSaving || !addForm.name.trim()}
              >
                {addSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Ajouter
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

