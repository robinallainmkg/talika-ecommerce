"use client"

import { useState, useEffect, useCallback, Fragment } from "react"
import Link from "next/link"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatNumber } from "@/lib/utils"
import {
  Users,
  DollarSign,
  TrendingUp,
  Target,
  Loader2,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Save,
  Tag,
  ToggleLeft,
  ToggleRight,
  Eye,
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

// ─── Labels for code types (matching generosite categories) ─────
const CODE_TYPE_LABELS: Record<string, string> = {
  site: "Code site",
  internal: "Interne",
  gifting: "Gifting (MKG)",
  welcome: "Welcome / Générique",
  offre_site: "Offre Site / Promo",
  logistique: "Logistique",
  service_client: "Service Client",
  autre: "Autre",
  influencer: "Influenceur",
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

function getRoas(inf: Influencer): number {
  const cost = (inf.total_commissions || 0) + (inf.total_fixed_fees || 0)
  if (cost === 0) return 0
  return (inf.total_sales || 0) / cost
}

interface FixedFee {
  id: string
  influencer_id: string
  amount: number
  month: number
  year: number
  label: string | null
}

// ─── Page ────────────────────────────────────────────────────────
export default function InfluencersPage() {
  const [influencers, setInfluencers] = useState<Influencer[]>([])
  const [allCodes, setAllCodes] = useState<CodeWithInfluencer[]>([])
  const [unassignedCodes, setUnassignedCodes] = useState<UnassignedCode[]>([])
  const [assigningCode, setAssigningCode] = useState<string | null>(null)
  const [assignTarget, setAssignTarget] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState(2026)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null) // null = année complète

  // Expanded row for inline editing
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Influencer>>({})
  const [saving, setSaving] = useState(false)

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

  // Fixed fees
  const [fees, setFees] = useState<FixedFee[]>([])
  const [newFee, setNewFee] = useState({ month: new Date().getMonth() + 1, year: 2026, amount: 0, label: "" })
  const [feeSaving, setFeeSaving] = useState(false)

  // ─── Fetch data ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [infRes, codesRes] = await Promise.all([
        fetch(`/api/influencers?year=${selectedYear}${selectedMonth ? `&month=${selectedMonth}` : ""}`),
        fetch("/api/influencers/codes"),
      ])
      const infJson = await infRes.json()
      const codesJson = await codesRes.json()

      if (infJson.error) throw new Error(infJson.error)
      if (codesJson.error) throw new Error(codesJson.error)

      setInfluencers(infJson.influencers || [])
      const codes = codesJson.codes || []
      setAllCodes(codes)

      // Build unassigned codes from Shopify data_cache
      const cacheRes = await fetch("/api/influencers/unassigned")
      const cacheJson = await cacheRes.json()
      if (cacheJson.codes) {
        const assignedCodeNames = new Set(codes.map((c: CodeWithInfluencer) => c.code.toUpperCase()))
        const unassigned = (cacheJson.codes as UnassignedCode[]).filter(
          (c) => !assignedCodeNames.has(c.code.toUpperCase())
        )
        setUnassignedCodes(unassigned)
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

  // ─── KPI calculations ─────────────────────────────────────────
  const activeInfluencers = influencers.filter((i) => i.status === "active")
  const totalSales = influencers.reduce((s, i) => s + (i.total_sales || 0), 0)
  const totalCommissions = influencers.reduce(
    (s, i) => s + (i.total_commissions || 0) + (i.total_fixed_fees || 0),
    0
  )
  const avgRoas = totalCommissions > 0 ? totalSales / totalCommissions : 0

  // ─── Expand/Edit handlers ─────────────────────────────────────
  function handleExpand(inf: Influencer) {
    if (expandedId === inf.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(inf.id)
    setEditForm({
      commission_rate: inf.commission_rate ?? 12,
      instagram_handle: inf.instagram_handle || "",
      email: inf.email || "",
      notes: inf.notes || "",
      status: inf.status || "active",
    })
    // Load fees for this influencer
    fetch(`/api/influencers/fees?influencer_id=${inf.id}`)
      .then((r) => r.json())
      .then((json) => setFees(json.fees || []))
      .catch(() => setFees([]))
    setNewFee({ month: new Date().getMonth() + 1, year: 2026, amount: 0, label: "" })
  }

  async function handleAddFee(influencerId: string) {
    if (!newFee.amount || newFee.amount <= 0) return
    setFeeSaving(true)
    try {
      const res = await fetch("/api/influencers/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencer_id: influencerId, ...newFee }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      // Reload fees
      const feesRes = await fetch(`/api/influencers/fees?influencer_id=${influencerId}`)
      const feesJson = await feesRes.json()
      setFees(feesJson.fees || [])
      setNewFee({ month: new Date().getMonth() + 1, year: 2026, amount: 0, label: "" })
      await fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur")
    } finally {
      setFeeSaving(false)
    }
  }

  async function handleDeleteFee(feeId: string, influencerId: string) {
    try {
      await fetch("/api/influencers/fees", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: feeId }),
      })
      const feesRes = await fetch(`/api/influencers/fees?influencer_id=${influencerId}`)
      const feesJson = await feesRes.json()
      setFees(feesJson.fees || [])
      await fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur")
    }
  }

  async function handleSaveEdit(id: string) {
    setSaving(true)
    try {
      const res = await fetch("/api/influencers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...editForm }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      await fetchData()
      setExpandedId(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur")
    } finally {
      setSaving(false)
    }
  }

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

  async function handleQuickAssign(code: string, influencerId: string) {
    if (!influencerId) return
    setAssigningCode(code)
    try {
      const discountMatch = code.match(/(\d+)$/)
      const discount = discountMatch ? parseInt(discountMatch[1]) : 15
      const res = await fetch("/api/influencers/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencer_id: influencerId, code, discount_percent: discount }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setAssigningCode(null)
      setAssignTarget("")
      await fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur")
      setAssigningCode(null)
    }
  }

  async function handleMarkAsCategory(code: string, category: string) {
    setAssigningCode(code)
    try {
      const discountMatch = code.match(/(\d+)$/)
      const discount = discountMatch ? parseInt(discountMatch[1]) : 0
      const res = await fetch("/api/influencers/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, discount_percent: discount, code_type: category }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setAssigningCode(null)
      await fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur")
      setAssigningCode(null)
    }
  }

  async function handleMarkAsSite(code: string) {
    setAssigningCode(code)
    try {
      const discountMatch = code.match(/(\d+)$/)
      const discount = discountMatch ? parseInt(discountMatch[1]) : 0
      const res = await fetch("/api/influencers/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, discount_percent: discount, code_type: "site" }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setAssigningCode(null)
      await fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur")
      setAssigningCode(null)
    }
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
  return (
    <div>
      <Header
        title="Gestion Influenceurs"
        subtitle="Tracking, commissions et performance des influenceurs"
        actions={
          <div className="flex gap-2 items-center flex-wrap">
            <select
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm"
              value={selectedMonth ?? ""}
              onChange={(e) => setSelectedMonth(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">Année complète</option>
              {MONTHS_FR.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
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
            {/* ── KPI Cards ─────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <KPICard
                label="Influenceurs actifs"
                value={activeInfluencers.length}
                icon={<Users className="h-5 w-5" />}
              />
              <KPICard
                label="CA total genere"
                value={formatCurrency(totalSales)}
                icon={<DollarSign className="h-5 w-5" />}
              />
              <KPICard
                label="Dépenses totales"
                value={formatCurrency(totalCommissions)}
                icon={<TrendingUp className="h-5 w-5" />}
              />
              <KPICard
                label="ROAS moyen influenceurs"
                value={avgRoas > 0 ? `${avgRoas.toFixed(2)}x` : "--"}
                icon={<Target className="h-5 w-5" />}
              />
            </div>

            {/* ── Influencers Table ─────────────────────────── */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-zinc-500" />
                  Influenceurs
                </CardTitle>
                <Badge variant="info">{influencers.length} influenceurs</Badge>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-zinc-300">
                        <th className="pb-3 text-left font-medium text-zinc-500 min-w-[180px]">Nom</th>
                        <th className="pb-3 text-center font-medium text-zinc-500 min-w-[70px]">Statut</th>
                        <th className="pb-3 text-center font-medium text-zinc-500 min-w-[90px]">Type</th>
                        <th className="pb-3 text-right font-medium text-zinc-500 min-w-[110px]">CA Total</th>
                        <th className="pb-3 text-right font-medium text-zinc-500 min-w-[80px]">Commandes</th>
                        <th className="pb-3 text-right font-medium text-zinc-500 min-w-[110px]">Commissions</th>
                        <th className="pb-3 text-right font-medium text-zinc-500 min-w-[100px]">Fees fixes</th>
                        <th className="pb-3 text-right font-medium text-zinc-500 min-w-[70px]">ROAS</th>
                        <th className="pb-3 text-left font-medium text-zinc-500 min-w-[140px]">Codes promo</th>
                        <th className="pb-3 text-center font-medium text-zinc-500 min-w-[30px]"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {influencers.map((inf) => {
                        const type = getType(inf)
                        const roas = getRoas(inf)
                        const isExpanded = expandedId === inf.id

                        return (
                          <Fragment key={inf.id}>
                            <tr
                              className="border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors cursor-pointer"
                              onClick={() => handleExpand(inf)}
                            >
                              <td className="py-3">
                                <div className="flex items-center gap-1.5">
                                  <Link
                                    href={`/influencers/${inf.id}`}
                                    className="font-medium text-zinc-900 hover:text-blue-600 hover:underline transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {inf.name}
                                  </Link>
                                  <Link
                                    href={`/influencers/${inf.id}`}
                                    className="text-zinc-300 hover:text-blue-500 transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Link>
                                </div>
                                {inf.instagram_handle && (
                                  <div className="text-xs text-zinc-400">@{inf.instagram_handle}</div>
                                )}
                              </td>
                              <td className="py-3 text-center">
                                <Badge variant={inf.status === "active" ? "success" : "default"}>
                                  {inf.status === "active" ? "Actif" : "Inactif"}
                                </Badge>
                              </td>
                              <td className="py-3 text-center">
                                <Badge variant={getTypeBadge(type)}>{type}</Badge>
                              </td>
                              <td className="py-3 text-right text-zinc-700 font-medium">
                                {formatCurrency(inf.total_sales || 0)}
                              </td>
                              <td className="py-3 text-right text-zinc-600">
                                {formatNumber(inf.total_orders || 0)}
                              </td>
                              <td className="py-3 text-right text-zinc-600">
                                {formatCurrency(inf.total_commissions || 0)}
                              </td>
                              <td className="py-3 text-right text-zinc-600">
                                {inf.total_fixed_fees > 0 ? formatCurrency(inf.total_fixed_fees) : "--"}
                              </td>
                              <td className="py-3 text-right">
                                {roas > 0 ? (
                                  <Badge
                                    variant={
                                      roas >= 5 ? "success" : roas >= 2 ? "warning" : "danger"
                                    }
                                  >
                                    {roas.toFixed(1)}x
                                  </Badge>
                                ) : (
                                  <span className="text-zinc-300">--</span>
                                )}
                              </td>
                              <td className="py-3">
                                <div className="flex flex-wrap gap-1">
                                  {inf.influencer_codes && inf.influencer_codes.length > 0 ? (
                                    inf.influencer_codes.map((c) => (
                                      <Badge
                                        key={c.id}
                                        variant={c.is_active ? "info" : "default"}
                                        className="text-[11px]"
                                      >
                                        {c.code}
                                        {!c.is_active && " (off)"}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className="text-xs text-zinc-300">Aucun</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 text-center">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-zinc-400" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-zinc-400" />
                                )}
                              </td>
                            </tr>

                            {/* Expanded inline edit row */}
                            {isExpanded && (
                              <tr className="border-b border-zinc-200 bg-zinc-50">
                                <td colSpan={10} className="p-4">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                      <label className="block text-xs font-medium text-zinc-500 mb-1">
                                        Instagram
                                      </label>
                                      <input
                                        type="text"
                                        className="w-full rounded-md border-2 border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                                        value={editForm.instagram_handle || ""}
                                        onChange={(e) =>
                                          setEditForm({ ...editForm, instagram_handle: e.target.value })
                                        }
                                        placeholder="@handle"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-zinc-500 mb-1">
                                        Email
                                      </label>
                                      <input
                                        type="email"
                                        className="w-full rounded-md border-2 border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                                        value={editForm.email || ""}
                                        onChange={(e) =>
                                          setEditForm({ ...editForm, email: e.target.value })
                                        }
                                        placeholder="email@exemple.com"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-zinc-500 mb-1">
                                        Commission (%)
                                      </label>
                                      <input
                                        type="number"
                                        className="w-full rounded-md border-2 border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                                        value={editForm.commission_rate ?? 12}
                                        onChange={(e) =>
                                          setEditForm({
                                            ...editForm,
                                            commission_rate: parseFloat(e.target.value) || 0,
                                          })
                                        }
                                        min={0}
                                        max={100}
                                        step={0.5}
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-zinc-500 mb-1">
                                        Statut
                                      </label>
                                      <select
                                        className="w-full rounded-md border-2 border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                                        value={editForm.status || "active"}
                                        onChange={(e) =>
                                          setEditForm({ ...editForm, status: e.target.value })
                                        }
                                      >
                                        <option value="active">Actif</option>
                                        <option value="inactive">Inactif</option>
                                      </select>
                                    </div>
                                    <div className="md:col-span-3">
                                      <label className="block text-xs font-medium text-zinc-500 mb-1">
                                        Notes
                                      </label>
                                      <textarea
                                        className="w-full rounded-md border-2 border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                                        rows={2}
                                        value={editForm.notes || ""}
                                        onChange={(e) =>
                                          setEditForm({ ...editForm, notes: e.target.value })
                                        }
                                        placeholder="Notes internes..."
                                      />
                                    </div>
                                  </div>

                                  {/* Fixed Fees Section */}
                                  <div className="mt-4 pt-4 border-t border-zinc-200">
                                    <label className="block text-xs font-medium text-zinc-500 mb-2">
                                      Fees fixes mensuels
                                    </label>
                                    {fees.length > 0 && (
                                      <div className="space-y-1 mb-3">
                                        {fees.map((f) => (
                                          <div key={f.id} className="flex items-center justify-between py-1 px-3 rounded bg-violet-50 border border-violet-100">
                                            <span className="text-sm text-zinc-700">
                                              {MONTHS_FR[f.month - 1]} {f.year}
                                              {f.label && <span className="text-zinc-400 ml-1">— {f.label}</span>}
                                            </span>
                                            <div className="flex items-center gap-2">
                                              <span className="text-sm font-medium text-violet-700">{formatCurrency(f.amount)}</span>
                                              <button
                                                onClick={() => handleDeleteFee(f.id, inf.id)}
                                                className="text-zinc-400 hover:text-red-500 transition-colors"
                                              >
                                                <X className="h-3.5 w-3.5" />
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    <div className="flex items-end gap-2">
                                      <div className="w-28">
                                        <select
                                          className="w-full rounded-md border-2 border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                                          value={newFee.month}
                                          onChange={(e) => setNewFee({ ...newFee, month: parseInt(e.target.value) })}
                                        >
                                          {MONTHS_FR.map((m, i) => (
                                            <option key={i} value={i + 1}>{m}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="w-20">
                                        <select
                                          className="w-full rounded-md border-2 border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                                          value={newFee.year}
                                          onChange={(e) => setNewFee({ ...newFee, year: parseInt(e.target.value) })}
                                        >
                                          <option value={2024}>2024</option>
                                          <option value={2025}>2025</option>
                                          <option value={2026}>2026</option>
                                        </select>
                                      </div>
                                      <div className="w-28">
                                        <input
                                          type="number"
                                          className="w-full rounded-md border-2 border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                                          value={newFee.amount || ""}
                                          onChange={(e) => setNewFee({ ...newFee, amount: parseFloat(e.target.value) || 0 })}
                                          placeholder="Montant €"
                                        />
                                      </div>
                                      <div className="flex-1">
                                        <input
                                          type="text"
                                          className="w-full rounded-md border-2 border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                                          value={newFee.label}
                                          onChange={(e) => setNewFee({ ...newFee, label: e.target.value })}
                                          placeholder="Label (optionnel)"
                                        />
                                      </div>
                                      <Button
                                        size="sm"
                                        onClick={() => handleAddFee(inf.id)}
                                        disabled={feeSaving || !newFee.amount}
                                      >
                                        {feeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                        Ajouter
                                      </Button>
                                    </div>
                                  </div>

                                  <div className="flex justify-end gap-2 mt-3">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setExpandedId(null)}
                                    >
                                      Annuler
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => handleSaveEdit(inf.id)}
                                      disabled={saving}
                                    >
                                      {saving ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Save className="h-4 w-4" />
                                      )}
                                      Sauvegarder
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}

                      {influencers.length === 0 && (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-zinc-400">
                            Aucun influenceur trouve
                          </td>
                        </tr>
                      )}

                      {/* Totals row */}
                      {influencers.length > 0 && (
                        <tr className="border-t-2 border-zinc-300 bg-zinc-900 text-white">
                          <td className="py-3 px-1 font-bold">TOTAL</td>
                          <td className="py-3 text-center font-bold">{activeInfluencers.length}</td>
                          <td className="py-3"></td>
                          <td className="py-3 text-right font-bold">{formatCurrency(totalSales)}</td>
                          <td className="py-3 text-right font-bold">
                            {formatNumber(influencers.reduce((s, i) => s + (i.total_orders || 0), 0))}
                          </td>
                          <td className="py-3 text-right font-bold">
                            {formatCurrency(influencers.reduce((s, i) => s + (i.total_commissions || 0), 0))}
                          </td>
                          <td className="py-3 text-right font-bold">
                            {formatCurrency(influencers.reduce((s, i) => s + (i.total_fixed_fees || 0), 0))}
                          </td>
                          <td className="py-3 text-right font-bold">
                            {avgRoas > 0 ? `${avgRoas.toFixed(1)}x` : "--"}
                          </td>
                          <td className="py-3"></td>
                          <td className="py-3"></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* ── Codes Non Attribués ──────────────────────── */}
            {unassignedCodes.length > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Tag className="h-5 w-5 text-amber-500" />
                    Codes promo non attribues
                  </CardTitle>
                  <Badge variant="warning">{unassignedCodes.length} a attribuer</Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-zinc-500 mb-4">
                    Ces codes generent des ventes sur Shopify mais ne sont pas encore associes a un influenceur ou classes comme code site/interne.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-zinc-300">
                          <th className="pb-3 text-left font-medium text-zinc-500">Code</th>
                          <th className="pb-3 text-right font-medium text-zinc-500">Commandes</th>
                          <th className="pb-3 text-right font-medium text-zinc-500">CA genere</th>
                          <th className="pb-3 text-right font-medium text-zinc-500">Remises</th>
                          <th className="pb-3 text-left font-medium text-zinc-500 min-w-[220px]">Attribuer a</th>
                          <th className="pb-3 text-center font-medium text-zinc-500">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unassignedCodes.map((uc) => (
                          <tr key={uc.code} className="border-b border-zinc-100 hover:bg-amber-50/30 transition-colors">
                            <td className="py-2.5">
                              <Badge variant="warning" className="font-mono">{uc.code}</Badge>
                            </td>
                            <td className="py-2.5 text-right font-medium text-zinc-700">{uc.orders}</td>
                            <td className="py-2.5 text-right font-medium text-zinc-700">{formatCurrency(uc.revenue)}</td>
                            <td className="py-2.5 text-right text-zinc-500">{formatCurrency(uc.discount)}</td>
                            <td className="py-2.5">
                              <select
                                className="w-full rounded-md border-2 border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                                value={assigningCode === uc.code ? assignTarget : ""}
                                onChange={(e) => {
                                  setAssigningCode(uc.code)
                                  setAssignTarget(e.target.value)
                                  if (e.target.value) handleQuickAssign(uc.code, e.target.value)
                                }}
                              >
                                <option value="">Choisir un influenceur...</option>
                                {influencers.map((inf) => (
                                  <option key={inf.id} value={inf.id}>{inf.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2.5 text-center">
                              <button
                                onClick={() => handleMarkAsSite(uc.code)}
                                className="text-xs px-2 py-1 rounded bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 transition-colors"
                                title="Marquer comme code site (pas influenceur)"
                              >
                                Code site
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

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
                      {influencers.map((inf) => (
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
                                  {influencers.map((inf) => (
                                    <option key={inf.id} value={inf.id}>{inf.name}</option>
                                  ))}
                                </optgroup>
                                <optgroup label="Catégorie générosité">
                                  <option value="cat:gifting">Gifting (MKG)</option>
                                  <option value="cat:welcome">Welcome / Générique</option>
                                  <option value="cat:offre_site">Offre Site / Promo</option>
                                  <option value="cat:logistique">Logistique (LA Poste)</option>
                                  <option value="cat:service_client">Service Client (CS)</option>
                                  <option value="cat:autre">Autre</option>
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

