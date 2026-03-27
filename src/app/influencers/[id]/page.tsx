"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils"
import {
  ArrowLeft,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Target,
  Percent,
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
  Instagram,
  Mail,
  Phone,
  Tag,
  ChevronUp,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────
interface InfluencerCode {
  id: string
  code: string
  discount_percent: number
  is_active: boolean
  code_type?: string
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
  influencer_codes: InfluencerCode[]
}

interface ProductSale {
  title: string
  quantity: number
  revenue: number
  orders: number
}

interface MonthlyData {
  month: string
  revenue: number
  orders: number
}

interface RecentOrder {
  date: string
  amount: number
  products: string[]
  discount_code: string
}

interface FixedFee {
  id: string
  influencer_id: string
  amount: number
  month: number
  year: number
  label: string | null
}

interface ContentItem {
  id: string
  influencer_id: string
  type: string
  platform: string
  url: string | null
  title: string | null
  notes: string | null
  posted_at: string | null
  created_at: string
}

interface Stats {
  totalRevenue: number
  totalOrders: number
  avgOrderValue: number
  roas: number
  totalCost: number
}

const MONTHS_FR = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
]

const CONTENT_TYPES = [
  { value: "post", label: "Post" },
  { value: "story", label: "Story" },
  { value: "reel", label: "Reel" },
  { value: "video", label: "Vidéo" },
  { value: "other", label: "Autre" },
]

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "other", label: "Autre" },
]

function formatMonthLabel(monthStr: string): string {
  const [year, month] = monthStr.split("-")
  const m = parseInt(month, 10)
  if (m >= 1 && m <= 12) {
    return `${MONTHS_FR[m - 1]} ${year}`
  }
  return monthStr
}

function getStatusBadge(status: string | null): "success" | "danger" | "default" {
  if (status === "active") return "success"
  if (status === "paused" || status === "inactive") return "danger"
  return "default"
}

function getPlatformBadge(platform: string): "info" | "danger" | "warning" | "default" {
  if (platform === "instagram") return "info"
  if (platform === "tiktok") return "danger"
  if (platform === "youtube") return "warning"
  return "default"
}

function getTypeBadge(type: string): "info" | "success" | "warning" | "danger" | "default" {
  if (type === "post") return "info"
  if (type === "story") return "success"
  if (type === "reel") return "warning"
  if (type === "video") return "danger"
  return "default"
}

// ─── Page ────────────────────────────────────────────────────────
export default function InfluencerDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [influencer, setInfluencer] = useState<Influencer | null>(null)
  const [products, setProducts] = useState<ProductSale[]>([])
  const [timeline, setTimeline] = useState<MonthlyData[]>([])
  const [lastOrders, setLastOrders] = useState<RecentOrder[]>([])
  const [fixedFees, setFixedFees] = useState<FixedFee[]>([])
  const [content, setContent] = useState<ContentItem[]>([])
  const [stats, setStats] = useState<Stats>({
    totalRevenue: 0,
    totalOrders: 0,
    avgOrderValue: 0,
    roas: 0,
    totalCost: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Content form state
  const [showContentForm, setShowContentForm] = useState(false)
  const [contentForm, setContentForm] = useState({
    type: "post",
    platform: "instagram",
    url: "",
    title: "",
    notes: "",
    posted_at: "",
  })
  const [contentSaving, setContentSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/influencers/${id}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)

      setInfluencer(json.influencer)
      setProducts(json.products || [])
      setTimeline(json.timeline || [])
      setLastOrders(json.lastOrders || [])
      setFixedFees(json.fixedFees || [])
      setContent(json.content || [])
      setStats(json.stats || {
        totalRevenue: 0,
        totalOrders: 0,
        avgOrderValue: 0,
        roas: 0,
        totalCost: 0,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (id) fetchData()
  }, [id, fetchData])

  // ─── Content CRUD ────────────────────────────────────────────
  async function handleAddContent() {
    if (!contentForm.title.trim() && !contentForm.url.trim()) return
    setContentSaving(true)
    try {
      const res = await fetch("/api/influencers/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencer_id: id,
          ...contentForm,
          posted_at: contentForm.posted_at || null,
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setContentForm({
        type: "post",
        platform: "instagram",
        url: "",
        title: "",
        notes: "",
        posted_at: "",
      })
      setShowContentForm(false)
      await fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur")
    } finally {
      setContentSaving(false)
    }
  }

  async function handleDeleteContent(contentId: string) {
    if (!confirm("Supprimer ce contenu ?")) return
    try {
      const res = await fetch("/api/influencers/content", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contentId }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      await fetchData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur")
    }
  }

  // ─── Loading / Error ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    )
  }

  if (error || !influencer) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error || "Influenceur introuvable"}</p>
        <Link href="/influencers">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Retour
          </Button>
        </Link>
      </div>
    )
  }

  // ─── Computed values ──────────────────────────────────────────
  const maxTimelineRevenue = Math.max(...timeline.map((t) => t.revenue), 1)

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-50">
      <Header
        title={influencer.name}
        subtitle="Fiche influenceur"
        actions={
          <Link href="/influencers">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Retour</span>
            </Button>
          </Link>
        }
      />

      <main className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Status badge */}
        <div className="flex items-center gap-3">
          <Badge variant={getStatusBadge(influencer.status)}>
            {influencer.status === "active" ? "Actif" : influencer.status === "paused" ? "Pause" : influencer.status || "N/A"}
          </Badge>
          {influencer.tier && (
            <Badge variant="info">{influencer.tier}</Badge>
          )}
          {influencer.category && (
            <Badge variant="default">{influencer.category}</Badge>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          <KPICard
            label="CA Total"
            value={formatCurrency(stats.totalRevenue)}
            icon={<DollarSign className="h-4 w-4" />}
          />
          <KPICard
            label="Commandes"
            value={formatNumber(stats.totalOrders)}
            icon={<ShoppingCart className="h-4 w-4" />}
          />
          <KPICard
            label="Panier moyen"
            value={formatCurrency(stats.avgOrderValue)}
            icon={<Target className="h-4 w-4" />}
          />
          <KPICard
            label="ROAS"
            value={stats.roas > 0 ? `${stats.roas.toFixed(1)}x` : "N/A"}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <KPICard
            label="Commission"
            value={`${influencer.commission_rate ?? 0}%`}
            icon={<Percent className="h-4 w-4" />}
          />
        </div>

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left column - 2/3 */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            {/* Top Produits */}
            <Card>
              <CardHeader>
                <CardTitle>Top Produits</CardTitle>
              </CardHeader>
              <CardContent>
                {products.length === 0 ? (
                  <p className="text-sm text-zinc-400">Aucune donnée produit</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                          <th className="pb-2 pr-4">Produit</th>
                          <th className="pb-2 pr-4 text-right">Qté</th>
                          <th className="pb-2 pr-4 text-right">CA</th>
                          <th className="pb-2 text-right">% du CA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.slice(0, 20).map((p) => (
                          <tr key={p.title} className="border-b border-zinc-50">
                            <td className="py-2 pr-4 text-zinc-900 max-w-[200px] truncate">
                              {p.title}
                            </td>
                            <td className="py-2 pr-4 text-right text-zinc-600">
                              {formatNumber(p.quantity)}
                            </td>
                            <td className="py-2 pr-4 text-right font-medium text-zinc-900">
                              {formatCurrency(p.revenue)}
                            </td>
                            <td className="py-2 text-right text-zinc-500">
                              {stats.totalRevenue > 0
                                ? ((p.revenue / stats.totalRevenue) * 100).toFixed(1)
                                : "0"}
                              %
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Evolution mensuelle */}
            <Card>
              <CardHeader>
                <CardTitle>Evolution mensuelle</CardTitle>
              </CardHeader>
              <CardContent>
                {timeline.length === 0 ? (
                  <p className="text-sm text-zinc-400">Aucune donnée mensuelle</p>
                ) : (
                  <div className="space-y-2">
                    {timeline.slice(-12).map((t) => (
                      <div key={t.month} className="flex items-center gap-3">
                        <span className="w-20 text-xs text-zinc-500 shrink-0">
                          {formatMonthLabel(t.month)}
                        </span>
                        <div className="flex-1 h-6 bg-zinc-100 rounded-md overflow-hidden">
                          <div
                            className="h-full bg-zinc-800 rounded-md transition-all"
                            style={{
                              width: `${Math.max((t.revenue / maxTimelineRevenue) * 100, 2)}%`,
                            }}
                          />
                        </div>
                        <span className="w-20 text-xs font-medium text-zinc-700 text-right shrink-0">
                          {formatCurrency(t.revenue)}
                        </span>
                        <span className="w-14 text-xs text-zinc-400 text-right shrink-0">
                          {formatNumber(t.orders)} cmd
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dernieres commandes */}
            <Card>
              <CardHeader>
                <CardTitle>Dernieres commandes</CardTitle>
              </CardHeader>
              <CardContent>
                {lastOrders.length === 0 ? (
                  <p className="text-sm text-zinc-400">Aucune commande</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                          <th className="pb-2 pr-4">Date</th>
                          <th className="pb-2 pr-4 text-right">Montant</th>
                          <th className="pb-2 pr-4">Produits</th>
                          <th className="pb-2">Code</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lastOrders.map((o, idx) => (
                          <tr key={`${o.date}-${idx}`} className="border-b border-zinc-50">
                            <td className="py-2 pr-4 text-zinc-500 whitespace-nowrap">
                              {o.date ? formatDate(o.date) : "N/A"}
                            </td>
                            <td className="py-2 pr-4 text-right font-medium text-zinc-900">
                              {formatCurrency(o.amount)}
                            </td>
                            <td className="py-2 pr-4 text-zinc-600 max-w-[250px] truncate">
                              {o.products.join(", ")}
                            </td>
                            <td className="py-2">
                              <Badge variant="default">{o.discount_code}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column - 1/3 */}
          <div className="space-y-4 sm:space-y-6">
            {/* Infos */}
            <Card>
              <CardHeader>
                <CardTitle>Infos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  {influencer.instagram_handle && (
                    <div className="flex items-center gap-2">
                      <Instagram className="h-4 w-4 text-zinc-400" />
                      <a
                        href={`https://instagram.com/${influencer.instagram_handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        @{influencer.instagram_handle}
                      </a>
                    </div>
                  )}
                  {influencer.tiktok_handle && (
                    <div className="flex items-center gap-2">
                      <span className="h-4 w-4 text-zinc-400 text-xs font-bold flex items-center justify-center">TT</span>
                      <a
                        href={`https://tiktok.com/@${influencer.tiktok_handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        @{influencer.tiktok_handle}
                      </a>
                    </div>
                  )}
                  {influencer.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-zinc-400" />
                      <a
                        href={`mailto:${influencer.email}`}
                        className="text-zinc-700 hover:underline"
                      >
                        {influencer.email}
                      </a>
                    </div>
                  )}
                  {influencer.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-zinc-400" />
                      <span className="text-zinc-700">{influencer.phone}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-zinc-100 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Tier</span>
                      <span className="text-zinc-700">{influencer.tier || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Commission</span>
                      <span className="text-zinc-700">{influencer.commission_rate ?? 0}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Statut</span>
                      <Badge variant={getStatusBadge(influencer.status)}>
                        {influencer.status || "N/A"}
                      </Badge>
                    </div>
                  </div>
                  {influencer.notes && (
                    <div className="pt-2 border-t border-zinc-100">
                      <span className="text-xs text-zinc-400">Notes</span>
                      <p className="text-zinc-600 mt-1">{influencer.notes}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Codes promo */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Codes promo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {influencer.influencer_codes.length === 0 ? (
                  <p className="text-sm text-zinc-400">Aucun code</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {influencer.influencer_codes.map((c) => (
                      <Badge
                        key={c.id}
                        variant={c.is_active ? "success" : "default"}
                      >
                        {c.code}
                        {c.discount_percent > 0 && ` (-${c.discount_percent}%)`}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Fees fixes */}
            <Card>
              <CardHeader>
                <CardTitle>Fees fixes</CardTitle>
              </CardHeader>
              <CardContent>
                {fixedFees.length === 0 ? (
                  <p className="text-sm text-zinc-400">Aucun fee fixe</p>
                ) : (
                  <div className="space-y-2">
                    {fixedFees.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-zinc-600">
                          {MONTHS_FR[(f.month || 1) - 1]} {f.year}
                          {f.label && (
                            <span className="text-zinc-400 ml-1">({f.label})</span>
                          )}
                        </span>
                        <span className="font-medium text-zinc-900">
                          {formatCurrency(f.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Contenu & Posts */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Contenu & Posts</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowContentForm(!showContentForm)}
                  >
                    {showContentForm ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    <span className="ml-1 text-xs">
                      {showContentForm ? "Fermer" : "Ajouter"}
                    </span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Add form */}
                {showContentForm && (
                  <div className="mb-4 p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                        value={contentForm.type}
                        onChange={(e) =>
                          setContentForm({ ...contentForm, type: e.target.value })
                        }
                      >
                        {CONTENT_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                        value={contentForm.platform}
                        onChange={(e) =>
                          setContentForm({
                            ...contentForm,
                            platform: e.target.value,
                          })
                        }
                      >
                        {PLATFORMS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="text"
                      placeholder="Titre"
                      className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      value={contentForm.title}
                      onChange={(e) =>
                        setContentForm({ ...contentForm, title: e.target.value })
                      }
                    />
                    <input
                      type="url"
                      placeholder="URL"
                      className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      value={contentForm.url}
                      onChange={(e) =>
                        setContentForm({ ...contentForm, url: e.target.value })
                      }
                    />
                    <textarea
                      placeholder="Notes"
                      rows={2}
                      className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm resize-none"
                      value={contentForm.notes}
                      onChange={(e) =>
                        setContentForm({ ...contentForm, notes: e.target.value })
                      }
                    />
                    <input
                      type="date"
                      className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      value={contentForm.posted_at}
                      onChange={(e) =>
                        setContentForm({
                          ...contentForm,
                          posted_at: e.target.value,
                        })
                      }
                    />
                    <Button
                      size="sm"
                      onClick={handleAddContent}
                      disabled={contentSaving}
                      className="w-full"
                    >
                      {contentSaving ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Plus className="h-3 w-3 mr-1" />
                      )}
                      Ajouter
                    </Button>
                  </div>
                )}

                {/* Content list */}
                {content.length === 0 ? (
                  <p className="text-sm text-zinc-400">Aucun contenu</p>
                ) : (
                  <div className="space-y-3">
                    {content.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-start justify-between gap-2 p-2 rounded-md border border-zinc-100 hover:bg-zinc-50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant={getTypeBadge(c.type)}>
                              {CONTENT_TYPES.find((t) => t.value === c.type)?.label || c.type}
                            </Badge>
                            <Badge variant={getPlatformBadge(c.platform)}>
                              {PLATFORMS.find((p) => p.value === c.platform)?.label || c.platform}
                            </Badge>
                            {c.posted_at && (
                              <span className="text-xs text-zinc-400">
                                {formatDate(c.posted_at)}
                              </span>
                            )}
                          </div>
                          {c.title && (
                            <p className="text-sm text-zinc-700 mt-1 truncate">
                              {c.title}
                            </p>
                          )}
                          {c.url && (
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Voir
                            </a>
                          )}
                          {c.notes && (
                            <p className="text-xs text-zinc-400 mt-1 truncate">
                              {c.notes}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteContent(c.id)}
                          className="shrink-0 p-1 text-zinc-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
