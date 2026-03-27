"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatNumber } from "@/lib/utils"
import { DataInsights } from "@/components/data-insights"
import {
  Mail,
  GitBranch,
  ListChecks,
  Send,
  Loader2,
  RefreshCw,
  Zap,
  AlertCircle,
} from "lucide-react"

interface Campaign {
  id: string
  name: string
  status: string
  send_time: string | null
  created_at: string | null
  updated_at: string | null
  archived: boolean
}

interface Flow {
  id: string
  name: string
  status: string
  trigger_type: string | null
  created: string | null
  updated: string | null
  archived: boolean
}

interface KlaviyoList {
  id: string
  name: string
  created: string | null
  updated: string | null
}

const campaignStatusBadge: Record<string, { label: string; variant: "success" | "warning" | "danger" | "default" | "info" }> = {
  sent: { label: "Envoyee", variant: "success" },
  draft: { label: "Brouillon", variant: "warning" },
  cancelled: { label: "Annulee", variant: "danger" },
  scheduled: { label: "Programmee", variant: "info" },
  sending: { label: "En envoi", variant: "info" },
}

const flowStatusBadge: Record<string, { label: string; variant: "success" | "warning" | "info" | "default" }> = {
  live: { label: "Actif", variant: "success" },
  draft: { label: "Brouillon", variant: "warning" },
  manual: { label: "Manuel", variant: "info" },
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014"
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export default function KlaviyoPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [lists, setLists] = useState<KlaviyoList[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)


  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/klaviyo")
      const json = await res.json()

      if (json.campaigns?.campaigns) {
        setCampaigns(json.campaigns.campaigns)
      }
      if (json.flows?.flows) {
        setFlows(json.flows.flows)
      }
      if (json.lists?.lists) {
        setLists(json.lists.lists)
      }
    } catch (err) {
      console.error("Failed to fetch Klaviyo data:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleSync() {
    setSyncing(true)
    setSyncError(null)
    try {
      const res = await fetch("/api/klaviyo/sync", { method: "POST" })
      const json = await res.json()
      if (!res.ok) {
        setSyncError(json.error || "Erreur lors de la synchronisation")
      } else {
        await fetchData()
      }
    } catch (err) {
      setSyncError("Erreur reseau lors de la synchronisation")
      console.error("Klaviyo sync failed:", err)
    } finally {
      setSyncing(false)
    }
  }

  // KPI calculations
  const activeFlows = flows.filter((f) => f.status === "live").length
  const draftFlows = flows.filter((f) => f.status === "draft").length
  const sentCampaigns = campaigns.filter((c) => c.status === "sent").length

  return (
    <div>
      <Header
        title="Klaviyo"
        subtitle="Campagnes email, flows et listes Klaviyo"
      />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <DataInsights page="klaviyo" />

        {/* Sync error */}
        {syncError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {syncError}
          </div>
        )}

        {/* KPI Cards */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        ) : campaigns.length > 0 || flows.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <KPICard
              label="Flows actifs"
              value={formatNumber(activeFlows)}
              icon={<Zap className="h-5 w-5" />}
            />
            <KPICard
              label="Campaigns envoyees"
              value={formatNumber(sentCampaigns)}
              icon={<Send className="h-5 w-5" />}
            />
            <KPICard
              label="Flows total"
              value={formatNumber(flows.length)}
              icon={<GitBranch className="h-5 w-5" />}
            />
            <KPICard
              label="Listes"
              value={formatNumber(lists.length)}
              icon={<ListChecks className="h-5 w-5" />}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
            <p className="text-sm text-zinc-500">
              Aucune donnee Klaviyo en cache.{" "}
              <button
                onClick={handleSync}
                disabled={syncing}
                className="text-zinc-900 underline underline-offset-2 hover:text-zinc-700"
              >
                Lancer une synchronisation
              </button>{" "}
              pour afficher les KPIs.
            </p>
          </div>
        )}

        {/* Draft flows alert */}
        {!loading && draftFlows > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                {draftFlows} flow{draftFlows > 1 ? "s" : ""} en brouillon
              </p>
              <p className="text-sm text-amber-700 mt-0.5">
                Ces flows pourraient etre actives pour ameliorer l&apos;engagement et les conversions.
                Verifiez les flows ci-dessous marques &quot;Brouillon&quot;.
              </p>
            </div>
          </div>
        )}

        {/* Recent Campaigns Table */}
        {!loading && campaigns.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Campagnes recentes
                </CardTitle>
                <Badge variant="info">{campaigns.length} campagnes</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-zinc-300">
                      <th className="pb-3 text-left font-medium text-zinc-500 min-w-[200px] sm:min-w-[300px]">
                        Nom
                      </th>
                      <th className="pb-3 text-left font-medium text-zinc-500 min-w-[100px]">
                        Statut
                      </th>
                      <th className="pb-3 text-left font-medium text-zinc-500 min-w-[100px]">
                        Date d&apos;envoi
                      </th>
                      <th className="pb-3 text-left font-medium text-zinc-500 min-w-[100px]">
                        Mise a jour
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((campaign) => {
                      const badge = campaignStatusBadge[campaign.status] || {
                        label: campaign.status,
                        variant: "default" as const,
                      }
                      return (
                        <tr
                          key={campaign.id}
                          className="border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors"
                        >
                          <td className="py-3">
                            <div className="font-medium text-zinc-900 truncate max-w-[400px]">
                              {campaign.name}
                            </div>
                          </td>
                          <td className="py-3">
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </td>
                          <td className="py-3 text-zinc-600">
                            {formatDate(campaign.send_time)}
                          </td>
                          <td className="py-3 text-zinc-500">
                            {formatDate(campaign.updated_at)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Flows Section */}
        {!loading && flows.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5" />
                  Flows
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="success">{activeFlows} actifs</Badge>
                  <Badge variant="warning">{draftFlows} brouillons</Badge>
                  <Badge variant="info">{flows.length} total</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-zinc-300">
                      <th className="pb-3 text-left font-medium text-zinc-500 min-w-[200px] sm:min-w-[300px]">
                        Nom
                      </th>
                      <th className="pb-3 text-left font-medium text-zinc-500 min-w-[100px]">
                        Statut
                      </th>
                      <th className="pb-3 text-left font-medium text-zinc-500 min-w-[120px]">
                        Type de declencheur
                      </th>
                      <th className="pb-3 text-left font-medium text-zinc-500 min-w-[120px]">
                        Mise a jour
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Show live flows first, then manual, then draft */}
                    {[...flows]
                      .sort((a, b) => {
                        const order: Record<string, number> = { live: 0, manual: 1, draft: 2 }
                        return (order[a.status] ?? 3) - (order[b.status] ?? 3)
                      })
                      .map((flow) => {
                        const badge = flowStatusBadge[flow.status] || {
                          label: flow.status,
                          variant: "default" as const,
                        }
                        return (
                          <tr
                            key={flow.id}
                            className="border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors"
                          >
                            <td className="py-3">
                              <div className="font-medium text-zinc-900 truncate max-w-[400px]">
                                {flow.name}
                              </div>
                            </td>
                            <td className="py-3">
                              <Badge variant={badge.variant}>{badge.label}</Badge>
                            </td>
                            <td className="py-3 text-zinc-600">
                              {flow.trigger_type || "\u2014"}
                            </td>
                            <td className="py-3 text-zinc-500">
                              {formatDate(flow.updated)}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lists Section */}
        {!loading && lists.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ListChecks className="h-5 w-5" />
                  Listes
                </CardTitle>
                <Badge variant="info">{lists.length} listes</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lists.map((list) => (
                  <div
                    key={list.id}
                    className="rounded-lg border border-zinc-200 p-3 hover:border-zinc-300 transition-colors"
                  >
                    <h4 className="font-medium text-zinc-900 text-sm truncate">
                      {list.name}
                    </h4>
                    <p className="text-xs text-zinc-400 mt-1">
                      Mise a jour : {formatDate(list.updated)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!loading && campaigns.length === 0 && flows.length === 0 && (
          <Card>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Mail className="h-10 w-10 text-zinc-300 mb-3" />
                <h3 className="text-lg font-medium text-zinc-700 mb-1">
                  Aucune donnee Klaviyo
                </h3>
                <p className="text-sm text-zinc-500 mb-4 max-w-md">
                  Cliquez sur &quot;Sync Klaviyo&quot; pour recuperer vos campagnes,
                  flows et listes depuis l&apos;API Klaviyo.
                </p>
                <Button variant="primary" size="sm" onClick={handleSync} disabled={syncing}>
                  {syncing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Synchronisation...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Synchroniser maintenant
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
