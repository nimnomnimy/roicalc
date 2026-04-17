import { useState, useMemo, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useROIStore } from '../store/roiStore';
import { computeTimeline, aggregateTimeline } from '../engine/timelineEngine';
import type { PeriodView } from '../engine/timelineEngine';
import { formatCurrency } from '../utils/format';

type LineKey = 'existingCost' | 'newCost' | 'combinedCost' | 'baselineCost' | 'savings' | 'cumulativeSavings';

const LINE_CONFIG: { key: LineKey; label: string; color: string; dashed?: boolean }[] = [
  { key: 'baselineCost', label: 'Baseline (no change)', color: '#9ca3af', dashed: true },
  { key: 'existingCost', label: 'Existing Platform', color: '#ef4444' },
  { key: 'newCost', label: 'New Platform', color: '#3b82f6' },
  { key: 'combinedCost', label: 'Combined (Old + New)', color: '#a855f7' },
  { key: 'savings', label: 'Savings vs Baseline', color: '#10b981', dashed: true },
  { key: 'cumulativeSavings', label: 'Cumulative Savings', color: '#6366f1' },
];

const PERIODS: { value: PeriodView; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { color: string; name: string; value: number; dataKey: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm min-w-48">
      <p className="font-semibold text-gray-800 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-gray-600">{p.name}</span>
          </span>
          <span className="font-medium" style={{ color: p.color }}>
            {(p.dataKey === 'savings' || p.dataKey === 'cumulativeSavings') && p.value >= 0 ? '+' : ''}{formatCurrency(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ChartPage() {
  const { project, updateConfig } = useROIStore();
  const [period, setPeriod] = useState<PeriodView>('monthly');
  const [visibleLines, setVisibleLines] = useState<Set<LineKey>>(
    new Set(['baselineCost', 'existingCost', 'newCost', 'combinedCost', 'savings'])
  );
  const [showMilestones, setShowMilestones] = useState(true);

  // Existing-platform vendor filter for baseline/existing lines.
  // `null` means "include all vendors" (default).
  const existingVendors = useMemo(() => {
    const set = new Set<string>();
    for (const c of project.costItems) {
      if (c.platform === 'existing' && c.vendor.trim()) set.add(c.vendor);
    }
    return Array.from(set).sort();
  }, [project.costItems]);

  const [selectedVendors, setSelectedVendors] = useState<Set<string> | null>(null);
  // Drop vendors that no longer exist from the selection.
  useEffect(() => {
    if (!selectedVendors) return;
    const valid = new Set(existingVendors);
    let changed = false;
    const next = new Set<string>();
    for (const v of selectedVendors) {
      if (valid.has(v)) next.add(v); else changed = true;
    }
    if (changed) setSelectedVendors(next.size === valid.size ? null : next);
  }, [existingVendors, selectedVendors]);

  const vendorFilter = selectedVendors ?? undefined;
  const timeline = useMemo(
    () => computeTimeline(project, { existingVendorFilter: vendorFilter }),
    [project, vendorFilter]
  );
  const chartData = useMemo(() => aggregateTimeline(timeline.rows, period), [timeline, period]);

  const toggleVendor = (vendor: string) => {
    setSelectedVendors((prev) => {
      const current = prev ?? new Set(existingVendors);
      const next = new Set(current);
      if (next.has(vendor)) next.delete(vendor);
      else next.add(vendor);
      // If user reselected every vendor, collapse back to "all" (null) so future vendors auto-include.
      if (next.size === existingVendors.length) return null;
      return next;
    });
  };
  const selectAllVendors = () => setSelectedVendors(null);
  const clearVendors = () => setSelectedVendors(new Set());

  const toggleLine = (key: LineKey) => {
    setVisibleLines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const milestones = useMemo(() => {
    const groupSize = period === 'quarterly' ? 3 : period === 'annual' ? 12 : 1;
    return project.phases
      .filter((p) => p.monthDeltas.length > 0)
      .map((phase) => {
        const firstMonthIndex = Math.min(...phase.monthDeltas.map((d) => d.monthIndex));
        const bucketIndex = Math.floor(firstMonthIndex / groupSize);
        const label = chartData[bucketIndex]?.label;
        return { phase, label };
      })
      .filter((m) => m.label != null);
  }, [project.phases, chartData, period]);

  const hasSavings = timeline.totalSavings > 0;

  const durationMonths = project.config.durationMonths;
  const setDuration = (m: number) => updateConfig({ durationMonths: Math.max(1, Math.min(600, Math.round(m))) });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Project span control */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Project span</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setDuration(durationMonths - 12)}
            className="w-7 h-7 text-gray-500 hover:text-gray-800 border border-gray-200 rounded hover:bg-gray-50"
            title="−12 months"
          >
            −
          </button>
          <input
            type="number"
            className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-right"
            value={durationMonths}
            onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
            min={1}
            max={600}
          />
          <span className="text-sm text-gray-500">months ({(durationMonths / 12).toFixed(1)} yrs)</span>
          <button
            onClick={() => setDuration(durationMonths + 12)}
            className="w-7 h-7 text-gray-500 hover:text-gray-800 border border-gray-200 rounded hover:bg-gray-50"
            title="+12 months"
          >
            +
          </button>
        </div>
        <div className="flex gap-1">
          {[12, 24, 36, 60].map((m) => (
            <button
              key={m}
              onClick={() => setDuration(m)}
              className={`px-2 py-1 text-xs rounded border transition-colors ${
                durationMonths === m
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {m === 12 ? '1y' : m === 24 ? '2y' : m === 36 ? '3y' : '5y'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Baseline (no change)</p>
          <p className="text-xl font-bold text-gray-700 mt-1">{formatCurrency(timeline.totalBaseline, true)}</p>
          <p className="text-xs text-gray-400 mt-0.5">if nothing changed</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Existing Platform</p>
          <p className="text-xl font-bold text-red-700 mt-1">{formatCurrency(timeline.totalExisting, true)}</p>
          <p className="text-xs text-red-400 mt-0.5">reducing during migration</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">New Platform</p>
          <p className="text-xl font-bold text-blue-700 mt-1">{formatCurrency(timeline.totalNew, true)}</p>
          <p className="text-xs text-blue-400 mt-0.5">growing during migration</p>
        </div>
        <div className={`${hasSavings ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'} border rounded-xl p-4`}>
          <p className={`text-xs font-medium uppercase tracking-wide ${hasSavings ? 'text-green-600' : 'text-amber-600'}`}>
            {hasSavings ? 'Total Savings' : 'Additional Cost'}
          </p>
          <p className={`text-xl font-bold mt-1 ${hasSavings ? 'text-green-700' : 'text-amber-700'}`}>
            {hasSavings ? '+' : '-'}{formatCurrency(Math.abs(timeline.totalSavings), true)}
          </p>
          <p className={`text-xs mt-0.5 ${hasSavings ? 'text-green-400' : 'text-amber-400'}`}>vs staying on old platform</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap gap-2">
          {LINE_CONFIG.map((l) => (
            <button
              key={l.key}
              onClick={() => toggleLine(l.key)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-all ${
                visibleLines.has(l.key)
                  ? 'text-white border-transparent'
                  : 'bg-white border-gray-200 text-gray-500'
              }`}
              style={visibleLines.has(l.key) ? { backgroundColor: l.color, borderColor: l.color } : {}}
            >
              <svg className="w-5 h-2 shrink-0" viewBox="0 0 20 4">
                {l.dashed
                  ? <line x1="0" y1="2" x2="20" y2="2" stroke={visibleLines.has(l.key) ? 'white' : l.color} strokeWidth="2" strokeDasharray="4 2" />
                  : <line x1="0" y1="2" x2="20" y2="2" stroke={visibleLines.has(l.key) ? 'white' : l.color} strokeWidth="2" />
                }
              </svg>
              {l.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <VendorFilter
            vendors={existingVendors}
            selected={selectedVendors}
            onToggle={toggleVendor}
            onSelectAll={selectAllVendors}
            onClear={clearVendors}
          />

          <button
            onClick={() => setShowMilestones((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-all ${
              showMilestones
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white border-gray-200 text-gray-500'
            }`}
          >
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 14 14" fill="none">
              <line x1="7" y1="0" x2="7" y2="14" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5" />
              <circle cx="7" cy="3" r="2" fill="currentColor" />
            </svg>
            Milestones
          </button>

          <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                  period === p.value ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* Chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        {chartData.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-gray-400 text-sm">
            Add cost items and phase events to see the chart
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={420}>
            <LineChart data={chartData} margin={{ top: 48, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
              />
              <YAxis
                tickFormatter={(v) => formatCurrency(v, true)}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#e5e7eb" />

              {showMilestones && milestones.map(({ phase, label }, i) => (
                <ReferenceLine
                  key={phase.id}
                  x={label}
                  stroke={phase.color}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  label={(props: { viewBox?: { x?: number; y?: number } }) => {
                    const { x = 0, y = 0 } = props.viewBox ?? {};
                    const row = i % 2;
                    const labelY = y - 6 - row * 16;
                    const text = phase.name;
                    const textWidth = text.length * 6.2 + 10;
                    return (
                      <g>
                        <line
                          x1={x} y1={y} x2={x} y2={labelY + 4}
                          stroke={phase.color} strokeWidth={1} strokeOpacity={0.4}
                        />
                        <rect
                          x={x + 3} y={labelY - 11}
                          width={textWidth} height={14} rx={3}
                          fill="white" fillOpacity={0.92}
                        />
                        <text x={x + 7} y={labelY} fill={phase.color} fontSize={10} fontWeight={600}>
                          {text}
                        </text>
                      </g>
                    );
                  }}
                />
              ))}

              {LINE_CONFIG.map((l) =>
                visibleLines.has(l.key) ? (
                  <Line
                    key={l.key}
                    type="monotone"
                    dataKey={l.key}
                    name={l.label}
                    stroke={l.color}
                    strokeWidth={l.key === 'baselineCost' ? 1.5 : 2}
                    strokeDasharray={l.dashed ? '6 3' : undefined}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                ) : null
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

interface VendorFilterProps {
  vendors: string[];
  /** `null` means all selected (default). */
  selected: Set<string> | null;
  onToggle: (vendor: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

function VendorFilter({ vendors, selected, onToggle, onSelectAll, onClear }: VendorFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const all = selected === null;
  const activeCount = all ? vendors.length : selected.size;
  const label = all
    ? `All vendors (${vendors.length})`
    : activeCount === 0
      ? 'No vendors'
      : activeCount === 1
        ? Array.from(selected).join(', ')
        : `${activeCount} of ${vendors.length} vendors`;

  const disabled = vendors.length === 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-all ${
          all
            ? 'bg-white border-gray-200 text-gray-500'
            : 'bg-red-50 border-red-200 text-red-700'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title="Filter baseline + existing costs by vendor"
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 20 20" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 4h14M6 10h8M9 16h2" />
        </svg>
        {label}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 bg-white border border-gray-200 rounded-xl shadow-lg w-64 py-1 text-sm">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Existing vendors</span>
            <div className="flex gap-2 text-xs">
              <button onClick={onSelectAll} className="text-indigo-600 hover:underline">All</button>
              <button onClick={onClear} className="text-gray-500 hover:underline">None</button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {vendors.map((v) => {
              const isSelected = all || (selected?.has(v) ?? false);
              return (
                <label key={v} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(v)}
                  />
                  <span className="text-gray-700 truncate">{v}</span>
                </label>
              );
            })}
          </div>
          <div className="border-t border-gray-100 mt-1 px-3 py-1.5 text-xs text-gray-400">
            Filters baseline &amp; existing-platform lines only.
          </div>
        </div>
      )}
    </div>
  );
}
