// Contenu + stats Instagram des influenceuses — via l'API Graph Meta
// (Business Discovery) : lit le profil public et les ~25 derniers posts de tout
// compte Business/Creator à partir du @handle. Réutilise le token System User
// Meta existant (META_ACCESS_TOKEN, permanent) + le compte IG @talika_paris
// comme point d'entrée. Comptes personnels/renommés → introuvables (limite API).
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const GRAPH = "https://graph.facebook.com/v21.0"
// IG business account de la page Talika (@talika_paris) — surchargeable par env.
const IG_USER_ID = process.env.META_IG_USER_ID || "17841401767498869"

export function instagramConfigured(): boolean {
  return !!process.env.META_ACCESS_TOKEN
}

interface IgMedia {
  id: string
  caption?: string
  media_type?: string
  media_product_type?: string
  like_count?: number
  comments_count?: number
  permalink?: string
  timestamp?: string
  thumbnail_url?: string
  media_url?: string
}

interface IgProfile {
  username: string
  name?: string
  followers_count?: number
  media_count?: number
  profile_picture_url?: string
  media?: { data: IgMedia[] }
}

// Profil + derniers posts d'un handle (null si compte introuvable/personnel).
export async function fetchBusinessDiscovery(handle: string): Promise<IgProfile | null> {
  const clean = handle.replace(/^@/, "").trim()
  if (!clean) return null
  const fields = `business_discovery.username(${clean}){username,name,followers_count,media_count,profile_picture_url,media.limit(25){caption,media_type,media_product_type,like_count,comments_count,permalink,timestamp,thumbnail_url,media_url}}`
  const res = await fetch(
    `${GRAPH}/${IG_USER_ID}?fields=${encodeURIComponent(fields)}&access_token=${process.env.META_ACCESS_TOKEN}`,
    { cache: "no-store" }
  )
  const json = await res.json()
  if (!res.ok || !json.business_discovery) return null
  return json.business_discovery as IgProfile
}

// Un post "marque" = la caption mentionne Talika ou un des codes de l'influenceuse.
export function isBrandContent(caption: string | undefined, codes: string[]): boolean {
  if (!caption) return false
  const c = caption.toLowerCase()
  if (c.includes("talika")) return true
  return codes.some((code) => code.length >= 4 && c.includes(code.toLowerCase()))
}

export interface InstagramSyncResult {
  profiles_ok: number
  profiles_failed: string[]
  posts_upserted: number
  brand_posts: number
  mentions_upserted: number
  mentions_unknown: string[]
  /** Profils non traités faute de temps (budget atteint) — jamais silencieux. */
  profiles_skipped: number
}

/** Marge sous les 300 s de la lambda : on s'arrête net et on le dit. */
const DEFAULT_BUDGET_MS = 240_000

// Mentions par TAG : tous les médias où @talika_paris est tagué — y compris
// par des comptes HORS base (earned media). Auteur connu → rattaché à
// l'influenceuse ; inconnu → stocké avec author_username seul (influencer_id
// null). Dédup naturelle par external_id (un post d'une influenceuse suivie
// déjà importé par Business Discovery est simplement enrichi is_mention=true).
export async function syncTaggedMentions(): Promise<{ upserted: number; unknown: string[] }> {
  const result = { upserted: 0, unknown: [] as string[] }
  if (!instagramConfigured()) return result

  const { data: influencers } = await supabase
    .from("influencers")
    .select("id, instagram_handle")
    .not("instagram_handle", "is", null)
  const byHandle = new Map(
    (influencers || []).map((i) => [(i.instagram_handle || "").replace(/^@/, "").trim().toLowerCase(), i.id])
  )

  let url = `${GRAPH}/${IG_USER_ID}/tags?fields=id,username,caption,media_type,media_product_type,like_count,comments_count,permalink,timestamp,media_url&limit=50&access_token=${process.env.META_ACCESS_TOKEN}`
  for (let page = 0; page < 3 && url; page++) {
    const res = await fetch(url, { cache: "no-store" })
    const json = await res.json()
    if (!res.ok || !json.data) break
    // Un seul upsert par page : Vercel (iad1) et Supabase (eu-west-3) sont de
    // part et d'autre de l'Atlantique — ~130 ms d'aller-retour par écriture.
    // Ligne par ligne, la sync entière dépassait les 300 s de la lambda.
    const rows = new Map<string, Record<string, unknown>>()
    for (const m of json.data as (IgMedia & { username?: string })[]) {
      const author = (m.username || "").toLowerCase()
      const influencerId = byHandle.get(author) || null
      if (!influencerId && author && !result.unknown.includes(author)) result.unknown.push(author)
      // Map : deux fois le même external_id dans un même upsert ferait échouer
      // tout le lot ("cannot affect row a second time").
      rows.set(m.id, {
        influencer_id: influencerId,
        external_id: m.id,
        platform: "instagram",
        type: (m.media_product_type || m.media_type || "post").toLowerCase(),
        media_product_type: m.media_product_type || null,
        url: m.permalink || null,
        caption: m.caption?.slice(0, 2000) || null,
        thumbnail_url: m.thumbnail_url || m.media_url || null,
        media_url: m.media_url || null,
        like_count: m.like_count ?? null,
        comments_count: m.comments_count ?? null,
        is_brand: true,
        is_mention: true,
        author_username: m.username || null,
        posted_at: m.timestamp || null,
        stats_updated_at: new Date().toISOString(),
      })
    }
    if (rows.size > 0) {
      const { error } = await supabase
        .from("influencer_content")
        .upsert([...rows.values()], { onConflict: "external_id" })
      if (error) console.error(`[instagram] mentions page ${page} non écrite: ${error.message}`)
      else result.upserted += rows.size
    }
    url = json.paging?.next || null
    await new Promise((r) => setTimeout(r, 250))
  }
  return result
}

// Sync complet : pour chaque influenceuse avec un @instagram (tous marchés) —
// snapshot stats compte (1/jour max) + refresh metadata.followers + upsert des
// posts (dédup par external_id, stats likes/commentaires rafraîchies).
export async function syncInstagramContent(opts?: { budgetMs?: number }): Promise<InstagramSyncResult> {
  const startedAt = Date.now()
  const budgetMs = opts?.budgetMs ?? DEFAULT_BUDGET_MS
  const result: InstagramSyncResult = {
    profiles_ok: 0, profiles_failed: [], posts_upserted: 0, brand_posts: 0,
    mentions_upserted: 0, mentions_unknown: [], profiles_skipped: 0,
  }
  if (!instagramConfigured()) return result

  const [{ data: influencers }, { data: allCodes }, { data: recentStats }] = await Promise.all([
    supabase.from("influencers").select("id, instagram_handle, metadata").not("instagram_handle", "is", null),
    supabase.from("influencer_codes").select("influencer_id, code"),
    supabase
      .from("influencer_social_stats")
      .select("influencer_id")
      .gte("captured_at", new Date(Date.now() - 20 * 3600 * 1000).toISOString()),
  ])
  const codesByInf = new Map<string, string[]>()
  for (const c of allCodes || []) {
    if (!c.influencer_id) continue
    const arr = codesByInf.get(c.influencer_id) || []
    arr.push(c.code)
    codesByInf.set(c.influencer_id, arr)
  }
  const snapshotDone = new Set((recentStats || []).map((s) => s.influencer_id))

  for (const inf of influencers || []) {
    // Budget dépassé : on rend la main proprement plutôt que de se faire tuer
    // par la lambda au milieu d'une écriture, et on compte ce qui n'a pas été vu.
    if (Date.now() - startedAt > budgetMs) {
      result.profiles_skipped++
      continue
    }
    const handle = (inf.instagram_handle || "").replace(/^@/, "").trim()
    if (!handle) continue
    let profile: IgProfile | null = null
    try {
      profile = await fetchBusinessDiscovery(handle)
    } catch { /* réseau — on passe */ }
    if (!profile) { result.profiles_failed.push(handle); continue }
    result.profiles_ok++

    const followers = Number(profile.followers_count) || null
    const media = profile.media?.data || []

    // Engagement moyen des derniers posts, en % des followers
    let er: number | null = null
    if (followers && media.length) {
      const eng = media.reduce((s, m) => s + (m.like_count || 0) + (m.comments_count || 0), 0) / media.length
      er = Math.round((eng / followers) * 10000) / 100
    }

    // Snapshot stats (au plus 1 / 20 h)
    if (!snapshotDone.has(inf.id)) {
      await supabase.from("influencer_social_stats").insert({
        influencer_id: inf.id, platform: "instagram",
        followers, media_count: profile.media_count ?? null, engagement_rate: er,
      })
    }

    // Followers + photo frais dans metadata (merge non destructif)
    const meta = { ...((inf.metadata as Record<string, unknown>) || {}) }
    if (followers) meta.followers = followers
    if (profile.profile_picture_url) meta.photo_url = profile.profile_picture_url
    meta.ig_stats_at = new Date().toISOString()
    await supabase.from("influencers").update({ metadata: meta }).eq("id", inf.id)

    // Posts : UN SEUL upsert pour tous les médias du profil (dédup par
    // external_id). Un appel par post = ~130 ms d'aller-retour iad1 ↔ eu-west-3,
    // soit ~3 s par influenceuse et une sync qui dépassait les 300 s.
    const codes = codesByInf.get(inf.id) || []
    const rows = new Map<string, Record<string, unknown>>()
    for (const m of media) {
      const brand = isBrandContent(m.caption, codes)
      if (brand) result.brand_posts++
      rows.set(m.id, {
        influencer_id: inf.id,
        external_id: m.id,
        platform: "instagram",
        type: (m.media_product_type || m.media_type || "post").toLowerCase(),
        media_product_type: m.media_product_type || null,
        url: m.permalink || null,
        title: null,
        caption: m.caption?.slice(0, 2000) || null,
        thumbnail_url: m.thumbnail_url || m.media_url || null,
        media_url: m.media_url || null,
        like_count: m.like_count ?? null,
        comments_count: m.comments_count ?? null,
        is_brand: brand,
        posted_at: m.timestamp || null,
        stats_updated_at: new Date().toISOString(),
      })
    }
    if (rows.size > 0) {
      const { error } = await supabase
        .from("influencer_content")
        .upsert([...rows.values()], { onConflict: "external_id" })
      if (error) console.error(`[instagram] posts de ${handle} non écrits: ${error.message}`)
      else result.posts_upserted += rows.size
    }
    await new Promise((r) => setTimeout(r, 250)) // rate limit Meta (200 calls/h)
  }

  // Mentions par tag (@talika_paris) — y compris comptes hors base
  try {
    const mentions = await syncTaggedMentions()
    result.mentions_upserted = mentions.upserted
    result.mentions_unknown = mentions.unknown
  } catch { /* non bloquant */ }

  return result
}
