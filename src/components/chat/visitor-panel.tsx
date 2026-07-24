"use client"

import { useEffect, useState } from "react"
import { Monitor, Mail, Clock, FileText, ShoppingBag, ExternalLink, User, Phone, Truck } from "lucide-react"
import { adminFetch } from "@/lib/chat/admin-fetch"
import { parseUserAgent } from "@/lib/chat/ua"
import { relativeTime } from "@/components/chat/helpers"

type ConversationDetail = {
  id: string
  channel?: string | null
  visitor_phone?: string | null
  visitor_email: string | null
  visitor_name: string | null
  user_agent: string | null
  first_page_url: string | null
  last_page_url: string | null
  created_at: string
  message_count: number
}

// Réponse de /api/whatsapp/context (dossier livraison par téléphone).
type DeliveryContext = {
  matched: boolean
  matchedVia: "klaviyo_profile" | "shopify_phone" | null
  email: string | null
  firstName: string | null
  ordersLifetime: number
  summary: string
  warnings: string[]
  packageEvents: { status: string; at: string; carrier: string | null }[]
}

const PACKAGE_LABELS: Record<string, string> = {
  picked_up: "pris en charge",
  in_transit: "en transit",
  out_for_delivery: "en cours de livraison",
  delivered: "livré",
  delayed: "retardé",
  exception: "incident",
}

type CustomerOrder = {
  name: string
  createdAt: string
  total: string
  currency: string
  financialStatus: string | null
  fulfillmentStatus: string | null
  trackingUrl: string | null
  products: { title: string; quantity: number }[]
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
  const [delivery, setDelivery] = useState<DeliveryContext | null>(null)
  const isWhatsapp = conversation.channel === "whatsapp"

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

  // Dossier livraison WhatsApp : rattachement par téléphone (profil Klaviyo -> Shopify
  // -> évènements colis). C'est LA raison d'être du canal : répondre avec des faits.
  useEffect(() => {
    setDelivery(null)
    if (!isWhatsapp) return
    adminFetch(`/api/whatsapp/context?conversation=${conversation.id}`)
      .then((r) => r.json())
      .then((d) => setDelivery(d?.summary ? d : null))
      .catch(() => setDelivery(null))
  }, [conversation.id, isWhatsapp])

  return (
    <div className="w-72 shrink-0 overflow-y-auto border-l border-zinc-200 bg-zinc-50/50 p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {isWhatsapp ? "Cliente WhatsApp" : "Visiteur"}
      </h3>
      <div className="rounded-lg border border-zinc-200 bg-white px-3 py-1">
        {conversation.visitor_name && (
          <Row icon={<User className="h-3.5 w-3.5" />} label="Nom" value={conversation.visitor_name} />
        )}
        {isWhatsapp && conversation.visitor_phone && (
          <Row icon={<Phone className="h-3.5 w-3.5" />} label="Téléphone" value={conversation.visitor_phone} />
        )}
        <Row
          icon={<Mail className="h-3.5 w-3.5" />}
          label="Email"
          value={conversation.visitor_email || "Non communiqué"}
        />
        {!isWhatsapp && (
          <>
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
          </>
        )}
        <Row
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Conversation"
          value={`${conversation.message_count} msg · ${relativeTime(conversation.created_at)}`}
        />
      </div>

      {isWhatsapp && delivery && (
        <>
          <h3 className="mb-2 mt-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <Truck className="h-3.5 w-3.5" /> Dossier livraison
          </h3>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 text-xs text-zinc-700">
            <p>{delivery.summary}</p>
            {delivery.matched && (
              <p className="mt-1.5 text-[10px] text-zinc-400">
                Rattachée via {delivery.matchedVia === "klaviyo_profile" ? "profil Klaviyo" : "téléphone Shopify"}
                {delivery.email ? ` · ${delivery.email}` : ""}
              </p>
            )}
            {delivery.warnings.map((w, i) => (
              <p key={i} className="mt-1 text-[10px] text-amber-600">⚠ {w}</p>
            ))}
            {delivery.packageEvents.length > 0 && (
              <ul className="mt-2 space-y-0.5 border-t border-emerald-100 pt-1.5 text-[11px] text-zinc-600">
                {delivery.packageEvents.slice(0, 4).map((e, i) => (
                  <li key={i}>
                    {new Date(e.at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} —{" "}
                    {PACKAGE_LABELS[e.status] ?? e.status}
                    {e.carrier ? ` (${e.carrier})` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

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
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              {customer.ordersCount} commande{customer.ordersCount > 1 ? "s" : ""}
              {customer.totalSpent ? ` · ${customer.totalSpent} ${customer.currency || ""}` : ""}
            </p>
            {customer.ordersCount >= 3 ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">★ Cliente fidèle</span>
            ) : customer.ordersCount >= 2 ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Récurrente</span>
            ) : (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">1ʳᵉ commande</span>
            )}
          </div>
          {customer.orders.map((o) => (
            <div key={o.name} className="rounded-lg border border-zinc-200 bg-white p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-800">{o.name}</span>
                <span className="text-zinc-500">{new Date(o.createdAt).toLocaleDateString("fr-FR")}</span>
              </div>
              <div className="mt-0.5 text-zinc-600">
                {o.total} {o.currency} · {o.fulfillmentStatus || o.financialStatus || "—"}
              </div>
              {o.products.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-zinc-600">
                  {o.products.map((p, i) => (
                    <li key={i} className="truncate" title={p.title}>
                      <span className="text-zinc-400">{p.quantity}×</span> {p.title}
                    </li>
                  ))}
                </ul>
              )}
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
