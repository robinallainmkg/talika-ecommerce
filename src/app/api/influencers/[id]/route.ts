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

interface ProductAgg {
  title: string
  quantity: number
  revenue: number
  orders: number
}

interface MonthlyAgg {
  month: string
  revenue: number
  orders: number
}

interface SaleRow {
  shopify_order_id: string
  order_date: string
  product_title: string | null
  quantity: number | null
  line_price: number | string | null
  discount_code: string | null
}

// GET: Full influencer deep dive data (alimente le drawer profil des 3 vues).
//
// Perf : toutes les requêtes sont indépendantes → lancées en parallèle. Surtout,
// les ventes / le top produits / la timeline sont lus depuis influencer_product_sales
// (déjà attribué par code, indexé par influencer_id → ~quelques centaines de lignes)
// AU LIEU de re-télécharger et re-parser TOUT le cache des commandes Shopify
// (~5 Mo de JSON, ~26 000 commandes) à chaque ouverture. Le drawer devient quasi
// instantané, et ses KPI (CA via code / nb commandes) sont désormais ISO avec le
// scoreboard /influencers (tous deux = Σ line_price / commandes distinctes).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const [infRes, feesRes, contentRes, invoicesRes, commissionsRes, salesRes] =
      await Promise.all([
        supabase.from("influencers").select(`*, influencer_codes (*)`).eq("id", id).single(),
        supabase
          .from("influencer_fixed_fees")
          .select("*")
          .eq("influencer_id", id)
          .order("year", { ascending: false })
          .order("month", { ascending: false }),
        supabase
          .from("influencer_content")
          .select("*")
          .eq("influencer_id", id)
          .order("posted_at", { ascending: false }),
        supabase
          .from("influencer_cost_invoices")
          .select("id, year, month, kind, amount, file_name, created_at")
          .eq("influencer_id", id)
          .order("year", { ascending: false })
          .order("month", { ascending: false }),
        supabase
          .from("influencer_commissions")
          .select("month, year, amount")
          .eq("influencer_id", id),
        supabase
          .from("influencer_product_sales")
          .select("shopify_order_id, order_date, product_title, quantity, line_price, discount_code")
          .eq("influencer_id", id)
          .order("order_date", { ascending: false }),
      ])

    const influencer = infRes.data
    if (infRes.error || !influencer) {
      return NextResponse.json(
        { error: infRes.error?.message || "Influencer not found" },
        { status: 404 }
      )
    }

    const fixedFees = feesRes.data
    const content = contentRes.data
    const invoices = invoicesRes.data
    const commissionsData = commissionsRes.data
    const sales = (salesRes.data || []) as SaleRow[]

    // Agrégations depuis les ventes produits attribuées (petit jeu indexé).
    const productMap: Record<string, ProductAgg> = {}
    const monthlyMap: Record<string, { month: string; revenue: number; orders: Set<string> }> = {}
    const orderMap: Record<string, { date: string; amount: number; products: string[]; discount_code: string }> = {}
    const orderSet = new Set<string>()
    let totalRevenue = 0

    for (const s of sales) {
      const lp = Number(s.line_price) || 0
      const oid = String(s.shopify_order_id)
      const title = s.product_title || "Unknown"
      totalRevenue += lp
      orderSet.add(oid)

      const p = (productMap[title] ??= { title, quantity: 0, revenue: 0, orders: 0 })
      p.quantity += s.quantity || 1
      p.revenue += lp
      p.orders++

      const o = (orderMap[oid] ??= { date: s.order_date, amount: 0, products: [], discount_code: s.discount_code || "" })
      o.amount += lp
      o.products.push(title)

      const monthKey = (s.order_date || "").substring(0, 7) || "unknown"
      const mm = (monthlyMap[monthKey] ??= { month: monthKey, revenue: 0, orders: new Set<string>() })
      mm.revenue += lp
      mm.orders.add(oid)
    }

    const totalOrders = orderSet.size

    const products = Object.values(productMap).sort((a, b) => b.revenue - a.revenue)

    const timeline: MonthlyAgg[] = Object.values(monthlyMap)
      .map((m) => ({ month: m.month, revenue: m.revenue, orders: m.orders.size }))
      .sort((a, b) => a.month.localeCompare(b.month))

    const lastOrders = Object.values(orderMap)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10)

    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

    // Coûts réels (forfaits + commissions saisis), pour ROI cohérent avec les pages Coûts.
    const totalManualCommissions = (commissionsData || []).reduce(
      (s, c) => s + (Number(c.amount) || 0), 0
    )
    const totalFixedFeesSum = (fixedFees || []).reduce(
      (s: number, f: { amount: number }) => s + (Number(f.amount) || 0), 0
    )
    const totalCost = totalManualCommissions + totalFixedFeesSum
    const roas = totalCost > 0 ? totalRevenue / totalCost : 0

    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()
    const hasCurrentMonthData = (commissionsData || []).some(
      (c) => c.month === currentMonth && c.year === currentYear
    )

    return NextResponse.json({
      influencer,
      products,
      timeline,
      lastOrders,
      fixedFees: fixedFees || [],
      content: content || [],
      invoices: invoices || [],
      commissions: commissionsData || [],
      stats: {
        totalRevenue,
        totalOrders,
        avgOrderValue,
        roas,
        totalCost,
        totalCommissions: totalManualCommissions,
        totalFixedFees: totalFixedFeesSum,
        commissionsPending: !hasCurrentMonthData,
      },
    })
  } catch (error) {
    console.error("Influencer detail GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch influencer" },
      { status: 500 }
    )
  }
}

// PATCH — édition inline depuis le drawer (réseaux, contact, raison sociale,
// niche, followers, notes…). Whitelist stricte ; champ envoyé vide = effacé.
// followers vit dans metadata (jsonb) → merge non-destructif.
const EDITABLE_FIELDS = [
  "name", "instagram_handle", "tiktok_handle", "email", "phone",
  "billing_name", "category", "tier", "status", "notes",
] as const

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const update: Record<string, unknown> = {}
    for (const key of EDITABLE_FIELDS) {
      if (!(key in body)) continue
      const v = body[key]
      update[key] = typeof v === "string" && v.trim() === "" ? null : v
    }
    if ("followers" in body) {
      const { data: cur } = await supabase.from("influencers").select("metadata").eq("id", id).single()
      const meta = { ...((cur?.metadata as Record<string, unknown>) || {}) }
      const f = Number(body.followers)
      if (body.followers === "" || body.followers == null) delete meta.followers
      else if (Number.isFinite(f) && f >= 0) meta.followers = f
      update.metadata = meta
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "aucun champ éditable fourni" }, { status: 400 })
    }
    update.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from("influencers")
      .update(update)
      .eq("id", id)
      .select("id, name, instagram_handle, tiktok_handle, email, phone, billing_name, category, tier, status, notes, metadata")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, influencer: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update influencer" },
      { status: 500 }
    )
  }
}
