"use client"

import { useCallback, useEffect, useState } from "react"
import { Header } from "@/components/layout/header"
import { getMarketCookie } from "@/components/layout/market-switch"
import { InfluencerDrawer } from "@/components/influence/influencer-drawer"
import { Heart, MessageCircle, ExternalLink, RefreshCw, Loader2, Film, Image as ImageIcon } from "lucide-react"

interface ContentRow {
  id: string
  influencer_id: string
  type: string | null
  media_product_type: string | null
  url: string | null
  caption: string | null
  thumbnail_url: string | null
  like_count: number | null
  comments_count: number | null
  is_brand: boolean
  posted_at: string | null
  influencers: { id: string; name: string; instagram_handle: string | null; market: string; metadata: Record<string, unknown> | null }
}

function Thumb({ row }: { row: ContentRow }) {
  const [err, setErr] = useState(false)
  // ⚠ Les URLs média Instagram expirent après quelques jours : fallback propre
  // sur un fond neutre + icône (le lien permalink reste toujours valable).
  if (row.thumbnail_url && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={row.thumbnail_url} alt="" onError={() => setErr(true)} className="h-full w-full object-cover" />
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-zinc-300">
      {row.media_product_type === "REELS" ? <Film className="h-8 w-8" /> : <ImageIcon className="h-8 w-8" />}
    </div>
  )
}

export default function ContenusPage() {
  const [rows, setRows] = useState<ContentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [brandOnly, setBrandOnly] = useState(true)
  const [who, setWho] = useState<string>("")
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/influencers/content?${brandOnly ? "brand=1&" : ""}market=${getMarketCookie()}&limit=150`, { cache: "no-store" })
      const data = await res.json()
      setRows(data.content || [])
    } finally {
      setLoading(false)
    }
  }, [brandOnly])

  useEffect(() => { load() }, [load])

  async function syncNow() {
    setSyncing(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/influencers/content/sync", { method: "POST" })
      const d = await res.json()
      if (!res.ok) { setFeedback(d.error || "Sync impossible."); return }
      setFeedback(`Sync : ${d.profiles_ok} profils lus, ${d.posts_upserted} posts, ${d.brand_posts} posts Talika. ${d.profiles_failed?.length || 0} comptes introuvables (perso/renommés).`)
      await load()
    } catch {
      setFeedback("Erreur réseau pendant la sync.")
    } finally {
      setSyncing(false)
    }
  }

  const names = Array.from(new Map(rows.map((r) => [r.influencer_id, r.influencers?.name || "?"])).entries())
    .sort((a, b) => a[1].localeCompare(b[1], "fr"))
  const shown = who ? rows.filter((r) => r.influencer_id === who) : rows
  const totalLikes = shown.reduce((s, r) => s + (r.like_count || 0), 0)
  const totalComments = shown.reduce((s, r) => s + (r.comments_count || 0), 0)

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header
        title="Contenus Instagram"
        subtitle="Posts réels des influenceuses (sync quotidienne via l'API Meta) — stats likes/commentaires."
        actions={
          <button onClick={syncNow} disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {syncing ? "Sync… (2-3 min)" : "Synchroniser"}
          </button>
        }
      />
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1 text-sm">
            <button onClick={() => setBrandOnly(true)}
              className={`rounded-lg px-3 py-1.5 font-medium ${brandOnly ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-600 hover:bg-white"}`}>
              Posts Talika
            </button>
            <button onClick={() => setBrandOnly(false)}
              className={`rounded-lg px-3 py-1.5 font-medium ${!brandOnly ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-600 hover:bg-white"}`}>
              Tous les posts
            </button>
          </div>
          <select value={who} onChange={(e) => setWho(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
            <option value="">Toutes les influenceuses</option>
            {names.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <span className="ml-auto text-sm text-zinc-500">
            {shown.length} post(s) · {totalLikes.toLocaleString("fr-FR")} ♥ · {totalComments.toLocaleString("fr-FR")} 💬
          </span>
        </div>

        {feedback && <p className="text-sm text-zinc-600">{feedback}</p>}

        {loading ? (
          <div className="flex items-center gap-2 p-8 text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
        ) : shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
            Aucun contenu pour l&apos;instant — clique « Synchroniser » pour récupérer les posts Instagram
            (le cron quotidien le fera ensuite automatiquement).
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((r) => (
              <div key={r.id} className="group overflow-hidden rounded-xl border border-zinc-200 bg-white">
                <a href={r.url || "#"} target="_blank" rel="noreferrer" className="relative block aspect-square overflow-hidden">
                  <Thumb row={r} />
                  <div className="absolute left-1.5 top-1.5 flex gap-1">
                    {r.media_product_type === "REELS" && (
                      <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">Reel</span>
                    )}
                    {r.is_brand && (
                      <span className="rounded bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white">Talika</span>
                    )}
                  </div>
                </a>
                <div className="p-2.5">
                  <button onClick={() => setDrawerId(r.influencer_id)} className="truncate text-left text-sm font-medium text-zinc-900 hover:underline">
                    {r.influencers?.name || "?"}
                  </button>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                    <span className="inline-flex items-center gap-0.5"><Heart className="h-3 w-3" />{(r.like_count ?? 0).toLocaleString("fr-FR")}</span>
                    <span className="inline-flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{r.comments_count ?? 0}</span>
                    <span className="ml-auto">{r.posted_at ? new Date(r.posted_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : ""}</span>
                  </div>
                  {r.caption && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-500">{r.caption}</p>}
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-700">
                      Voir sur Instagram <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <InfluencerDrawer influencerId={drawerId} onClose={() => setDrawerId(null)} />
    </div>
  )
}
