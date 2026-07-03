import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { extractInvoiceFields } from "@/lib/influence/invoice-ocr"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const BUCKET = "influencer-invoices"

// OCR : télécharge la facture, extrait montant/date via Mistral, stocke et renvoie.
// En cas d'échec OCR → 200 + ocr_failed (l'upload reste valide, saisie manuelle).
export async function POST(request: Request) {
  try {
    const { invoice_id } = await request.json().catch(() => ({}))
    if (!invoice_id) return NextResponse.json({ error: "invoice_id requis" }, { status: 400 })

    const { data: row } = await supabase
      .from("influencer_cost_invoices")
      .select("storage_path, mime_type")
      .eq("id", invoice_id)
      .single()
    if (!row?.storage_path) return NextResponse.json({ error: "facture introuvable" }, { status: 404 })

    const { data: file, error } = await supabase.storage.from(BUCKET).download(row.storage_path)
    if (error || !file) {
      return NextResponse.json({ error: "téléchargement impossible" }, { status: 500 })
    }

    let fields
    try {
      fields = await extractInvoiceFields(await file.arrayBuffer(), row.mime_type)
    } catch (e) {
      return NextResponse.json(
        { ocr_failed: true, error: e instanceof Error ? e.message : "OCR échoué" },
        { status: 200 }
      )
    }

    const amount = fields.amount ?? fields.amount_ttc ?? null
    await supabase
      .from("influencer_cost_invoices")
      .update({ ocr: fields, amount })
      .eq("id", invoice_id)

    return NextResponse.json({ ...fields, amount })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
