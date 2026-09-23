import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from 'recharts'
import { useIsDark, chartTheme } from '../hooks/useTheme'
import type { Position } from '../types'

interface PerformanceDistributionProps {
  positions: Position[]
}

export function PerformanceDistribution({
  positions,
}: PerformanceDistributionProps) {
  const theme = chartTheme(useIsDark())

  const data = [...positions]
    .filter((p) => p.priced)
    .sort((a, b) => a.pnlPercent - b.pnlPercent)
    .map((p) => ({
      ticker: p.ticker || p.isin,
      performance: Math.round(p.pnlPercent * 100) / 100,
    }))

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
      <h3 className="text-lg font-semibold mb-4">
        Distribution des performances
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
          <XAxis dataKey="ticker" tick={{ fontSize: 12, fill: theme.tick }} />
          <YAxis
            tick={{ fontSize: 12, fill: theme.tick }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            formatter={(value: number) => [`${value.toFixed(2)} %`, 'Performance']}
            contentStyle={theme.tooltip}
          />
          <Bar dataKey="performance" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.performance >= 0 ? '#22c55e' : '#ef4444'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
