import { NextResponse } from "next/server"
import { assembleContextPack, getKnowledge } from "@/lib/context-pack"

export const dynamic = "force-dynamic"

// GET /api/context
//   ?page=influencers   → scope par page du dashboard
//   ?market=FR&channel=shopify  → périmètre (défauts : FR / shopify)
//   ?types=strategy,product     → filtre par type
//   ?format=md (défaut) → brief markdown prêt à coller dans Claude Code
//   ?format=json        → entrées brutes de la knowledge_base
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const opts = {
    page: searchParams.get("page") ?? undefined,
    market: searchParams.get("market") ?? undefined,
    channel: searchParams.get("channel") ?? undefined,
    types: searchParams.get("types")?.split(",").filter(Boolean),
  }

  if (searchParams.get("format") === "json") {
    const entries = await getKnowledge(opts)
    return NextResponse.json({ count: entries.length, entries })
  }

  const pack = await assembleContextPack(opts)
  return new NextResponse(pack, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  })
}
