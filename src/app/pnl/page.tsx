"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import { Download, Upload, Loader2 } from "lucide-react"

const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const
const monthLabels = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"]
const monthNumbers: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

type MonthKey = (typeof months)[number]

interface PnLRow {
  category: string
  subcategory?: string
  [key: string]: number | string | boolean | undefined
  editable?: boolean
}

// Default P&L structure (used until real data flows from integrations)
const defaultPnLData: PnLRow[] = [
  { category: "Chiffre d'affaires", subcategory: "Ventes Shopify", jan: 95000, feb: 88000, mar: 102000 },
  { category: "Chiffre d'affaires", subcategory: "Ventes Amazon", jan: 12000, feb: 11500 },
  { category: "Chiffre d'affaires", subcategory: "Ventes B2B", editable: true },
  { category: "Couts des ventes", subcategory: "COGS", jan: -28500, feb: -26400, mar: -30600 },
  { category: "Couts des ventes", subcategory: "Shipping", jan: -8500, feb: -7800, mar: -9100 },
  { category: "Marketing", subcategory: "Meta Ads", jan: -12000, feb: -11000, mar: -14000 },
  { category: "Marketing", subcategory: "Google Ads", jan: -5000, feb: -4500, mar: -6000 },
  { category: "Marketing", subcategory: "Influenceurs", jan: -3500, feb: -2800, mar: -4200 },
  { category: "Marketing", subcategory: "Klaviyo", jan: -800, feb: -800, mar: -800 },
  { category: "Operations", subcategory: "Shopify fees", jan: -2850, feb: -2640, mar: -3060 },
  { category: "Operations", subcategory: "Apps & Tools", jan: -1200, feb: -1200, mar: -1200 },
  { category: "Operations", subcategory: "Salaires", editable: true },
  { category: "Operations", subcategory: "Loyer & Charges", editable: true },
]

export default function PnLPage() {
  const [data, setData] = useState<PnLRow[]>(defaultPnLData)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadPnL() {
      // Try to load P&L entries from Supabase
      const { data: entries } = await supabase
        .from("pnl_entries")
        .select("*, pnl_categories(*)")
        .order("date")

      if (entries && entries.length > 0) {
        // Build P&L from DB entries — for now use default data
        // Will be populated as integrations sync data
      }
      setLoading(false)
    }
    loadPnL()
  }, [])

  const handleCellEdit = (rowIndex: number, month: MonthKey, value: string) => {
    const numValue = parseFloat(value.replace(/[^0-9.-]/g, ""))
    if (isNaN(numValue)) return
    const newData = [...data]
    newData[rowIndex] = { ...newData[rowIndex], [month]: numValue }
    setData(newData)

    // Save to Supabase
    const row = newData[rowIndex]
    const date = `2026-${String(monthNumbers[month]).padStart(2, "0")}-01`
    supabase
      .from("pnl_entries")
      .upsert({
        category_id: null, // would need to look up or create
        date,
        amount: numValue,
        description: `${row.category} - ${row.subcategory}`,
        source: "manual",
        source_ref: `${row.category}-${row.subcategory}-${month}`,
      }, { onConflict: "category_id,date,source,source_ref" })
      .then(() => {})
  }

  const categories = Array.from(new Set(data.map((r) => r.category)))

  const monthTotals: Record<string, number> = {}
  months.forEach((m) => {
    monthTotals[m] = data.reduce((sum, row) => sum + ((row[m] as number) || 0), 0)
  })

  return (
    <div>
      <Header
        title="P&L"
        subtitle="Compte de resultat mensuel"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm">
              <Upload className="h-4 w-4" />
              Importer Excel
            </Button>
            <Button variant="secondary" size="sm">
              <Download className="h-4 w-4" />
              Exporter
            </Button>
          </div>
        }
      />

      <div className="p-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Compte de Resultat 2026</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-zinc-300">
                      <th className="pb-3 text-left font-medium text-zinc-500 sticky left-0 bg-white min-w-[200px]">
                        Categorie
                      </th>
                      {monthLabels.map((m) => (
                        <th key={m} className="pb-3 text-right font-medium text-zinc-500 min-w-[90px]">{m}</th>
                      ))}
                      <th className="pb-3 text-right font-bold text-zinc-700 min-w-[100px]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((category) => {
                      const rows = data.filter((r) => r.category === category)
                      const categoryTotals: Record<string, number> = {}
                      months.forEach((m) => {
                        categoryTotals[m] = rows.reduce((sum, row) => sum + ((row[m] as number) || 0), 0)
                      })
                      const yearTotal = Object.values(categoryTotals).reduce((s, v) => s + v, 0)

                      return (
                        <tbody key={category}>
                          <tr className="border-b border-zinc-200 bg-zinc-50">
                            <td className="py-2 px-1 font-bold text-zinc-900 sticky left-0 bg-zinc-50">{category}</td>
                            {months.map((m) => (
                              <td key={m} className="py-2 text-right font-bold text-zinc-700">
                                {categoryTotals[m] ? formatCurrency(categoryTotals[m]) : ""}
                              </td>
                            ))}
                            <td className="py-2 text-right font-bold text-zinc-900">
                              {yearTotal ? formatCurrency(yearTotal) : ""}
                            </td>
                          </tr>
                          {rows.map((row, i) => {
                            const rowIndex = data.indexOf(row)
                            const rowTotal = months.reduce((sum, m) => sum + ((row[m] as number) || 0), 0)
                            return (
                              <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                                <td className="py-2 px-1 pl-6 text-zinc-600 sticky left-0 bg-white">
                                  {row.subcategory}
                                  {row.editable && <span className="ml-1 text-xs text-zinc-400">(editable)</span>}
                                </td>
                                {months.map((m) => (
                                  <td key={m} className="py-2 text-right">
                                    {row.editable || !row[m] ? (
                                      <input
                                        type="text"
                                        className="w-full text-right text-sm border-0 bg-transparent text-zinc-600 focus:outline-none focus:bg-blue-50 rounded px-1 py-0.5"
                                        defaultValue={row[m] !== undefined ? String(row[m]) : ""}
                                        placeholder="—"
                                        onBlur={(e) => handleCellEdit(rowIndex, m, e.target.value)}
                                      />
                                    ) : (
                                      <span className={(row[m] as number) < 0 ? "text-red-600" : "text-zinc-600"}>
                                        {formatCurrency(row[m] as number)}
                                      </span>
                                    )}
                                  </td>
                                ))}
                                <td className="py-2 text-right font-medium text-zinc-700">
                                  {rowTotal ? formatCurrency(rowTotal) : ""}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      )
                    })}
                    <tr className="border-t-2 border-zinc-300 bg-zinc-900 text-white">
                      <td className="py-3 px-1 font-bold sticky left-0 bg-zinc-900">RESULTAT NET</td>
                      {months.map((m) => (
                        <td key={m} className="py-3 text-right font-bold">
                          {monthTotals[m] ? formatCurrency(monthTotals[m]) : ""}
                        </td>
                      ))}
                      <td className="py-3 text-right font-bold">
                        {formatCurrency(Object.values(monthTotals).reduce((s, v) => s + v, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
