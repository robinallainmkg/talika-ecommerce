import { NextResponse } from "next/server"
import { syncInstagramContent, instagramConfigured } from "@/lib/influence/instagram"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 300 // ~120 handles × (1 appel Graph + 250 ms) ≈ 2-3 min

// POST — synchronise le contenu + les stats Instagram de toutes les
// influenceuses ayant un @handle (tous marchés). Voir lib/influence/instagram.
export async function POST() {
  if (!instagramConfigured()) {
    return NextResponse.json({ error: "META_ACCESS_TOKEN absent" }, { status: 503 })
  }
  try {
    const result = await syncInstagramContent()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "sync failed" },
      { status: 500 }
    )
  }
}
