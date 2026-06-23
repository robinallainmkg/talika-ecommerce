import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { normalizeCode } from "@/lib/codes"
import { getUncategorizedCodes } from "@/lib/codes-server"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Attribution automatique des codes non catégorisés à une influenceuse PAR NOM.
// Matching (du plus sûr au plus souple) :
//   1. préfixe d'un code DÉJÀ attribué (ex. LUDI25 ~ LUDI10 → Ludivine)
//   2. stem == nom normalisé (VANESSA10 → Vanessa)
//   3. stem = préfixe d'un nom, unique (JULIETTE10 → Juliette Katz)
//   4. stem contenu dans un nom, unique, len>=5 (GLOWGIRLS → Faustine Glowgirls)
// On n'assigne QUE les matchs uniques et sûrs ; le reste reste pour la main.
const stemOf = (s: string) => normalizeCode(s).replace(/\d+$/, "")
const normName = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "")
const pctOf = (s: string) => {
  const m = normalizeCode(s).match(/(\d+)$/)
  return m ? parseInt(m[1]) : 15
}

export async function POST() {
  try {
    const now = new Date()
    const [unassigned, infsRes, codeRowsRes] = await Promise.all([
      getUncategorizedCodes(now.getFullYear(), now.getMonth() + 1),
      supabase.from("influencers").select("id, name"),
      supabase.from("influencer_codes").select("id, code, influencer_id"),
    ])
    const infs = infsRes.data || []
    const codeRows = codeRowsRes.data || []
    const idName: Record<string, string> = {}
    for (const i of infs) idName[i.id] = i.name

    // stem (code sans le % final) -> influenceuse, depuis les codes déjà attribués
    const stemToInf: Record<string, Set<string>> = {}
    for (const r of codeRows) {
      if (!r.influencer_id) continue
      const st = stemOf(r.code)
      if (st.length < 2) continue
      ;(stemToInf[st] ??= new Set()).add(r.influencer_id)
    }
    const nameToInf: Record<string, string> = {}
    for (const i of infs) nameToInf[normName(i.name)] = i.id

    const match = (code: string): string | null => {
      const st = stemOf(code)
      if (st.length < 2) return null
      if (stemToInf[st]?.size === 1) return [...stemToInf[st]][0]
      if (nameToInf[st]) return nameToInf[st]
      if (st.length >= 4) {
        const pre = infs.filter((i) => normName(i.name).startsWith(st))
        if (pre.length === 1) return pre[0].id
      }
      if (st.length >= 5) {
        const cont = infs.filter((i) => normName(i.name).includes(st))
        if (cont.length === 1) return cont[0].id
      }
      return null
    }

    // allRows mutable pour l'idempotence (miroir de POST /codes)
    const allRows = [...codeRows] as { id: string; code: string }[]
    const assigned: { code: string; influencer: string }[] = []

    for (const uc of unassigned) {
      const infId = match(uc.code)
      if (!infId) continue
      const code = uc.code.toUpperCase().trim()
      const norm = normalizeCode(code)
      const dupes = allRows.filter((r) => normalizeCode(r.code) === norm)
      const fields = { code, discount_percent: pctOf(code), is_active: true, code_type: "influencer", influencer_id: infId }
      if (dupes.length > 0) {
        await supabase.from("influencer_codes").update(fields).eq("id", dupes[0].id)
        if (dupes.length > 1) await supabase.from("influencer_codes").delete().in("id", dupes.slice(1).map((r) => r.id))
      } else {
        await supabase.from("influencer_codes").insert(fields)
        allRows.push({ id: "new", code })
      }
      assigned.push({ code, influencer: idName[infId] })
    }

    return NextResponse.json({ assigned, count: assigned.length, remaining: unassigned.length - assigned.length })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}
