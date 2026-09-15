import { NextResponse } from "next/server"
import { syncInstagramContent, instagramConfigured } from "@/lib/influence/instagram"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 300 // budget interne 240 s (lib/influence/instagram.ts)

// POST — synchronise le contenu + les stats Instagram des influenceuses « qui
// comptent » (scope "active", critères en tête de lib/influence/instagram.ts ;
// tous marchés). `?scope=all` force tous les profils ayant un @handle.
export async function POST(request: Request) {
  if (!instagramConfigured()) {
    return NextResponse.json({ error: "META_ACCESS_TOKEN absent" }, { status: 503 })
  }
  const scope = new URL(request.url).searchParams.get("scope") === "all" ? "all" : "active"
  try {
    const result = await syncInstagramContent({ scope })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "sync failed" },
      { status: 500 }
    )
  }
}
