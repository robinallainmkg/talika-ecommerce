import { createClient } from "@supabase/supabase-js"

// Pixel de tracking d'ouverture. GET ?i=<influencerId>&s=<step> → journalise un "open"
// dans outreach_log puis renvoie un GIF 1x1 transparent. Public (pas d'auth).
export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// GIF transparent 1x1
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")

function gif() {
  return new Response(new Uint8Array(PIXEL), {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
    },
  })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("i")
  const step = parseInt(searchParams.get("s") || "0", 10) || 0
  // UUID basique pour éviter d'insérer du bruit / des FK invalides.
  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    try {
      await supabase.from("outreach_log").insert({
        influencer_id: id, market: "UK", step, channel: "open", status: "open",
      })
    } catch {
      // pixel best-effort : on n'échoue jamais le rendu de l'image
    }
  }
  return gif()
}
