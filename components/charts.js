'use client';

// charts.js — all the dashboard charts, built on Recharts.
// Exports four chart components used by app/(app)/dashboard/page.js:
//   • MenuMatrixChart  — the Kasavana–Smith scatter (popularity × margin), with
//     the four quadrants shaded and points coloured by category.
//   • RevenueWasteChart — daily revenue vs. waste-cost area chart.
//   • UnitsBarChart     — units sold per dish, bars coloured by category.
//   • CategoryDonut     — share of sales by menu category.
// One shared category colour palette (CAT_COLOR) keeps every chart consistent.
// These components only DRAW data they're given; all the maths lives in
// lib/analytics.js.
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  Cell,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { CATEGORY_MEANING, CATEGORY_LABEL } from '@/lib/humanize';

export const CAT_COLOR = {
  Star: '#4F9D69',
  Plowhorse: '#D99A3A',
  Puzzle: '#4A7FB5',
  Dog: '#C0504A',
};
const CAT_TINT = {
  Star: '#E7F2EB',
  Plowhorse: '#FAF0DC',
  Puzzle: '#E7EFF7',
  Dog: '#F6F1EA',
};

const axisTick = { fill: '#8C837A', fontSize: 11 };
const tooltipStyle = {
  background: '#fff',
  border: '1px solid #ECE4D9',
  borderRadius: 10,
  color: '#23201D',
  fontSize: 12,
  boxShadow: '0 8px 30px rgba(40,30,20,.12)',
  padding: '8px 11px',
};

function num(v) {
  return Math.round(v).toLocaleString('en-US');
}

// ---------------------------------------------------------------------------
// 1. Menu-engineering matrix — shaded quadrants, points coloured by category
// ---------------------------------------------------------------------------
export function MenuMatrixChart({ data, popularityThresholdPct }) {
  if (!data || data.length === 0) return null;

  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const xMax = Math.max(...xs, popularityThresholdPct || 0) * 1.18 || 10;
  const yMin = Math.max(0, Math.min(...ys) - 10);
  const yMax = Math.min(100, Math.max(...ys) + 10);
  const xMid = popularityThresholdPct || 0;
  const yMid = ys.reduce((s, v) => s + v, 0) / ys.length; // avg margin (visual split)

  // Quadrant labels use the friendly display names (uppercased); the colours
  // still come from the internal category keys.
  const areas = [
    { x1: 0, x2: xMid, y1: yMid, y2: yMax, fill: CAT_TINT.Puzzle, label: 'HIDDEN GEM · promote', pos: 'insideTopLeft', color: '#345D85' },
    { x1: xMid, x2: xMax, y1: yMid, y2: yMax, fill: CAT_TINT.Star, label: 'STAR · keep', pos: 'insideTopRight', color: '#2E6B43' },
    { x1: 0, x2: xMid, y1: yMin, y2: yMid, fill: '#F6F1EA', label: 'UNDERPERFORMER · review', pos: 'insideBottomLeft', color: '#7A6F61' },
    { x1: xMid, x2: xMax, y1: yMin, y2: yMid, fill: CAT_TINT.Plowhorse, label: 'CROWD-PLEASER · re-cost', pos: 'insideBottomRight', color: '#946A18' },
  ];

  return (
    <ResponsiveContainer width="100%" height={330}>
      <ScatterChart margin={{ top: 14, right: 16, bottom: 26, left: 4 }}>
        {areas.map((a, i) => (
          <ReferenceArea
            key={i}
            x1={a.x1}
            x2={a.x2}
            y1={a.y1}
            y2={a.y2}
            fill={a.fill}
            fillOpacity={0.7}
            stroke="none"
            label={{ value: a.label, position: a.pos, fontSize: 10.5, fontWeight: 600, fill: a.color }}
          />
        ))}
        <CartesianGrid stroke="#ECE4D9" strokeDasharray="0" />
        <XAxis
          type="number"
          dataKey="x"
          name="Share of sales"
          unit="%"
          domain={[0, Math.ceil(xMax)]}
          tick={axisTick}
          stroke="#D9CFC1"
          label={{ value: 'Share of sales →', position: 'bottom', fill: '#8C837A', fontSize: 11, offset: 8 }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="Margin"
          unit="%"
          domain={[Math.floor(yMin), Math.ceil(yMax)]}
          tick={axisTick}
          stroke="#D9CFC1"
          label={{ value: 'Margin →', angle: -90, position: 'insideLeft', fill: '#8C837A', fontSize: 11 }}
        />
        <ZAxis type="number" dataKey="z" range={[70, 430]} />
        <ReferenceLine x={xMid} stroke="#D9CFC1" strokeDasharray="4 4" />
        <ReferenceLine y={yMid} stroke="#D9CFC1" strokeDasharray="4 4" />
        <Tooltip cursor={{ strokeDasharray: '3 3', stroke: '#D9CFC1' }} content={<MatrixTooltip />} />
        <Scatter data={data}>
          {data.map((d, i) => (
            <Cell key={i} fill={CAT_COLOR[d.category] || '#8C837A'} fillOpacity={0.9} stroke="#fff" strokeWidth={1} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function MatrixTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={tooltipStyle}>
      <div style={{ fontWeight: 700, marginBottom: 3 }}>{d.name}</div>
      <div style={{ color: CAT_COLOR[d.category], fontWeight: 600 }}>
        {CATEGORY_LABEL[d.category] || d.category} · {CATEGORY_MEANING[d.category]}
      </div>
      <div style={{ marginTop: 4, color: '#6B635A' }}>Margin: {d.y.toFixed(0)}%</div>
      <div style={{ color: '#6B635A' }}>Share of sales: {d.x.toFixed(1)}%</div>
      <div style={{ color: '#6B635A' }}>Sold: {num(d.units)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Revenue vs waste — area chart over time
// ---------------------------------------------------------------------------
export function RevenueWasteChart({ data, currency }) {
  return (
    <ResponsiveContainer width="100%" height={290}>
      <AreaChart data={data} margin={{ top: 8, right: 14, bottom: 4, left: 6 }}>
        <defs>
          <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B5D46" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#3B5D46" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gWaste" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C0504A" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#C0504A" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#F4EEE5" vertical={false} />
        <XAxis dataKey="date" tick={axisTick} stroke="#D9CFC1" minTickGap={26} />
        <YAxis tick={axisTick} stroke="#D9CFC1" width={64} tickFormatter={(v) => num(v)} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [num(v) + ' ' + currency, n]} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} iconType="circle" />
        <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3B5D46" strokeWidth={2} fill="url(#gRev)" />
        <Area type="monotone" dataKey="waste" name="Waste cost" stroke="#C0504A" strokeWidth={2} fill="url(#gWaste)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// 3. Units sold per dish — bar chart coloured by category
// ---------------------------------------------------------------------------
export function UnitsBarChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={290}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 54, left: 6 }}>
        <CartesianGrid stroke="#F4EEE5" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ ...axisTick, fontSize: 10.5 }}
          stroke="#D9CFC1"
          interval={0}
          angle={-35}
          textAnchor="end"
          height={56}
        />
        <YAxis tick={axisTick} stroke="#D9CFC1" width={44} tickFormatter={(v) => num(v)} />
        <Tooltip
          cursor={{ fill: '#F6F1EA' }}
          contentStyle={tooltipStyle}
          formatter={(v) => [num(v) + ' sold', 'Units']}
        />
        <Bar dataKey="units" radius={[5, 5, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={CAT_COLOR[d.category] || '#8C837A'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// 4. Share of sales by category — donut
// ---------------------------------------------------------------------------
export function CategoryDonut({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={230}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={52}
          outerRadius={82}
          paddingAngle={2}
          stroke="#fff"
          strokeWidth={2}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={CAT_COLOR[d.name] || '#8C837A'} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, n) => [
            `${num(v)} sold (${total ? Math.round((v / total) * 100) : 0}%)`,
            CATEGORY_LABEL[n] || n,
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          iconType="circle"
          formatter={(value) => CATEGORY_LABEL[value] || value}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
