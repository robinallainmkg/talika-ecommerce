import { createClient } from "@supabase/supabase-js"
import ExcelJS from "exceljs"
import { loadStatusMap, billingKey } from "@/lib/influence/billing-status"
import { marketFromRequest } from "@/lib/market"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// Export Excel de la facturation influence (Robin, 23/11/2026) : un onglet
// « Détail par mois », une ligne par influenceuse et par mois, pour la
// personne qui paie. Statut de la FACTURE séparé du PAIEMENT : les colonnes
// « Payé ? » et « Date du paiement » restent vides, à remplir par le payeur.
// Lecture seule : aucune écriture en base.

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

const MOIS = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
const lab = (y: number, m: number) => `${MOIS[m]} ${y}`

type Invoice = {
  influencer_id: string
  year: number
  month: number
  file_name: string
  amount: number | null
  ocr: { amount?: number; amount_ttc?: number } | null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()))
  const market = marketFromRequest(request)

  const [{ data: influencers }, { data: fees }, { data: comms }, { data: invoices }] = await Promise.all([
    supabase.from("influencers").select("id, name, billing_name").eq("market", market),
    supabase.from("influencer_fixed_fees").select("influencer_id, year, month, amount").eq("year", year),
    supabase.from("influencer_commissions").select("influencer_id, year, month, amount").eq("year", year),
    // Toutes les années : une facture peut couvrir des mois de deux années.
    supabase.from("influencer_cost_invoices").select("influencer_id, year, month, file_name, amount, ocr"),
  ])
  const statusMap = await loadStatusMap({ year })

  const byId = new Map((influencers || []).map((i) => [i.id as string, i]))
  type Row = { forfait: number; commission: number; factures: Invoice[] }
  const rows = new Map<string, Row>()
  const get = (k: string) => {
    let r = rows.get(k)
    if (!r) rows.set(k, (r = { forfait: 0, commission: 0, factures: [] }))
    return r
  }
  for (const f of fees || []) get(billingKey(f.influencer_id, f.year, f.month)).forfait += Number(f.amount || 0)
  for (const c of comms || []) get(billingKey(c.influencer_id, c.year, c.month)).commission += Number(c.amount || 0)

  // Mois couverts par chaque fichier de facture (même fichier sur plusieurs mois = à payer une fois).
  const moisDuFichier = new Map<string, [number, number][]>()
  for (const v of (invoices || []) as Invoice[]) {
    const fk = `${v.influencer_id}|${v.file_name}`
    ;(moisDuFichier.get(fk) || moisDuFichier.set(fk, []).get(fk)!).push([v.year, v.month])
    if (v.year === year) get(billingKey(v.influencer_id, v.year, v.month)).factures.push(v)
  }

  const lignes = Array.from(rows.entries())
    .map(([k, r]) => {
      const [id, y, m] = k.split("|")
      return { id, y: Number(y), m: Number(m), r }
    })
    .filter(({ id }) => byId.has(id))
    .sort((a, b) => b.y - a.y || b.m - a.m || String(byId.get(a.id)!.name).localeCompare(String(byId.get(b.id)!.name), "fr"))

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Détail par mois", { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] })
  ws.columns = [
    { header: "Mois", width: 15 },
    { header: "Influenceuse", width: 24 },
    { header: "Nom sur la facture", width: 30 },
    { header: "Forfait (€ HT)", width: 12 },
    { header: "Commission (€ HT)", width: 14 },
    { header: "Total dû (€ HT)", width: 13 },
    { header: "Facture", width: 22 },
    { header: "Fichier de la facture", width: 48 },
    { header: "Montant de la facture (€ HT)", width: 15 },
    { header: "Montant de la facture (€ TTC)", width: 15 },
    { header: "À savoir", width: 52 },
    { header: "Payé ? (Patrick)", width: 14 },
    { header: "Date du paiement (Patrick)", width: 16 },
  ]
  const head = ws.getRow(1)
  head.height = 32
  head.eachCell((c, i) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } }
    c.alignment = { wrapText: true, vertical: "middle" }
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i >= 12 ? "FF1F4E79" : "FF3C3C3C" } }
  })
  const FILL: Record<string, string> = { Reçue: "FFD9EAD3", "À recevoir": "FFFFF2CC", "Reportée au mois suivant": "FFE7E6E6" }

  for (const { id, y, m, r } of lignes) {
    const st = statusMap.get(billingKey(id, y, m))
    if (st?.status === "sans_facturation") continue // annulé : rien à payer
    const du = Math.round((r.forfait + r.commission) * 100) / 100
    if (du === 0 && r.factures.length === 0) continue
    const fac = r.factures.length ? "Reçue" : st?.status === "reporte" ? "Reportée au mois suivant" : "À recevoir"
    const notes: string[] = []
    let ht = 0
    let ttc = 0
    let ttcComplet = true
    for (const v of r.factures) {
      ht += Number(v.ocr?.amount ?? v.amount ?? 0)
      if (v.ocr?.amount_ttc) ttc += Number(v.ocr.amount_ttc)
      else ttcComplet = false
      const mois = moisDuFichier.get(`${v.influencer_id}|${v.file_name}`) || []
      if (mois.length > 1) {
        mois.sort((a, b) => a[0] - b[0] || a[1] - b[1])
        notes.push(`Une seule facture pour ${mois.map(([yy, mm]) => lab(yy, mm)).join(", ")} : à payer une seule fois`)
      }
    }
    if (fac === "Reportée au mois suivant" && st?.deferred_to_month && st.deferred_to_year) {
      notes.push(`Petit montant reporté sur ${lab(st.deferred_to_year, st.deferred_to_month)}`)
    }
    const inf = byId.get(id)!
    const row = ws.addRow([
      lab(y, m),
      inf.name || "",
      inf.billing_name || "",
      r.forfait || null,
      r.commission ? Math.round(r.commission * 100) / 100 : null,
      du,
      fac,
      r.factures.map((v) => v.file_name).join(" | ") || null,
      r.factures.length ? Math.round(ht * 100) / 100 : null,
      r.factures.length && ttcComplet ? Math.round(ttc * 100) / 100 : null,
      notes.join(" ; ") || null,
      null,
      null,
    ])
    for (const c of [4, 5, 6, 9, 10]) row.getCell(c).numFmt = "#,##0.00"
    row.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL[fac] } }
    row.getCell(11).alignment = { wrapText: true, vertical: "top" }
    for (const c of [12, 13]) row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } }
    row.getCell(12).dataValidation = { type: "list", allowBlank: true, formulae: ['"Oui,Non"'] }
    row.getCell(13).dataValidation = { type: "date", allowBlank: true, operator: "greaterThan", formulae: [new Date(2020, 0, 1)] }
    row.getCell(13).numFmt = "dd/mm/yyyy"
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(ws.rowCount, 1), column: 13 } }

  const buf = await wb.xlsx.writeBuffer()
  const today = new Date().toISOString().slice(0, 10)
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Facturation-influence-${year}-${today}.xlsx"`,
      "Cache-Control": "no-store",
    },
  })
}

