"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { DataInsights } from "@/components/data-insights"
import {
  Users,
  Megaphone,
  Search,
  Target,
  Loader2,
  AlertTriangle,
  Info,
  ArrowLeftRight,
  RefreshCw,
} from "lucide-react"

interface AttributionChannel {
  id: string
  name: string
  color: string
  orders: number
  revenue: number
  share: number
}

interface ChannelCard {
  id: string
  name: string
  measured: boolean
  color: string
  revenue?: number
  claimed_revenue?: number
  measured_revenue?: number
  measured_orders?: number
  orders?: number
  spend: number
  roas: number | null
  share?: number
  new_customers?: number
  nc_rate?: number | null
  cpa?: number | null
  pending?: boolean
  blocked?: boolean
  note?: string
  kpis: Record<string, number>
}

interface AcquisitionData {
  period: { year: number; month: number }
  partial: { is_current: boolean; day: number; days_in_month: number }
  total_revenue: number
  total_orders: number
  total_spend: number
  blended_roas: number
  total_new_customers: number
  blended_cpa: number | null
  pace: {
    prev_year_same_days: number
    target_same_days: number
    vs_prev_year_pct: number
    vs_target_pct: number
  } | null
  attribution: { available: boolean; coverage: number; channels: AttributionChannel[] }
  overlap: {
    influence_orders: number
    influence_revenue: number
    meta_touched_orders: number
    meta_touched_revenue: number
    google_touched_orders: number
    google_touched_revenue: number
    meta_claimed_revenue: number
    google_claimed_revenue: number
    claims_sum_pct: number
  }
  compass: {
    mer: number
    new_customers: number
    cac_new_customer: number | null
    influence_cost_pending?: boolean
    channels: Array<{
      id: string
      name: string
      new_customers: number
      orders: number
      pct_nc: number
      spend: number
      cac: number | null
    }>
  }
  trend: Array<{ ym: string; revenue: number; orders: number; ads_spend: number; ratio: number | null }>
  freshness: Array<{ source: string; updated_at: string }>
  channels: ChannelCard[]
  meta_campaigns: any[]
}

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]
const MONTHS_SHORT = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sep", "oct", "nov", "déc"]

const CARD_ICONS: Record<string, typeof Users> = {
  influence: Users,
  meta: Megaphone,
  google: Search,
}

function frDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}h${String(d.getMinutes()).padStart(2, "0")}`
}

export default function AcquisitionPage() {
  const now = new Date()
  const [data, setData] = useState<AcquisitionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/acquisition?year=${selectedYear}&month=${selectedMonth}`)
      if (res.ok) setData(await res.json())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [selectedYear, selectedMonth])

  useEffect(() => { fetchData() }, [fetchData])

  const monthName = `${MONTHS[selectedMonth - 1]} ${selectedYear}`
  const maxTrendRevenue = data ? Math.max(...data.trend.map(t => t.revenue), 1) : 1

  return (
    <div>
      <Header
        title="Acquisition"
        subtitle={`Vue multi-canal — ${monthName}`}
        actions={
          <div className="flex items-center gap-2">
            <select
              className="text-sm border border-zinc-200 rounded-lg px-3 py-1.5 bg-white"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              className="text-sm border border-zinc-200 rounded-lg px-3 py-1.5 bg-white"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            >
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
          </div>
        }
      />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <DataInsights page="acquisition" />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            <span className="ml-2 text-zinc-500">Chargement...</span>
          </div>
        ) : !data ? (
          <div className="text-center py-12 text-zinc-500">Aucune donnée disponible.</div>
        ) : (
          <>
            {/* ── Boussole — le juge de paix hors attribution ── */}
            <Card className="border-zinc-300">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="h-4 w-4" /> Boussole acquisition
                  </CardTitle>
                  {data.partial.is_current && (
                    <span className="text-xs bg-blue-50 text-blue-700 rounded-full px-2.5 py-1">
                      Mois en cours — J{data.partial.day}/{data.partial.days_in_month}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {data.compass.influence_cost_pending && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      Coût influence non saisi pour ce mois → <strong>MER et CAC surestimés</strong>.
                      Saisis les commissions / forfaits pour fiabiliser.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <div className="text-xs text-zinc-500">CA total (TTC)</div>
                    <div className="text-2xl font-bold text-zinc-900">{formatCurrency(data.total_revenue)}</div>
                    {data.pace && (
                      <div className={`text-[11px] ${data.pace.vs_prev_year_pct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {data.pace.vs_prev_year_pct >= 0 ? "+" : ""}{data.pace.vs_prev_year_pct.toFixed(0)} % vs {selectedYear - 1} (J1→J{data.partial.day})
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <div className="text-xs text-zinc-500">MER (CA ÷ dépenses)</div>
                    <div className={`text-2xl font-bold ${data.compass.influence_cost_pending ? "text-amber-500" : "text-zinc-900"}`}>
                      {data.blended_roas.toFixed(1)}x
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {data.compass.influence_cost_pending ? "coût influence manquant" : `dépenses ${formatCurrency(data.total_spend)}`}
                    </div>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <div className="text-xs text-zinc-500">Nouveaux clients</div>
                    <div className="text-2xl font-bold text-zinc-900">{formatNumber(data.total_new_customers)}</div>
                    <div className="text-[11px] text-zinc-400">1re commande jamais passée</div>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <div className="text-xs text-zinc-500">Objectif ({selectedYear - 1} × 1,2)</div>
                    <div className="text-2xl font-bold text-zinc-900">
                      {data.pace ? `${data.pace.vs_target_pct.toFixed(0)} %` : "—"}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {data.pace ? `cible ${formatCurrency(data.pace.target_same_days)} à J${data.partial.day}` : "pas de référence N-1"}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-zinc-500">% nouveaux clients par canal</div>
                  {data.compass.channels.map((ch) => (
                    <div key={ch.id} className="flex items-center gap-3">
                      <div className="w-36 shrink-0 text-sm text-zinc-700">{ch.name}</div>
                      <div className="flex-1 h-5 rounded bg-zinc-100 overflow-hidden">
                        <div
                          className="h-full flex items-center justify-end pr-1.5 text-[10px] font-medium text-white"
                          style={{
                            width: `${Math.max(ch.pct_nc, 8)}%`,
                            backgroundColor: ch.id === "influence" ? "#8b5cf6" : "#3b82f6",
                          }}
                        >
                          {ch.pct_nc.toFixed(0)}%
                        </div>
                      </div>
                      <div className="w-52 shrink-0 text-right text-xs text-zinc-500">
                        {formatNumber(ch.new_customers)} NC / {formatNumber(ch.orders)} cmd
                        {ch.cac ? ` · CAC ${formatCurrency(ch.cac)}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* ── Attribution déterministe : une commande = un canal ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Attribution par commande — somme = 100 %</CardTitle>
                <p className="text-xs text-zinc-500">
                  Règle : code influenceur &gt; pub (gclid / fbclid) &gt; email &gt; SEO &gt; direct. Session d&apos;achat, TTC.
                </p>
              </CardHeader>
              <CardContent>
                {data.attribution.available ? (
                  <>
                    <div className="flex h-10 rounded-lg overflow-hidden">
                      {data.attribution.channels.filter(c => c.revenue > 0).map(c => (
                        <div
                          key={c.id}
                          className="flex items-center justify-center text-white text-xs font-medium"
                          style={{ backgroundColor: c.color, width: `${Math.max(c.share, 1.5)}%` }}
                          title={`${c.name} : ${formatCurrency(c.revenue)} (${c.share.toFixed(1)} %)`}
                        >
                          {c.share > 9 && `${c.share.toFixed(0)}%`}
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
                      {data.attribution.channels.filter(c => c.revenue > 0).map(c => (
                        <div key={c.id} className="flex items-center gap-1.5 text-xs text-zinc-600">
                          <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
                          <span>{c.name}</span>
                          <span className="text-zinc-400">{formatCurrency(c.revenue)} · {formatNumber(c.orders)} cmd</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-start gap-2 text-sm text-zinc-500">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      Données d&apos;attribution (UTM / referrer) non disponibles pour ce mois — le sync les
                      capture depuis juin 2026. Seule la part influence (codes) est mesurable.
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Overlap mesuré : qui revendique quoi sur le même CA ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ArrowLeftRight className="h-4 w-4" /> Overlap — revendiqué vs mesuré
                </CardTitle>
                <p className="text-xs text-zinc-500">
                  Les plateformes s&apos;attribuent des ventes déjà générées par l&apos;influence. Ici, l&apos;écart est chiffré.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-zinc-200 p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-zinc-800">Meta</span>
                      <Badge variant="warning">revendiqué (pixel)</Badge>
                    </div>
                    <div className="text-sm text-zinc-600">
                      Revendique <strong>{formatCurrency(data.overlap.meta_claimed_revenue)}</strong>
                    </div>
                    <div className="text-xs text-zinc-500">
                      Mesuré en session d&apos;achat : {formatCurrency(data.channels.find(c => c.id === "meta")?.measured_revenue || 0)} hors code
                      {data.attribution.available && (
                        <> + {formatCurrency(data.overlap.meta_touched_revenue)} sur {data.overlap.meta_touched_orders} commandes à code (comptées Influence)</>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-200 p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-zinc-800">Google</span>
                      <Badge variant="warning">revendiqué</Badge>
                    </div>
                    <div className="text-sm text-zinc-600">
                      Revendique <strong>{formatCurrency(data.overlap.google_claimed_revenue)}</strong>
                    </div>
                    <div className="text-xs text-zinc-500">
                      Mesuré en session d&apos;achat : {formatCurrency(data.channels.find(c => c.id === "google")?.measured_revenue || 0)} hors code
                      {data.attribution.available && (
                        <> + {formatCurrency(data.overlap.google_touched_revenue)} sur {data.overlap.google_touched_orders} commandes à code (comptées Influence)</>
                      )}
                    </div>
                  </div>
                </div>
                {data.overlap.claims_sum_pct > 100 && (
                  <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg p-2.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      Influence mesurée + revendications plateformes = {data.overlap.claims_sum_pct.toFixed(0)} % du CA
                      → les mêmes ventes sont comptées plusieurs fois par les plateformes. La partition ci-dessus, elle, somme à 100 %.
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Cartes canaux ── */}
            <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
              {data.channels.map(channel => {
                const Icon = CARD_ICONS[channel.id] || Users
                return (
                  <Card key={channel.id} className={channel.blocked ? "opacity-50" : ""}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="rounded-lg p-2" style={{ backgroundColor: channel.color + "15" }}>
                            <Icon className="h-5 w-5" style={{ color: channel.color }} />
                          </div>
                          <CardTitle className="text-base">{channel.name}</CardTitle>
                        </div>
                        {channel.measured ? (
                          <Badge variant="success">mesuré · code</Badge>
                        ) : (
                          <Badge variant="warning">revendiqué · pixel</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {channel.pending && (
                          <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg p-2.5">
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>Coût influence non saisi pour ce mois</span>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-xs text-zinc-500">
                              {channel.measured ? "CA commandes à code" : "Revenue revendiqué"}
                            </div>
                            <div className="text-lg font-semibold text-zinc-900">
                              {formatCurrency(channel.measured ? (channel.revenue || 0) : (channel.claimed_revenue || 0))}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-zinc-500">Dépenses</div>
                            <div className="text-lg font-semibold text-zinc-900">
                              {channel.pending ? <span className="text-amber-500">à saisir</span> : formatCurrency(channel.spend)}
                            </div>
                          </div>
                        </div>

                        {!channel.measured && (
                          <div className="rounded-lg bg-zinc-50 p-2.5 text-xs text-zinc-600">
                            Mesuré en session d&apos;achat (hors code) :{" "}
                            <strong>{formatCurrency(channel.measured_revenue || 0)}</strong> · {channel.measured_orders} cmd
                          </div>
                        )}

                        <div className="flex items-center justify-between rounded-lg bg-zinc-50 p-3">
                          <span className="text-sm font-medium text-zinc-600">
                            {channel.measured ? "ROAS (mesuré)" : "ROAS (déclaré)"}
                          </span>
                          <span className={`text-xl font-bold ${channel.pending ? "text-amber-500" : "text-zinc-900"}`}>
                            {channel.pending ? "??" : channel.roas != null ? `${channel.roas.toFixed(1)}x` : "—"}
                          </span>
                        </div>

                        {channel.measured && (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-violet-50 p-2.5 text-center">
                              <div className="text-xs text-violet-600 font-medium">Nouveaux clients</div>
                              <div className="text-lg font-bold text-violet-700">
                                {channel.new_customers}
                                {channel.nc_rate != null && (
                                  <span className="text-xs font-medium text-violet-500"> ({channel.nc_rate.toFixed(0)} %)</span>
                                )}
                              </div>
                            </div>
                            {channel.cpa != null && channel.cpa > 0 && (
                              <div className="rounded-lg bg-amber-50 p-2.5 text-center">
                                <div className="text-xs text-amber-600 font-medium">CPA</div>
                                <div className="text-lg font-bold text-amber-700">{formatCurrency(channel.cpa)}</div>
                              </div>
                            )}
                          </div>
                        )}

                        {(channel.orders || 0) > 0 && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-zinc-500">Commandes</span>
                            <span className="font-medium">{formatNumber(channel.orders || 0)}</span>
                          </div>
                        )}

                        {Object.entries(channel.kpis).map(([key, val]) => {
                          if (!val) return null
                          const labels: Record<string, string> = {
                            aov: "Panier moyen",
                            impressions: "Impressions",
                            clicks: "Clics",
                            cpm: "CPM",
                            campaigns: "Campagnes actives",
                            commissions: "Commissions",
                            fixed_fees: "Forfaits",
                          }
                          const isCurrency = ["aov", "cpm", "commissions", "fixed_fees"].includes(key)
                          return (
                            <div key={key} className="flex items-center justify-between text-sm">
                              <span className="text-zinc-500">{labels[key] || key}</span>
                              <span className="font-medium">
                                {isCurrency ? formatCurrency(val) : formatNumber(val)}
                              </span>
                            </div>
                          )
                        })}

                        {channel.note && !channel.blocked && (
                          <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-50 rounded-lg p-2.5">
                            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>{channel.note}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* ── Tendance 6 mois ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tendance — CA vs dépenses ads</CardTitle>
                <p className="text-xs text-zinc-500">
                  Barre grise = CA · barre bleue = ads (Meta + Google) · chiffre = CA par € d&apos;ads
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-6 gap-2 sm:gap-4 items-end">
                  {data.trend.map(t => {
                    const [y, m] = t.ym.split("-").map(Number)
                    const hRev = Math.max(Math.round((t.revenue / maxTrendRevenue) * 80), 2)
                    const hAds = Math.max(Math.round((t.ads_spend / maxTrendRevenue) * 80), t.ads_spend > 0 ? 3 : 0)
                    return (
                      <div key={t.ym} className="text-center">
                        <div className="h-[84px] flex items-end justify-center gap-1">
                          <div
                            className="w-6 rounded-t bg-zinc-300"
                            style={{ height: `${hRev}px` }}
                            title={`CA ${formatCurrency(t.revenue)}`}
                          />
                          <div
                            className="w-2.5 rounded-t bg-blue-500"
                            style={{ height: `${hAds}px` }}
                            title={`Ads ${formatCurrency(t.ads_spend)}`}
                          />
                        </div>
                        <div className="text-[11px] text-zinc-600 mt-1.5">{MONTHS_SHORT[m - 1]} {String(y).slice(2)}</div>
                        <div className="text-[11px] text-zinc-400">{formatCurrency(t.revenue)}</div>
                        <div className="text-[11px] font-medium text-zinc-500">{t.ratio != null ? `${t.ratio}x` : "—"}</div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* ── Fraîcheur des sources ── */}
            <div className="flex flex-wrap gap-2">
              {data.freshness.map(f => (
                <span key={f.source} className="inline-flex items-center gap-1.5 text-xs text-zinc-500 bg-zinc-100 rounded-full px-2.5 py-1">
                  <RefreshCw className="h-3 w-3" />
                  {f.source} · maj {frDate(f.updated_at)}
                </span>
              ))}
              {data.compass.influence_cost_pending && (
                <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-full px-2.5 py-1">
                  <AlertTriangle className="h-3 w-3" />
                  coût influence : à saisir
                </span>
              )}
            </div>

            {/* ── Campagnes Meta ── */}
            {data.meta_campaigns.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Campagnes Meta Ads actives</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200">
                        <th className="pb-3 text-left font-medium text-zinc-500 min-w-[200px]">Campagne</th>
                        <th className="pb-3 text-right font-medium text-zinc-500">Spend</th>
                        <th className="pb-3 text-right font-medium text-zinc-500">ROAS déclaré</th>
                        <th className="pb-3 text-right font-medium text-zinc-500">Clics</th>
                        <th className="pb-3 text-right font-medium text-zinc-500">CPM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.meta_campaigns.map((c: any, i: number) => (
                        <tr key={i} className="border-b border-zinc-100">
                          <td className="py-2.5 font-medium text-zinc-900">{c.campaign_name || c.name}</td>
                          <td className="py-2.5 text-right">{formatCurrency(parseFloat(c.spend || "0"))}</td>
                          <td className="py-2.5 text-right">
                            <Badge variant={parseFloat(c.roas || "0") >= 5 ? "success" : "default"}>
                              {parseFloat(c.roas || "0").toFixed(1)}x
                            </Badge>
                          </td>
                          <td className="py-2.5 text-right">{formatNumber(parseInt(c.clicks || "0"))}</td>
                          <td className="py-2.5 text-right">{formatCurrency(parseFloat(c.cpm || "0"))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
