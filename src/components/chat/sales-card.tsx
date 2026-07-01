"use client"

import { useEffect, useState } from "react"
import { TrendingUp, ChevronDown, ChevronUp, Bot, Headset } from "lucide-react"
import { adminFetch } from "@/lib/chat/admin-fetch"

type SalesData = {
  total_revenue: number
  orders_count: number
  conversations_with_email: number
  by_handler: Record<string, { revenue: number; orders: number }>
  orders: {
    order: string
    date: string
    amount: number
    products: string
    email: string
    handler: string
  }[]
}

// Noms lisibles pour les agents connus du backoffice.
const AGENT_NAMES: Record<string, string> = {
  "contact@talika.com": "Meha (SAV)",
}

function handlerLabel(handler: string): string {
  if (handler === "bot") return "Bot seul"
  return AGENT_NAMES[handler] || handler.split("@")[0]
}

function eur(n: number): string {
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`
}

export function SalesCard() {
  const [data, setData] = useState<SalesData | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    adminFetch("/api/chat/admin/sales")
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.total_revenue === "number") setData(d)
      })
      .catch(() => {})
  }, [])

  if (!data) return null

  return (
    <div className="mb-4 rounded-xl border border-zinc-200 bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-4 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <TrendingUp className="h-4 w-4 text-emerald-600" /> Ventes chat
        </span>
        <span className="text-sm font-bold text-emerald-700">{eur(data.total_revenue)}</span>
        <span className="text-xs text-zinc-500">
          {data.orders_count} commande{data.orders_count > 1 ? "s" : ""} attribuée{data.orders_count > 1 ? "s" : ""} (fenêtre 7 j)
        </span>
        <span className="ml-auto flex items-center gap-3">
          {Object.entries(data.by_handler).map(([h, s]) => (
            <span key={h} className="flex items-center gap-1 text-xs text-zinc-600">
              {h === "bot" ? <Bot className="h-3.5 w-3.5 text-zinc-400" /> : <Headset className="h-3.5 w-3.5 text-blue-500" />}
              {handlerLabel(h)} : <strong>{eur(s.revenue)}</strong>
            </span>
          ))}
          {open ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
        </span>
      </button>
      {open && (
        <div className="border-t border-zinc-100 px-4 py-2">
          <p className="mb-1 text-[11px] text-zinc-400">
            Attribution : commande passée dans les 7 jours suivant une conversation avec le même email ({data.conversations_with_email} conversations identifiées). Créditée à l&apos;agent qui a pris la main, sinon au bot.
          </p>
          {data.orders.length === 0 ? (
            <p className="py-2 text-xs text-zinc-400">Aucune vente attribuée pour le moment.</p>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.order} className="border-t border-zinc-50">
                    <td className="py-1.5 font-semibold text-zinc-800">{o.order}</td>
                    <td className="text-zinc-500">{new Date(o.date).toLocaleDateString("fr-FR")}</td>
                    <td className="text-zinc-600">{o.products}</td>
                    <td className="text-zinc-500">{o.email}</td>
                    <td className="text-zinc-600">{handlerLabel(o.handler)}</td>
                    <td className="text-right font-semibold text-emerald-700">{eur(o.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
