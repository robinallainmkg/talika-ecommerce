"use client"

import { useState } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { mockPnLData } from "@/lib/mock-data"
import { formatCurrency } from "@/lib/utils"
import { Download, Upload } from "lucide-react"

const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const
const monthLabels = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"]

type MonthKey = (typeof months)[number]

export default function PnLPage() {
  const [data, setData] = useState(mockPnLData)

  const handleCellEdit = (rowIndex: number, month: MonthKey, value: string) => {
    const numValue = parseFloat(value.replace(/[^0-9.-]/g, ""))
    if (isNaN(numValue)) return

    const newData = [...data]
    newData[rowIndex] = { ...newData[rowIndex], [month]: numValue }
    setData(newData)
  }

  // Group by category
  const categories = Array.from(new Set(data.map((r) => r.category)))

  // Calculate totals per month
  const monthTotals: Record<string, number> = {}
  months.forEach((m) => {
    monthTotals[m] = data.reduce((sum, row) => sum + ((row[m] as number) || 0), 0)
  })

  return (
    <div>
      <Header
        title="P&L"
        subtitle="Compte de résultat mensuel"
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
        <Card>
          <CardHeader>
            <CardTitle>Compte de Résultat 2026</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-zinc-300">
                    <th className="pb-3 text-left font-medium text-zinc-500 sticky left-0 bg-white min-w-[200px]">
                      Catégorie
                    </th>
                    {monthLabels.map((m) => (
                      <th key={m} className="pb-3 text-right font-medium text-zinc-500 min-w-[90px]">
                        {m}
                      </th>
                    ))}
                    <th className="pb-3 text-right font-bold text-zinc-700 min-w-[100px]">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => {
                    const rows = data.filter((r) => r.category === category)
                    const categoryTotals: Record<string, number> = {}
                    months.forEach((m) => {
                      categoryTotals[m] = rows.reduce(
                        (sum, row) => sum + ((row[m] as number) || 0),
                        0
                      )
                    })
                    const yearTotal = Object.values(categoryTotals).reduce(
                      (s, v) => s + v,
                      0
                    )

                    return (
                      <tbody key={category}>
                        {/* Category header */}
                        <tr className="border-b border-zinc-200 bg-zinc-50">
                          <td className="py-2 px-1 font-bold text-zinc-900 sticky left-0 bg-zinc-50">
                            {category}
                          </td>
                          {months.map((m) => (
                            <td key={m} className="py-2 text-right font-bold text-zinc-700">
                              {categoryTotals[m]
                                ? formatCurrency(categoryTotals[m])
                                : ""}
                            </td>
                          ))}
                          <td className="py-2 text-right font-bold text-zinc-900">
                            {yearTotal ? formatCurrency(yearTotal) : ""}
                          </td>
                        </tr>
                        {/* Subcategory rows */}
                        {rows.map((row, i) => {
                          const rowIndex = data.indexOf(row)
                          const rowTotal = months.reduce(
                            (sum, m) => sum + ((row[m] as number) || 0),
                            0
                          )
                          return (
                            <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                              <td className="py-2 px-1 pl-6 text-zinc-600 sticky left-0 bg-white">
                                {row.subcategory}
                                {row.editable && (
                                  <span className="ml-1 text-xs text-zinc-400">(éditable)</span>
                                )}
                              </td>
                              {months.map((m) => (
                                <td key={m} className="py-2 text-right">
                                  {row.editable || !row[m] ? (
                                    <input
                                      type="text"
                                      className="w-full text-right text-sm border-0 bg-transparent text-zinc-600 focus:outline-none focus:bg-blue-50 rounded px-1 py-0.5"
                                      value={
                                        row[m] !== undefined
                                          ? formatCurrency(row[m] as number)
                                          : ""
                                      }
                                      placeholder="—"
                                      onFocus={(e) => {
                                        e.target.value = row[m]
                                          ? String(row[m])
                                          : ""
                                      }}
                                      onBlur={(e) => {
                                        handleCellEdit(rowIndex, m, e.target.value)
                                        e.target.value = row[m]
                                          ? formatCurrency(row[m] as number)
                                          : ""
                                      }}
                                    />
                                  ) : (
                                    <span
                                      className={
                                        (row[m] as number) < 0
                                          ? "text-red-600"
                                          : "text-zinc-600"
                                      }
                                    >
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
                  {/* Grand total */}
                  <tr className="border-t-2 border-zinc-300 bg-zinc-900 text-white">
                    <td className="py-3 px-1 font-bold sticky left-0 bg-zinc-900">
                      RÉSULTAT NET
                    </td>
                    {months.map((m) => (
                      <td key={m} className="py-3 text-right font-bold">
                        {monthTotals[m] ? formatCurrency(monthTotals[m]) : ""}
                      </td>
                    ))}
                    <td className="py-3 text-right font-bold">
                      {formatCurrency(
                        Object.values(monthTotals).reduce((s, v) => s + v, 0)
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
