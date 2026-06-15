"use client"

import { useEffect, useState } from "react"
import { Monitor, Mail, Clock, FileText, ShoppingBag, ExternalLink, User } from "lucide-react"
import { adminFetch } from "@/lib/chat/admin-fetch"
import { parseUserAgent } from "@/lib/chat/ua"
import { relativeTime } from "@/components/chat/helpers"

type ConversationDetail = {
  id: string
  visitor_email: string | null
  visitor_name: string | null
  user_agent: string | null
  first_page_url: string | null
  last_page_url: string | null
  created_at: string
  message_count: number
}

type CustomerOrder = {
  name: string
  createdAt: string
  total: string
  currency: string
  financialStatus: string | null
  fulfillmentStatus: string | null
  trackingUrl: string | null
}

type Customer = {
  found: boolean
  ordersCount: number
  totalSpent: string | null
  currency: string | null
  orders: CustomerOrder[]
}

function Row({ icon, label, value, title }: { icon: React.ReactNode; label: string; value: string; title?: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="mt-0.5 text-zinc-400">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-zinc-400">{label}</div>
        <div className="truncate text-sm text-zinc-700" title={title || value}>{value}</div>
      </div>
    </div>
  )
}

export function VisitorPanel({ conversation }: { conversation: ConversationDetail }) {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loadingCustomer, setLoadingCustomer] = useState(false)

  useEffect(() => {
    setCustomer(null)
    if (!conversation.visitor_email) return
    setLoadingCustomer(true)
    adminFetch(`/api/chat/admin/conversations/${conversation.id}/customer`)
      .then((r) => r.json())
      .then((d) => setCustomer(d))
      .catch(() => setCustomer(null))
      .finally(() => setLoadingCustomer(false))
  }, [conversation.id, conversation.visitor_email])

  return (
    <div className="w-72 shrink-0 overflow-y-auto border-l border-zinc-200 bg-zinc-50/50 p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Visiteur</h3>
      <div className="rounded-lg border border-zinc-200 bg-white px-3 py-1">
        {conversation.visitor_name && (
          <Row icon={<User className="h-3.5 w-3.5" />} label="Nom" value={conversation.visitor_name} />
        )}
        <Row
          icon={<Mail className="h-3.5 w-3.5" />}
          label="Email"
          value={conversation.visitor_email || "Non communiqué"}
        />
        <Row icon={<Monitor className="h-3.5 w-3.5" />} label="Appareil" value={parseUserAgent(conversation.user_agent)} />
        <Row
          icon={<FileText className="h-3.5 w-3.5" />}
          label="Page actuelle"
          value={conversation.last_page_url || conversation.first_page_url || "—"}
          title={conversation.last_page_url || conversation.first_page_url || ""}
        />
        {conversation.first_page_url && conversation.first_page_url !== conversation.last_page_url && (
          <Row icon={<FileText className="h-3.5 w-3.5" />} label="Page d'arrivée" value={conversation.first_page_url} title={conversation.first_page_url} />
        )}
        <Row
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Conversation"
          value={`${conversation.message_count} msg · ${relativeTime(conversation.created_at)}`}
        />
      </div>

      <h3 className="mb-2 mt-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <ShoppingBag className="h-3.5 w-3.5" /> Client Shopify
      </h3>
      {!conversation.visitor_email ? (
        <p className="text-xs text-zinc-400">Email inconnu — pas de rapprochement possible. Demandez son email au visiteur.</p>
      ) : loadingCustomer ? (
        <p className="text-xs text-zinc-400">Recherche…</p>
      ) : !customer?.found ? (
        <p className="text-xs text-zinc-400">Aucune commande trouvée pour {conversation.visitor_email}.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">
            {customer.ordersCount} commande{customer.ordersCount > 1 ? "s" : ""}
            {customer.totalSpent ? ` · ${customer.totalSpent} ${customer.currency || ""} (récentes)` : ""}
          </p>
          {customer.orders.map((o) => (
            <div key={o.name} className="rounded-lg border border-zinc-200 bg-white p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-800">{o.name}</span>
                <span className="text-zinc-500">{new Date(o.createdAt).toLocaleDateString("fr-FR")}</span>
              </div>
              <div className="mt-0.5 text-zinc-600">
                {o.total} {o.currency} · {o.fulfillmentStatus || o.financialStatus || "—"}
              </div>
              {o.trackingUrl && (
                <a href={o.trackingUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-blue-600 hover:underline">
                  Suivi <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
