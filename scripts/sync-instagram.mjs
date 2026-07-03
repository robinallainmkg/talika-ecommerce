// One-shot : peuple influencer_content + influencer_social_stats depuis l'API
// Meta (même logique que src/lib/influence/instagram.ts). Le cron prendra le relais.
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
const env = {}
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g,"")
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const TOKEN = env.META_ACCESS_TOKEN, IG = "17841401767498869"

const { data: influencers } = await supabase.from("influencers").select("id, name, instagram_handle, metadata").not("instagram_handle","is",null)
const { data: allCodes } = await supabase.from("influencer_codes").select("influencer_id, code")
const codesByInf = new Map()
for (const c of allCodes||[]) { if (!c.influencer_id) continue; const a = codesByInf.get(c.influencer_id)||[]; a.push(c.code); codesByInf.set(c.influencer_id, a) }

const isBrand = (caption, codes) => {
  if (!caption) return false
  const c = caption.toLowerCase()
  if (c.includes("talika")) return true
  return codes.some((code) => code.length >= 4 && c.includes(code.toLowerCase()))
}

let ok = 0, failed = [], posts = 0, brand = 0
for (const inf of influencers||[]) {
  const handle = (inf.instagram_handle||"").replace(/^@/,"").trim()
  if (!handle) continue
  const fields = `business_discovery.username(${handle}){username,followers_count,media_count,profile_picture_url,media.limit(25){caption,media_type,media_product_type,like_count,comments_count,permalink,timestamp,thumbnail_url,media_url}}`
  let bd = null
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${IG}?fields=${encodeURIComponent(fields)}&access_token=${TOKEN}`)
    bd = (await r.json()).business_discovery || null
  } catch {}
  if (!bd) { failed.push(handle); continue }
  ok++
  const followers = Number(bd.followers_count)||null
  const media = bd.media?.data||[]
  let er = null
  if (followers && media.length) {
    const eng = media.reduce((s,m)=>s+(m.like_count||0)+(m.comments_count||0),0)/media.length
    er = Math.round(eng/followers*10000)/100
  }
  await supabase.from("influencer_social_stats").insert({ influencer_id: inf.id, platform: "instagram", followers, media_count: bd.media_count??null, engagement_rate: er })
  const meta = { ...(inf.metadata||{}) }
  if (followers) meta.followers = followers
  if (bd.profile_picture_url) meta.photo_url = bd.profile_picture_url
  meta.ig_stats_at = new Date().toISOString()
  await supabase.from("influencers").update({ metadata: meta }).eq("id", inf.id)
  const codes = codesByInf.get(inf.id)||[]
  for (const m of media) {
    const b = isBrand(m.caption, codes); if (b) brand++
    const { error } = await supabase.from("influencer_content").upsert({
      influencer_id: inf.id, external_id: m.id, platform: "instagram",
      type: (m.media_product_type||m.media_type||"post").toLowerCase(),
      media_product_type: m.media_product_type||null, url: m.permalink||null, title: null,
      caption: m.caption?.slice(0,2000)||null, thumbnail_url: m.thumbnail_url||m.media_url||null,
      media_url: m.media_url||null, like_count: m.like_count??null, comments_count: m.comments_count??null,
      is_brand: b, posted_at: m.timestamp||null, stats_updated_at: new Date().toISOString(),
    }, { onConflict: "external_id" })
    if (!error) posts++
    else if (posts === 0 && b !== undefined) { /* premier échec → log */ if (!globalThis._logged) { console.log("upsert err:", error.message); globalThis._logged = 1 } }
  }
  process.stdout.write(`✓ ${inf.name} (${followers??"?"} fol, ${media.length} posts)\n`)
  await new Promise((r)=>setTimeout(r,250))
}
console.log(`\n══ ${ok} profils OK · ${posts} posts stockés (${brand} Talika) · ${failed.length} introuvables ══`)
console.log("Introuvables:", failed.join(", "))
