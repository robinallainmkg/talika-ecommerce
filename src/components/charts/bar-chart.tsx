"use client"

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface BarChartProps {
  data: any[]
  bars: {
    key: string
    color: string
    name: string
  }[]
  xKey: string
  height?: number
  layout?: "horizontal" | "vertical"
}

export function BarChart({
  data,
  bars,
  xKey,
  height = 300,
  layout = "horizontal",
}: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        layout={layout === "vertical" ? "vertical" : "horizontal"}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        {layout === "vertical" ? (
          <>
            <XAxis type="number" tick={{ fontSize: 12, fill: "#71717a" }} />
            <YAxis
              type="category"
              dataKey={xKey}
              tick={{ fontSize: 12, fill: "#71717a" }}
              width={100}
            />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: "#71717a" }} />
            <YAxis tick={{ fontSize: 12, fill: "#71717a" }} />
          </>
        )}
        <Tooltip
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid #e4e4e7",
            fontSize: "13px",
          }}
        />
        {bars.map((bar) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            fill={bar.color}
            name={bar.name}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}
