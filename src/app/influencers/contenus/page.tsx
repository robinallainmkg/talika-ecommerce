"use client"

import { useCallback, useEffect, useState } from "react"
import { Header } from "@/components/layout/header"
import { getMarketCookie } from "@/components/layout/market-switch"
import { InfluencerDrawer } from "@/components/influence/influencer-drawer"
import { authClient } from "@/lib/auth/client"
import { Heart, MessageCircle, RefreshCw, Loader2, Film, Image as ImageIcon, Upload, Download, Trash2, Copy, Check, Megaphone } from "lucide-react"

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
  external_id: string | null
  partnership_ad_code: string | null
  influencers: { id: string; name: string; instagram_handle: string | null; market: string; metadata: Record<string, unknown> | null }
}

interface AssetRow {
  id: string
  influencer_id: string
  label: string | null
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  partnership_ad_code: string | null
  created_at: string
  influencers: { id: string; name: string; market: string }
}

const fmtSize = (b: number | null) => {
  if (!b) return ""
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} Go`
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} Mo`
  return `${Math.round(b / 1e3)} Ko`
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

// Champ code de partenariat Meta (autosave au blur) — commun posts & vidéos.
function BoostCode({ value, onSave }: { value: string | null; onSave: (v: string) => Promise<void> }) {
  const [v, setV] = useState(value || "")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  async function save() {
    if (v.trim() === (value || "")) return
    setSaving(true)
    try { await onSave(v.trim()); setSaved(true); setTimeout(() => setSaved(false), 1500) } finally { setSaving(false) }
  }
  return (
    <span className="flex items-center gap-1">
      <Megaphone className="h-3 w-3 shrink-0 text-zinc-300" />
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
        placeholder="Code pub partenariat"
        title="Code de publicité de partenariat (généré par l'influenceuse) — à coller dans Ads Manager pour booster"
        className="w-full min-w-0 rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-[10px] focus:border-zinc-900 focus:outline-none"
      />
      {saving && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-zinc-400" />}
      {saved && <Check className="h-3 w-3 shrink-0 text-emerald-500" />}
      {!saving && !saved && v && (
        <button onClick={() => { navigator.clipboard.writeText(v); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
          className="shrink-0 text-zinc-300 hover:text-zinc-600" title="Copier le code">
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </span>
  )
}

export default function ContenusPage() {
  const [view, setView] = useState<"brand" | "all" | "videos">("brand")
  const [rows, setRows] = useState<ContentRow[]>([])
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [allInf, setAllInf] = useState<{ id: string; name: string }[]>([])
  const [uploadFor, setUploadFor] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [who, setWho] = useState<string>("")
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const market = getMarketCookie()
      const [cRes, aRes] = await Promise.all([
        fetch(`/api/influencers/content?${view === "brand" ? "brand=1&" : ""}market=${market}&limit=150`, { cache: "no-store" }),
        fetch(`/api/influencers/assets?market=${market}`, { cache: "no-store" }),
      ])
      setRows((await cRes.json()).content || [])
      setAssets((await aRes.json()).assets || [])
    } finally {
      setLoading(false)
    }
  }, [view])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch(`/api/influencers?year=${new Date().getFullYear()}&market=${getMarketCookie()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAllInf(((d.influencers || []) as { id: string; name: string }[])
        .map((i) => ({ id: i.id, name: i.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"))))
      .catch(() => {})
  }, [])

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

  // Upload vidéo HD → bucket privé influencer-videos (1 Go max/fichier)
  async function uploadVideo(file: File) {
    if (!uploadFor) { setFeedback("Choisis d'abord l'influenceuse."); return }
    setUploading(true)
    setUploadPct(`${fmtSize(file.size)}…`)
    setFeedback(null)
    try {
      const res = await fetch("/api/influencers/assets/upload-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencer_id: uploadFor, file_name: file.name, mime_type: file.type, size_bytes: file.size }),
      })
      const d = await res.json()
      if (!res.ok || !d.token) { setFeedback(d.error || "Préparation de l'upload impossible."); return }
      const { error } = await authClient().storage.from(d.bucket).uploadToSignedUrl(d.path, d.token, file)
      if (error) { setFeedback(`Échec de l'upload : ${error.message}`); return }
      setFeedback(`Vidéo « ${file.name} » (${fmtSize(file.size)}) uploadée.`)
      await load()
    } catch {
      setFeedback("Erreur réseau pendant l'upload.")
    } finally {
      setUploading(false)
      setUploadPct(null)
    }
  }

  async function downloadAsset(id: string) {
    const res = await fetch("/api/influencers/assets", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    })
    const j = await res.json()
    if (j.url) window.open(j.url, "_blank")
  }

  async function deleteAsset(id: string) {
    if (!confirm("Supprimer cette vidéo ?")) return
    setAssets((p) => p.filter((a) => a.id !== id))
    await fetch("/api/influencers/assets", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    })
  }

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1200)
  }

  const names = Array.from(new Map(rows.map((r) => [r.influencer_id, r.influencers?.name || "?"])).entries())
    .sort((a, b) => a[1].localeCompare(b[1], "fr"))
  const shown = who ? rows.filter((r) => r.influencer_id === who) : rows
  const shownAssets = who ? assets.filter((a) => a.influencer_id === who) : assets
  const totalLikes = shown.reduce((s, r) => s + (r.like_count || 0), 0)
  const totalComments = shown.reduce((s, r) => s + (r.comments_count || 0), 0)

  const tab = (key: typeof view, label: string) => (
    <button onClick={() => setView(key)}
      className={`rounded-lg px-3 py-1.5 font-medium ${view === key ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-600 hover:bg-white"}`}>
      {label}
    </button>
  )

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header
        title="Contenus Instagram"
        subtitle="Posts réels + vidéos HD des influenceuses — stats, et codes de partenariat pour booster sur Meta."
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
            {tab("brand", "Posts Talika")}
            {tab("all", "Tous les posts")}
            {tab("videos", `Vidéos HD (${assets.length})`)}
          </div>
          <select value={who} onChange={(e) => setWho(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
            <option value="">Toutes les influenceuses</option>
            {(view === "videos"
              ? Array.from(new Map(assets.map((a) => [a.influencer_id, a.influencers?.name || "?"])).entries()).sort((a, b) => a[1].localeCompare(b[1], "fr"))
              : names
            ).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          {view !== "videos" && (
            <span className="ml-auto text-sm text-zinc-500">
              {shown.length} post(s) · {totalLikes.toLocaleString("fr-FR")} ♥ · {totalComments.toLocaleString("fr-FR")} 💬
            </span>
          )}
        </div>

        {feedback && <p className="text-sm text-zinc-600">{feedback}</p>}

        {view === "videos" ? (
          <>
            {/* Upload vidéo HD */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3">
              <Upload className="h-4 w-4 text-zinc-400" />
              <select value={uploadFor} onChange={(e) => setUploadFor(e.target.value)}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm">
                <option value="">Influenceuse…</option>
                {allInf.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              <label className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${uploadFor && !uploading ? "cursor-pointer bg-zinc-900 text-white hover:bg-zinc-800" : "cursor-not-allowed bg-zinc-100 text-zinc-400"}`}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                {uploading ? `Envoi ${uploadPct || ""}` : "Uploader une vidéo"}
                <input type="file" accept="video/*,.mov,.mp4" className="hidden" disabled={!uploadFor || uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVideo(f); e.target.value = "" }} />
              </label>
              <span className="text-xs text-zinc-400">Fichiers sources HD (max 1 Go) — matière pour les ads Meta.</span>
            </div>

            {shownAssets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
                Aucune vidéo uploadée pour l&apos;instant.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                {shownAssets.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-4 py-2.5 last:border-0">
                    <Film className="h-4 w-4 shrink-0 text-zinc-400" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-zinc-900">{a.label || a.file_name}</div>
                      <div className="text-[11px] text-zinc-400">
                        <button onClick={() => setDrawerId(a.influencer_id)} className="hover:underline">{a.influencers?.name}</button>
                        {" · "}{fmtSize(a.size_bytes)} · {new Date(a.created_at).toLocaleDateString("fr-FR")}
                      </div>
                    </div>
                    <div className="w-52">
                      <BoostCode value={a.partnership_ad_code} onSave={async (v) => {
                        await fetch("/api/influencers/assets", {
                          method: "PATCH", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: a.id, partnership_ad_code: v }),
                        })
                        setAssets((p) => p.map((x) => x.id === a.id ? { ...x, partnership_ad_code: v || null } : x))
                      }} />
                    </div>
                    <button onClick={() => downloadAsset(a.id)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" title="Télécharger">
                      <Download className="h-4 w-4" />
                    </button>
                    <button onClick={() => deleteAsset(a.id)} className="rounded-lg p-1.5 text-zinc-300 hover:bg-red-50 hover:text-red-500" title="Supprimer">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : loading ? (
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
                  <div className="flex items-center gap-1">
                    <button onClick={() => setDrawerId(r.influencer_id)} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-zinc-900 hover:underline">
                      {r.influencers?.name || "?"}
                    </button>
                    {r.external_id && (
                      <button onClick={() => copyText(r.id, r.external_id!)}
                        className="shrink-0 rounded p-0.5 text-zinc-300 hover:text-zinc-600"
                        title={`Copier l'ID du média IG (${r.external_id})`}>
                        {copiedId === r.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      </button>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                    <span className="inline-flex items-center gap-0.5"><Heart className="h-3 w-3" />{(r.like_count ?? 0).toLocaleString("fr-FR")}</span>
                    <span className="inline-flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{r.comments_count ?? 0}</span>
                    <span className="ml-auto">{r.posted_at ? new Date(r.posted_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : ""}</span>
                  </div>
                  {r.caption && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-500">{r.caption}</p>}
                  <div className="mt-1.5">
                    <BoostCode value={r.partnership_ad_code} onSave={async (v) => {
                      await fetch("/api/influencers/content", {
                        method: "PATCH", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: r.id, partnership_ad_code: v }),
                      })
                      setRows((p) => p.map((x) => x.id === r.id ? { ...x, partnership_ad_code: v || null } : x))
                    }} />
                  </div>
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
