import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Auto-match keywords → product titles
const AUTO_MATCH_RULES: Array<{ keywords: string[]; product_title: string }> = [
  { keywords: ["etp", "eye therapy patch", "eye therapy"], product_title: "Eye Therapy Patch" },
  { keywords: ["lipocils expert"], product_title: "Lipocils Expert" },
  { keywords: ["lipocils plat"], product_title: "Lipocils Platinium" },
  { keywords: ["lipocils", "lipocil"], product_title: "Lipocils Expert" },
  { keywords: ["xxl", "mascara xxl"], product_title: "Lipocils Mascara XXL Extension" },
  { keywords: ["glowtion"], product_title: "Glowtion" },
  { keywords: ["hair force led", "hair force cap"], product_title: "Hair Force LED Cap" },
  { keywords: ["hair force ser", "hair force sér"], product_title: "Hair Force Sérum" },
  { keywords: ["hair force"], product_title: "Hair Force Sérum" },
  { keywords: ["liposourcils"], product_title: "Liposourcils Expert" },
  { keywords: ["eq ", " eq ", "eq-", "eye quintessence", "quintessence"], product_title: "Eye Quintessence" },
  { keywords: ["skaa"], product_title: "SKAA" },
  { keywords: ["genius eyes", "genius"], product_title: "Genius Eyes" },
  { keywords: ["bust phyto"], product_title: "Bust Phytoserum" },
  { keywords: ["eye detox"], product_title: "Eye Detox Gel" },
  { keywords: ["bio enzymes"], product_title: "Bio Enzymes Mask" },
  { keywords: ["ultra booster"], product_title: "Ultra Booster Hydra" },
  { keywords: ["ultra diffuser"], product_title: "Ultra Diffuser" },
]

function autoMatchProduct(adName: string): string | null {
  const lower = ` ${adName.toLowerCase()} `
  for (const rule of AUTO_MATCH_RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return rule.product_title
      }
    }
  }
  return null
}

// GET: list all mappings + detect unmapped ads
export async function GET() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  // Get current ads from cache
  const { data: adCache } = await supabase
    .from("data_cache")
    .select("data")
    .eq("key", `meta_ads_${year}_${month}`)
    .single()

  const currentAds: Array<{ ad_id: string; ad_name: string }> = adCache?.data?.ads || []

  // Get existing mappings
  const { data: mappings } = await supabase
    .from("ad_product_mappings")
    .select("*")
    .order("ad_name")

  const mappingMap = new Map((mappings || []).map((m: any) => [m.ad_id, m]))

  // Categorize ads
  const mapped: any[] = []
  const unmapped: any[] = []
  const autoMappable: any[] = []

  for (const ad of currentAds) {
    const existing = mappingMap.get(ad.ad_id)
    if (existing) {
      mapped.push({ ...ad, product_title: existing.product_title, source: existing.source })
    } else {
      const autoProduct = autoMatchProduct(ad.ad_name)
      if (autoProduct) {
        autoMappable.push({ ...ad, suggested_product: autoProduct })
      } else {
        unmapped.push(ad)
      }
    }
  }

  return NextResponse.json({
    mapped,
    unmapped,
    autoMappable,
    total_ads: currentAds.length,
  })
}

// POST: save mapping (manual or auto-apply)
export async function POST(request: Request) {
  const body = await request.json()

  // Apply auto-match for all suggested mappings
  if (body.action === "auto_apply") {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    const { data: adCache } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", `meta_ads_${year}_${month}`)
      .single()

    const currentAds: Array<{ ad_id: string; ad_name: string }> = adCache?.data?.ads || []
    let applied = 0

    for (const ad of currentAds) {
      const product = autoMatchProduct(ad.ad_name)
      if (product) {
        const { error } = await supabase.from("ad_product_mappings").upsert({
          ad_id: ad.ad_id,
          ad_name: ad.ad_name,
          product_title: product,
          source: "auto",
          updated_at: new Date().toISOString(),
        }, { onConflict: "ad_id" })
        if (!error) applied++
      }
    }

    return NextResponse.json({ success: true, applied })
  }

  // Manual mapping: { ad_id, ad_name, product_title }
  if (!body.ad_id || !body.product_title) {
    return NextResponse.json({ error: "ad_id and product_title required" }, { status: 400 })
  }

  const { error } = await supabase.from("ad_product_mappings").upsert({
    ad_id: body.ad_id,
    ad_name: body.ad_name || "",
    product_title: body.product_title,
    product_id: body.product_id || null,
    source: "manual",
    updated_at: new Date().toISOString(),
  }, { onConflict: "ad_id" })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// DELETE: remove a mapping
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const adId = searchParams.get("ad_id")

  if (!adId) {
    return NextResponse.json({ error: "ad_id required" }, { status: 400 })
  }

  await supabase.from("ad_product_mappings").delete().eq("ad_id", adId)
  return NextResponse.json({ success: true })
}
