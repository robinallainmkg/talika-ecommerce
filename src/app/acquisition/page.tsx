"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { DataInsights } from "@/components/data-insights"
import {
  Users,
  Megaphone,
  Search,
  Globe,
  DollarSign,
  TrendingUp,
  Target,
  Loader2,
  AlertTriangle,
  Info,
} from "lucide-react"

interface ChannelKPI {
  [key: string]: number | string
}

interface Channel {
  id: string
  name: string
  icon: string
  color: string
  revenue: number
  orders: number
  spend: number
  roas: number | null
  share: number
  new_customers?: number
  cpa?: number | null
  kpis: ChannelKPI
  note?: string
  blocked?: boolean
  pending?: boolean
}

interface CompassChannel {
  id: string
  name: string
  new_customers: number
  orders: number
  pct_nc: number
  spend: number
  cac: number | null
}

interface Compass {
  mer: number
  total_spend: number
  total_revenue: number
  new_customers: number
  cac_new_customer: number | null
  influence_cost_pending?: boolean
  channels: CompassChannel[]
}

interface AcquisitionData {
  period: { year: number; month: number }
  total_revenue: number
  total_orders: number
  total_spend: number
  blended_roas: number
  total_new_customers: number
  blended_cpa: number | null
  compass?: Compass
  channels: Channel[]
  meta_campaigns: any[]
}

const CHANNEL_ICONS: Record<string, typeof Users> = {
  Users,
  Megaphone,
  Search,
  Globe,
}

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]

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
      if (res.ok) {
        setData(await res.json())
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [selectedYear, selectedMonth])

  useEffect(() => { fetchData() }, [fetchData])

  const monthName = `${MONTHS[selectedMonth - 1]} ${selectedYear}`

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
            {/* Boussole acquisition — vérité hors attribution */}
            {data.compass && (
              <Card className="border-zinc-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="h-4 w-4" /> Boussole acquisition
                  </CardTitle>
                  <p className="text-xs text-zinc-500">
                    La vérité hors attribution : le MER et le CAC nouveau client ignorent les guerres Meta/influence.
                  </p>
                </CardHeader>
                <CardContent className="space-y-5">
                  {data.compass.influence_cost_pending && (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        Coût influence non saisi pour ce mois → <strong>MER et CAC sous-estimés</strong> (la dépense
                        influence manque). Le <strong>%NC reste fiable</strong>. Saisis les commissions/fees influence pour fiabiliser.
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-xs text-zinc-500">MER (ROAS réel)</div>
                      <div className="text-2xl font-bold text-zinc-900">{data.compass.mer.toFixed(1)}x</div>
                      <div className="text-[11px] text-zinc-400">CA total ÷ dépense totale</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">CAC nouveau client</div>
                      <div className="text-2xl font-bold text-zinc-900">
                        {data.compass.cac_new_customer ? formatCurrency(data.compass.cac_new_customer) : "—"}
                      </div>
                      <div className="text-[11px] text-zinc-400">dépense ÷ vrais nouveaux clients</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Nouveaux clients</div>
                      <div className="text-2xl font-bold text-zinc-900">{formatNumber(data.compass.new_customers)}</div>
                      <div className="text-[11px] text-zinc-400">1re commande jamais passée</div>
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
            )}

            {/* Global KPIs */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
              <KPICard
                label="CA Total"
                value={formatCurrency(data.total_revenue)}
                icon={<DollarSign className="h-5 w-5" />}
              />
              <KPICard
                label="Dépenses"
                value={formatCurrency(data.total_spend)}
                icon={<Target className="h-5 w-5" />}
              />
              <KPICard
                label="MER"
                value={`${data.blended_roas.toFixed(1)}x`}
                icon={<TrendingUp className="h-5 w-5" />}
              />
              <KPICard
                label="Commandes"
                value={formatNumber(data.total_orders)}
                icon={<Users className="h-5 w-5" />}
              />
              <KPICard
                label="Nouveaux Clients"
                value={formatNumber(data.total_new_customers || 0)}
                icon={<Users className="h-5 w-5" />}
              />
              <KPICard
                label="CAC nouv. client"
                value={data.blended_cpa ? formatCurrency(data.blended_cpa) : "—"}
                icon={<Target className="h-5 w-5" />}
              />
            </div>

            {/* Channel Mix Bar */}
            <Card>
              <CardHeader>
                <CardTitle>Répartition du CA par canal</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-10 rounded-lg overflow-hidden">
                  {data.channels
                    .filter(c => c.revenue > 0)
                    .map(channel => (
                      <div
                        key={channel.id}
                        className="flex items-center justify-center text-white text-xs font-medium transition-all"
                        style={{
                          backgroundColor: channel.color,
                          width: `${Math.max(channel.share, 2)}%`,
                        }}
                        title={`${channel.name}: ${channel.share.toFixed(1)}%`}
                      >
                        {channel.share > 10 && `${channel.name} ${channel.share.toFixed(0)}%`}
                      </div>
                    ))}
                </div>
                <div className="flex flex-wrap gap-3 sm:gap-4 mt-3">
                  {data.channels.filter(c => c.revenue > 0 || c.blocked).map(c => (
                    <div key={c.id} className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Channel Cards */}
            <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
              {data.channels.filter(c => c.id !== "organic").map(channel => {
                const Icon = CHANNEL_ICONS[channel.icon] || Globe
                return (
                  <Card key={channel.id} className={`${channel.blocked ? "opacity-50" : ""}`}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="rounded-lg p-2"
                            style={{ backgroundColor: channel.color + "15" }}
                          >
                            <Icon className="h-5 w-5" style={{ color: channel.color }} />
                          </div>
                          <CardTitle className="text-base">{channel.name}</CardTitle>
                        </div>
                        {channel.blocked ? (
                          <Badge variant="warning">Non connecté</Badge>
                        ) : (
                          <Badge variant="success">{channel.share.toFixed(0)}% du CA</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {channel.blocked ? (
                        <div className="flex items-start gap-2 text-sm text-zinc-500">
                          <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                          <span>{channel.note}</span>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Pending warning */}
                          {channel.pending && (
                            <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg p-2.5">
                              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              <span>Données de dépenses non disponibles pour ce mois</span>
                            </div>
                          )}

                          {/* Main metrics */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs text-zinc-500">Revenue attribué</div>
                              <div className="text-lg font-semibold text-zinc-900">
                                {formatCurrency(channel.revenue)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-zinc-500">Dépenses</div>
                              <div className="text-lg font-semibold text-zinc-900">
                                {channel.pending ? (
                                  <span className="text-amber-500">??</span>
                                ) : (
                                  formatCurrency(channel.spend)
                                )}
                              </div>
                            </div>
                          </div>

                          {/* ROAS */}
                          <div className="flex items-center justify-between rounded-lg bg-zinc-50 p-3">
                            <span className="text-sm font-medium text-zinc-600">ROAS</span>
                            <span
                              className={`text-xl font-bold ${
                                channel.pending
                                  ? "text-amber-500"
                                  : (channel.roas || 0) >= 5
                                  ? "text-emerald-600"
                                  : (channel.roas || 0) >= 2
                                  ? "text-blue-600"
                                  : "text-red-600"
                              }`}
                            >
                              {channel.pending ? "??" : channel.roas != null ? `${channel.roas.toFixed(1)}x` : "—"}
                            </span>
                          </div>

                          {/* New Customers + CPA */}
                          <div className="grid grid-cols-2 gap-3">
                            {channel.new_customers != null && channel.new_customers > 0 ? (
                              <div className="rounded-lg bg-violet-50 p-2.5 text-center">
                                <div className="text-xs text-violet-600 font-medium">Nouveaux Clients</div>
                                <div className="text-lg font-bold text-violet-700">{channel.new_customers}</div>
                              </div>
                            ) : channel.new_customers == null ? (
                              <div className="rounded-lg bg-zinc-50 p-2.5 text-center">
                                <div className="text-xs text-zinc-500 font-medium">Nouveaux Clients</div>
                                <div className="text-sm font-semibold text-zinc-400 leading-tight mt-0.5">non attribuable seul</div>
                                <div className="text-[10px] text-zinc-400">→ voir Boussole</div>
                              </div>
                            ) : null}
                            {channel.cpa != null && channel.cpa > 0 && (
                              <div className="rounded-lg bg-amber-50 p-2.5 text-center">
                                <div className="text-xs text-amber-600 font-medium">CPA</div>
                                <div className="text-lg font-bold text-amber-700">{formatCurrency(channel.cpa)}</div>
                              </div>
                            )}
                          </div>

                          {/* Orders */}
                          {channel.orders > 0 && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-zinc-500">Commandes</span>
                              <span className="font-medium">{formatNumber(channel.orders)}</span>
                            </div>
                          )}

                          {/* Channel-specific KPIs */}
                          {Object.entries(channel.kpis).map(([key, val]) => {
                            if (!val || val === 0) return null
                            const labels: Record<string, string> = {
                              influencers_actifs: "Influenceurs actifs",
                              aov: "Panier moyen",
                              impressions: "Impressions",
                              clicks: "Clics",
                              cpm: "CPM",
                              campaigns: "Campagnes actives",
                              commissions: "Commissions",
                              fixed_fees: "Frais fixes",
                            }
                            const isCurrency = ["aov", "cpm", "commissions", "fixed_fees"].includes(key)
                            const formatted = isCurrency
                              ? channel.pending ? "??" : formatCurrency(val as number)
                              : typeof val === "number" ? formatNumber(val) : String(val)
                            return (
                              <div key={key} className="flex items-center justify-between text-sm">
                                <span className="text-zinc-500">{labels[key] || key}</span>
                                <span className={`font-medium ${channel.pending && isCurrency ? "text-amber-500" : ""}`}>{formatted}</span>
                              </div>
                            )
                          })}

                          {/* Note */}
                          {channel.note && (
                            <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg p-2.5 mt-2">
                              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              <span>{channel.note}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Organic card (full width) */}
            {data.channels.find(c => c.id === "organic") && (
              <Card>
                <CardContent className="py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg p-2 bg-emerald-50">
                        <Globe className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-900">Organique / Direct / SEO</h3>
                        <p className="text-xs text-zinc-500">Commandes sans code promo influenceur ni attribution Meta</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 sm:gap-8 text-right">
                      <div>
                        <div className="text-xs text-zinc-500">Revenue</div>
                        <div className="text-lg font-semibold">
                          {formatCurrency(data.channels.find(c => c.id === "organic")!.revenue)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">Commandes</div>
                        <div className="text-lg font-semibold">
                          {formatNumber(data.channels.find(c => c.id === "organic")!.orders)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">Part du CA</div>
                        <div className="text-lg font-semibold">
                          {data.channels.find(c => c.id === "organic")!.share.toFixed(0)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Meta Campaigns detail */}
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
                        <th className="pb-3 text-right font-medium text-zinc-500">ROAS</th>
                        <th className="pb-3 text-right font-medium text-zinc-500">Clics</th>
                        <th className="pb-3 text-right font-medium text-zinc-500">CPM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.meta_campaigns.map((c: any, i: number) => (
                        <tr key={i} className="border-b border-zinc-100">
                          <td className="py-2.5 font-medium text-zinc-900">{c.name}</td>
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
