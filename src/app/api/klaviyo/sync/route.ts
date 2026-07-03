import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY || ""
const KLAVIYO_BASE = "https://a.klaviyo.com/api"
const KLAVIYO_REVISION = "2024-02-15"

async function klaviyoFetch(endpoint: string) {
  const url = `${KLAVIYO_BASE}${endpoint}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
      revision: KLAVIYO_REVISION,
      Accept: "application/json",
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Klaviyo API error ${res.status}: ${body}`)
  }
  return res.json()
}

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"
export const maxDuration = 300 // 5 min (Vercel Pro) — évite le timeout du bouton sync

export async function POST() {
  try {
    if (!KLAVIYO_API_KEY) {
      return NextResponse.json(
        { error: "KLAVIYO_API_KEY not configured" },
        { status: 400 }
      )
    }

    // --- Fetch campaigns (last 20, sorted by updated_at desc) ---
    const campaignsData = await klaviyoFetch(
      "/campaigns/?filter=equals(messages.channel,'email')&sort=-updated_at"
    )

    const campaigns = (campaignsData.data || []).map((c: any) => ({
      id: c.id,
      name: c.attributes?.name || "Sans nom",
      status: c.attributes?.status || "unknown",
      send_time: c.attributes?.send_time || null,
      created_at: c.attributes?.created_at || null,
      updated_at: c.attributes?.updated_at || null,
      archived: c.attributes?.archived || false,
    }))

    // --- Fetch all flows ---
    let allFlows: any[] = []
    let flowsUrl: string | null = "/flows/"

    while (flowsUrl) {
      const flowsData = await klaviyoFetch(flowsUrl)
      const flows = (flowsData.data || []).map((f: any) => ({
        id: f.id,
        name: f.attributes?.name || "Sans nom",
        status: f.attributes?.status || "unknown",
        trigger_type: f.attributes?.trigger_type || null,
        created: f.attributes?.created || null,
        updated: f.attributes?.updated || null,
        archived: f.attributes?.archived || false,
      }))
      allFlows = allFlows.concat(flows)

      // Handle pagination
      const nextLink = flowsData.links?.next
      if (nextLink) {
        // Extract path from full URL
        flowsUrl = nextLink.replace(KLAVIYO_BASE, "")
      } else {
        flowsUrl = null
      }
    }

    // --- Fetch lists ---
    const listsData = await klaviyoFetch("/lists/")
    const lists = (listsData.data || []).map((l: any) => ({
      id: l.id,
      name: l.attributes?.name || "Sans nom",
      created: l.attributes?.created || null,
      updated: l.attributes?.updated || null,
    }))

    // --- Store in Supabase data_cache ---
    const now = new Date()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    await supabase.from("data_cache").upsert({
      key: "klaviyo_campaigns",
      data: { campaigns, fetched_at: now.toISOString() },
      source: "klaviyo",
      expires_at: expiresAt,
    })

    await supabase.from("data_cache").upsert({
      key: "klaviyo_flows",
      data: { flows: allFlows, fetched_at: now.toISOString() },
      source: "klaviyo",
      expires_at: expiresAt,
    })

    await supabase.from("data_cache").upsert({
      key: "klaviyo_lists",
      data: { lists, fetched_at: now.toISOString() },
      source: "klaviyo",
      expires_at: expiresAt,
    })

    return NextResponse.json({
      success: true,
      synced_at: now.toISOString(),
      results: {
        campaigns_count: campaigns.length,
        flows_count: allFlows.length,
        lists_count: lists.length,
      },
    })
  } catch (error) {
    console.error("Klaviyo sync error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Klaviyo sync failed" },
      { status: 500 }
    )
  }
}
