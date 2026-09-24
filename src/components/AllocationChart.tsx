import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { Position } from '../types'
import { formatEUR, formatNumber } from '../utils/formatters'
import { useIsDark, chartTheme } from '../hooks/useTheme'
import { hasMarketChart } from '../utils/instrumentChart'

const COLORS = [
  '#3b82f6', '#eab308', '#f97316', '#8b5cf6', '#10b981',
  '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f59e0b',
]

const RADIAN = Math.PI / 180

interface Slice {
  name: string
  fullName: string
  value: number
  weight: number
  color: string
  position: Position
  /** Listed line with a chart to open; gold, savings and cash have none. */
  clickable: boolean
}

interface AllocationChartProps {
  positions: Position[]
  /** Wide layout draws the large labelled donut; narrow keeps a compact one. */
  wide?: boolean
  /** Opens the chart of a listed line, as a click in the positions table does. */
  onSelect?: (position: Position) => void
}

/**
 * Percentage inside the slice, ticker outside on a leader line. Recharts only
 * accepts one label renderer per Pie, so both are drawn here and the built-in
 * label line is switched off.
 */
function makeRenderLabel(
  theme: ReturnType<typeof chartTheme>,
  pick: (slice: Slice) => void
) {
  return function renderLabel(props: {
  cx: number
  cy: number
  midAngle: number
  innerRadius: number
  outerRadius: number
  payload: Slice
}) {
  const { cx, cy, midAngle, innerRadius, outerRadius, payload } = props

  const cos = Math.cos(-midAngle * RADIAN)
  const sin = Math.sin(-midAngle * RADIAN)
  const right = cos >= 0

  const midRadius = innerRadius + (outerRadius - innerRadius) * 0.5
  const ix = cx + midRadius * cos
  const iy = cy + midRadius * sin

  const sx = cx + (outerRadius + 2) * cos
  const sy = cy + (outerRadius + 2) * sin
  const mx = cx + (outerRadius + 18) * cos
  const my = cy + (outerRadius + 18) * sin
  const ex = mx + (right ? 16 : -16)

  return (
    <g
      onClick={payload.clickable ? () => pick(payload) : undefined}
      style={{ cursor: payload.clickable ? 'pointer' : 'default' }}
    >
      {payload.weight >= 4 && (
        <text
          x={ix}
          y={iy}
          fill="#fff"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={13}
          fontWeight={600}
        >
          {formatNumber(payload.weight, 1)}%
        </text>
      )}
      <path
        d={`M${sx},${sy}L${mx},${my}L${ex},${my}`}
        stroke={payload.color}
        strokeWidth={1.5}
        fill="none"
      />
      <circle cx={ex} cy={my} r={2.5} fill={payload.color} />
      <text
        x={ex + (right ? 7 : -7)}
        y={my}
        textAnchor={right ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={12}
        fontWeight={500}
        fill={theme.label}
      >
        {payload.name}
        {payload.weight < 4 && (
          <tspan fill={theme.muted}> {formatNumber(payload.weight, 1)}%</tspan>
        )}
      </text>
    </g>
  )
  }
}

export function AllocationChart({
  positions,
  wide = false,
  onSelect,
}: AllocationChartProps) {
  const theme = chartTheme(useIsDark())
  const pick = (slice: Slice) => {
    if (slice.clickable) onSelect?.(slice.position)
  }
  const renderLabel = makeRenderLabel(theme, pick)

  const data: Slice[] = [...positions]
    .filter((p) => p.currentValueEUR > 0)
    .sort((a, b) => b.currentValueEUR - a.currentValueEUR)
    .map((p, i) => ({
      name: p.ticker || p.isin || p.name,
      fullName: p.name,
      value: p.currentValueEUR,
      weight: p.weight,
      color: COLORS[i % COLORS.length],
      position: p,
      clickable: onSelect != null && hasMarketChart(p.ticker),
    }))

  const total = data.reduce((s, d) => s + d.value, 0)

  const tooltip = (
    <Tooltip
      formatter={(value: number, name: string) => [formatEUR(value), name]}
      contentStyle={theme.tooltip}
      itemStyle={theme.tooltipItem}
    />
  )

  const header = (
    <div className="flex items-baseline justify-between mb-4 gap-4">
      <h3 className="text-lg font-semibold">Répartition</h3>
      <span className="text-sm text-gray-500 dark:text-gray-400">
        {data.length} lignes · {formatEUR(total)}
      </span>
    </div>
  )

  if (!wide) {
    return (
      <div>
        {header}
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <div className="w-[180px] h-[180px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={88}
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={false}
                  onClick={(_, index: number) => pick(data[index])}
                >
                  {data.map((d) => (
                    <Cell
                      key={d.name}
                      fill={d.color}
                      style={{ cursor: d.clickable ? 'pointer' : 'default', outline: 'none' }}
                    />
                  ))}
                </Pie>
                {tooltip}
              </PieChart>
            </ResponsiveContainer>
          </div>

          <ul className="w-full flex-1 min-w-0 space-y-1.5">
            {data.map((d) => (
              <li
                key={d.name}
                onClick={() => pick(d)}
                className={`flex items-center gap-2.5 text-sm ${d.clickable ? 'cursor-pointer' : ''}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: d.color }}
                />
                <span className="font-medium text-gray-800 dark:text-gray-200 flex-1 min-w-0 truncate">
                  {d.name}
                </span>
                <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                  {formatNumber(d.weight, 1)}%
                </span>
                <span className="text-gray-400 dark:text-gray-500 text-xs tabular-nums w-[72px] text-right">
                  {formatEUR(d.value)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div>
      {header}

      <div className="flex flex-col xl:flex-row xl:items-center gap-8">
        <div className="w-full xl:w-[560px] shrink-0">
          {/* Extra height leaves room for the outside labels and their lines. */}
          <ResponsiveContainer width="100%" height={420}>
            <PieChart margin={{ top: 10, right: 80, bottom: 10, left: 80 }}>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={76}
                outerRadius={136}
                paddingAngle={1.5}
                stroke="none"
                minAngle={3}
                label={renderLabel}
                labelLine={false}
                isAnimationActive={false}
                onClick={(_, index: number) => pick(data[index])}
              >
                {data.map((d) => (
                  <Cell
                    key={d.name}
                    fill={d.color}
                    style={{ cursor: d.clickable ? 'pointer' : 'default', outline: 'none' }}
                  />
                ))}
              </Pie>
              {tooltip}
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Ranked list: biggest holding first. */}
        <ol className="flex-1 min-w-0 divide-y divide-gray-50 dark:divide-gray-800">
          {data.map((d, i) => (
            <li
              key={d.name}
              onClick={() => pick(d)}
              className={`flex items-center gap-3 text-sm py-2 first:pt-0 ${
                d.clickable ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 rounded' : ''
              }`}
            >
              <span className="text-gray-400 dark:text-gray-500 text-xs tabular-nums w-4 shrink-0">
                {i + 1}
              </span>
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: d.color }}
              />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-gray-800 dark:text-gray-200">{d.name}</span>
                <span className="text-gray-400 dark:text-gray-500 text-xs ml-2">{d.fullName}</span>
              </span>
              <span className="w-20 shrink-0">
                <span
                  className="block h-1.5 rounded-full"
                  style={{
                    width: `${Math.max(4, (d.weight / data[0].weight) * 100)}%`,
                    backgroundColor: d.color,
                  }}
                />
              </span>
              <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums shrink-0 w-12 text-right">
                {formatNumber(d.weight, 1)}%
              </span>
              <span className="text-gray-500 dark:text-gray-400 text-xs tabular-nums shrink-0 w-[84px] text-right">
                {formatEUR(d.value)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
