import { useEffect, useRef, useState } from 'react';
import { useROIStore } from '../store/roiStore';
import type { CostItem, Platform, BillingCycle, Currency, ROIProject } from '../types/models';
import { effectiveDiscountPct } from '../engine/timelineEngine';
import { formatInCurrency } from '../utils/format';

type NewRow = Partial<Omit<CostItem, 'id' | 'platform'>>;
const EMPTY_NEW_ROW: NewRow = {};

type ColKey =
  | 'drag' | 'enabled' | 'vendor' | 'name' | 'costType' | 'lane' | 'price'
  | 'currency' | 'billing' | 'discount' | 'oneOff' | 'effective' | 'annual' | 'actions';

interface ColDef {
  key: ColKey;
  label: string;
  defaultWidth: number;
  minWidth: number;
  align?: 'left' | 'right' | 'center';
  /** If true, the user can't hide this column. */
  required?: boolean;
}

const COLUMNS: ColDef[] = [
  { key: 'drag',      label: '',            defaultWidth: 24,  minWidth: 24,  align: 'center', required: true },
  { key: 'enabled',   label: 'On',          defaultWidth: 36,  minWidth: 32,  align: 'center', required: true },
  { key: 'vendor',    label: 'Vendor',      defaultWidth: 150, minWidth: 60 },
  { key: 'name',      label: 'Item',        defaultWidth: 220, minWidth: 80,  required: true },
  { key: 'costType',  label: 'Type',        defaultWidth: 96,  minWidth: 72 },
  { key: 'lane',      label: 'Lane',        defaultWidth: 90,  minWidth: 60 },
  { key: 'price',     label: 'Price',       defaultWidth: 78,  minWidth: 56,  align: 'right' },
  { key: 'currency',  label: 'Ccy',         defaultWidth: 64,  minWidth: 52 },
  { key: 'billing',   label: 'Billing',     defaultWidth: 84,  minWidth: 68 },
  { key: 'discount',  label: 'Discount',    defaultWidth: 90,  minWidth: 68,  align: 'right' },
  { key: 'oneOff',    label: 'One-off',     defaultWidth: 76,  minWidth: 56,  align: 'center' },
  { key: 'effective', label: 'Net/mth',    defaultWidth: 120, minWidth: 80,  align: 'right' },
  { key: 'annual',    label: 'Total',       defaultWidth: 120, minWidth: 88,  align: 'right' },
  { key: 'actions',   label: 'Del',         defaultWidth: 44,  minWidth: 40,  align: 'center', required: true },
];

const STORAGE_WIDTHS = 'roi-planner.costs.colWidths';
const STORAGE_HIDDEN = 'roi-planner.costs.colHidden';
const STORAGE_TOTAL_SCALE = 'roi-planner.costs.totalScale';

type TotalScale = 'monthly' | 'quarterly' | 'annual';
const SCALE_MONTHS: Record<TotalScale, number> = { monthly: 1, quarterly: 3, annual: 12 };
const SCALE_LABEL: Record<TotalScale, string> = { monthly: 'Total / mo', quarterly: 'Total / qtr', annual: 'Total / yr' };
const SCALE_SHORT: Record<TotalScale, string> = { monthly: 'mo', quarterly: 'qtr', annual: 'yr' };

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}

function saveJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore quota */ }
}

interface RowAmounts {
  monthlyPriceInBase: number;
  previewLanes: number;
  totalAmount: number;
}

/**
 * Compute the displayed Net/mth and Total figures for a single cost item in the
 * project's base currency, at the given time scale. Shared between the row render
 * and the table's sum row so they can never drift out of sync.
 */
function computeRowAmounts(
  item: CostItem,
  config: ROIProject['config'],
  totalScale: TotalScale,
): RowAmounts {
  const baseCurrency: Currency = config.baseCurrency ?? 'AUD';
  const itemCurrency: Currency = item.currency ?? baseCurrency;
  const audPerUsd = config.audPerUsd ?? 1;
  const unitPriceInBase =
    itemCurrency === baseCurrency
      ? item.unitPrice
      : itemCurrency === 'USD' && baseCurrency === 'AUD'
        ? item.unitPrice * audPerUsd
        : itemCurrency === 'AUD' && baseCurrency === 'USD'
          ? (audPerUsd > 0 ? item.unitPrice / audPerUsd : item.unitPrice)
          : item.unitPrice;
  const discount = effectiveDiscountPct(item, config);
  const monthlyPriceInBase = (item.billing === 'annual' ? unitPriceInBase / 12 : unitPriceInBase) * (1 - discount / 100);
  const previewLanes =
    item.costType === 'per-lane'
      ? (item.laneTypeId ? (config.totalLanes[item.laneTypeId] ?? 0) : 0)
      : item.costType === 'per-lane-total'
        ? Object.values(config.totalLanes).reduce((s, n) => s + n, 0)
        : 1;
  const scaleMonths = SCALE_MONTHS[totalScale];
  const totalAmount = item.oneOff
    ? monthlyPriceInBase * previewLanes
    : monthlyPriceInBase * previewLanes * scaleMonths;
  return { monthlyPriceInBase, previewLanes, totalAmount };
}

export function CostsPage() {
  const { project, addCostItem, updateCostItem, deleteCostItem, reorderCostItem, updateConfig } = useROIStore();
  const { config } = project;

  const baseCurrency: Currency = config.baseCurrency ?? 'AUD';
  const audPerUsd = config.audPerUsd ?? 1.5;
  const usdPerAud = audPerUsd > 0 ? 1 / audPerUsd : 0;
  const globalNewDiscountPct = config.globalNewDiscountPct ?? 0;
  const [fxDirection, setFxDirection] = useState<'audPerUsd' | 'usdPerAud'>('audPerUsd');

  // Column layout state (shared across both tables)
  const [widths, setWidths] = useState<Record<ColKey, number>>(() => {
    const saved = loadJson<Partial<Record<ColKey, number>>>(STORAGE_WIDTHS, {});
    const base: Record<ColKey, number> = {} as Record<ColKey, number>;
    for (const c of COLUMNS) {
      // Clamp saved widths to the current minWidth in case defaults shrank since last save.
      const s = saved[c.key];
      base[c.key] = s != null ? Math.max(c.minWidth, s) : c.defaultWidth;
    }
    return base;
  });
  const [hidden, setHidden] = useState<Set<ColKey>>(() => {
    const saved = loadJson<ColKey[]>(STORAGE_HIDDEN, []);
    return new Set(saved);
  });
  const [totalScale, setTotalScale] = useState<TotalScale>(
    () => loadJson<TotalScale>(STORAGE_TOTAL_SCALE, 'annual')
  );

  useEffect(() => { saveJson(STORAGE_TOTAL_SCALE, totalScale); }, [totalScale]);
  useEffect(() => { saveJson(STORAGE_WIDTHS, widths); }, [widths]);
  useEffect(() => { saveJson(STORAGE_HIDDEN, Array.from(hidden)); }, [hidden]);

  const setWidth = (key: ColKey, w: number) => setWidths((prev) => ({ ...prev, [key]: w }));
  const toggleHidden = (key: ColKey) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const resetLayout = () => {
    setWidths(() => {
      const base: Record<ColKey, number> = {} as Record<ColKey, number>;
      for (const c of COLUMNS) base[c.key] = c.defaultWidth;
      return base;
    });
    setHidden(new Set());
  };

  const existing = project.costItems.filter((c) => c.platform === 'existing');
  const newPlatform = project.costItems.filter((c) => c.platform === 'new');

  const visibleColumns = COLUMNS.filter((c) => !hidden.has(c.key));

  const pricingToolbar = (
    <div className="bg-green-50/50 border border-green-100 rounded-xl p-4">
      <div className="flex items-end gap-6 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Global New Discount</label>
          <div className="relative">
            <input
              type="number"
              className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm pr-6"
              value={globalNewDiscountPct}
              onChange={(e) => updateConfig({ globalNewDiscountPct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
              min={0}
              max={100}
              step={0.5}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Applied to every new-platform item unless overridden.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Base Currency</label>
          <select
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            value={baseCurrency}
            onChange={(e) => updateConfig({ baseCurrency: e.target.value as Currency })}
          >
            <option value="AUD">AUD</option>
            <option value="USD">USD</option>
          </select>
          <p className="text-xs text-gray-400 mt-1">Totals and charts render in this currency.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Exchange Rate</label>
          <div className="flex items-center gap-1.5">
            <select
              className="border border-gray-300 rounded px-1.5 py-1.5 text-sm"
              value={fxDirection}
              onChange={(e) => setFxDirection(e.target.value as 'audPerUsd' | 'usdPerAud')}
            >
              <option value="audPerUsd">1 USD =</option>
              <option value="usdPerAud">1 AUD =</option>
            </select>
            <input
              type="number"
              className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm"
              value={fxDirection === 'audPerUsd' ? audPerUsd : usdPerAud}
              onChange={(e) => {
                const v = parseFloat(e.target.value) || 0;
                if (fxDirection === 'audPerUsd') updateConfig({ audPerUsd: v });
                else updateConfig({ audPerUsd: v > 0 ? 1 / v : 0 });
              }}
              min={0}
              step={0.01}
            />
            <span className="text-sm text-gray-500">{fxDirection === 'audPerUsd' ? 'AUD' : 'USD'}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            1 AUD = {usdPerAud.toFixed(4)} USD · 1 USD = {audPerUsd.toFixed(4)} AUD
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex justify-end">
        <ColumnMenu hidden={hidden} onToggle={toggleHidden} onReset={resetLayout} />
      </div>

      <CostTable
        title="Existing Platform Costs"
        subtitle="Costs that reduce as lanes migrate to the new platform"
        platform="existing"
        accent="red"
        items={existing}
        onUpdate={updateCostItem}
        onDelete={deleteCostItem}
        onReorder={reorderCostItem}
        onAdd={(item) => addCostItem({ ...item, platform: 'existing' })}
        visibleColumns={visibleColumns}
        widths={widths}
        setWidth={setWidth}
        totalScale={totalScale}
        setTotalScale={setTotalScale}
      />

      <CostTable
        title="New Platform Costs"
        subtitle="Costs that increase as lanes migrate to the new platform"
        platform="new"
        accent="green"
        items={newPlatform}
        onUpdate={updateCostItem}
        onDelete={deleteCostItem}
        onReorder={reorderCostItem}
        onAdd={(item) => addCostItem({ ...item, platform: 'new' })}
        visibleColumns={visibleColumns}
        widths={widths}
        setWidth={setWidth}
        totalScale={totalScale}
        setTotalScale={setTotalScale}
        headerExtra={pricingToolbar}
      />
    </div>
  );
}

interface ColumnMenuProps {
  hidden: Set<ColKey>;
  onToggle: (key: ColKey) => void;
  onReset: () => void;
}

function ColumnMenu({ hidden, onToggle, onReset }: ColumnMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-700"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        Columns
        {hidden.size > 0 && <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5">{hidden.size} hidden</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 bg-white border border-gray-200 rounded-xl shadow-lg w-56 py-1 text-sm">
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Show columns</div>
          {COLUMNS.filter((c) => c.label).map((c) => (
            <label key={c.key} className={`flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 ${c.required ? 'opacity-60' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={!hidden.has(c.key)}
                disabled={c.required}
                onChange={() => onToggle(c.key)}
              />
              <span className="text-gray-700">{c.label}</span>
            </label>
          ))}
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={() => { onReset(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-gray-600 hover:bg-gray-50"
          >
            Reset layout
          </button>
        </div>
      )}
    </div>
  );
}

interface TableProps {
  title: string;
  subtitle: string;
  platform: Platform;
  accent: 'red' | 'green';
  items: CostItem[];
  onUpdate: (id: string, updates: Partial<CostItem>) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, targetIndexInGroup: number) => void;
  onAdd: (item: Omit<CostItem, 'id'>) => void;
  visibleColumns: ColDef[];
  widths: Record<ColKey, number>;
  setWidth: (key: ColKey, w: number) => void;
  totalScale: TotalScale;
  setTotalScale: (s: TotalScale) => void;
  /** Optional content rendered between the heading and the table (e.g. a pricing toolbar). */
  headerExtra?: React.ReactNode;
}

function CostTable({
  title, subtitle, platform, accent, items,
  onUpdate, onDelete, onReorder, onAdd,
  visibleColumns, widths, setWidth, totalScale, setTotalScale, headerExtra,
}: TableProps) {
  const { project } = useROIStore();
  const { laneTypes } = project.config;
  const baseCurrency: Currency = project.config.baseCurrency ?? 'AUD';
  const globalNewDiscountPct = project.config.globalNewDiscountPct ?? 0;
  const [draft, setDraft] = useState<NewRow>(EMPTY_NEW_ROW);

  const accentBg = accent === 'red' ? 'bg-red-50/60' : 'bg-green-50/60';
  const accentText = accent === 'red' ? 'text-red-700' : 'text-green-700';
  const accentBorder = accent === 'red' ? 'border-red-100' : 'border-green-100';

  // Drag-and-drop row reorder state.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after'>('before');

  function handleDrop(targetIdx: number, targetId: string, position: 'before' | 'after') {
    if (!draggingId) return;
    const fromIdx = items.findIndex((c) => c.id === draggingId);
    if (fromIdx === -1 || items[fromIdx].id === targetId) {
      setDraggingId(null);
      setDropTargetId(null);
      return;
    }
    let to = targetIdx + (position === 'after' ? 1 : 0);
    // When dragging downward and target is after source, the removal shifts indices by 1.
    if (fromIdx < to) to -= 1;
    onReorder(draggingId, to);
    setDraggingId(null);
    setDropTargetId(null);
  }

  // Refs to each <col> element so the resize handle can update width directly
  // during a drag without re-rendering the whole table on every pointer move.
  const colRefs = useRef<Partial<Record<ColKey, HTMLTableColElement | null>>>({});

  // Measure container to decide if we need to scale user widths down to fit.
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  function commitDraft() {
    if (!draft.name?.trim()) return;
    onAdd({
      platform,
      vendor: draft.vendor?.trim() ?? '',
      name: draft.name.trim(),
      costType: draft.costType ?? 'flat',
      laneTypeId: draft.laneTypeId ?? (draft.costType === 'per-lane' ? laneTypes[0]?.id : undefined),
      unitPrice: draft.unitPrice ?? 0,
      currency: draft.currency,
      billing: draft.billing ?? 'monthly',
      oneOff: draft.oneOff ?? false,
      oneOffMonth: draft.oneOff ? (draft.oneOffMonth ?? 0) : undefined,
      discountPct: draft.discountPct,
      enabled: true,
    });
    setDraft(EMPTY_NEW_ROW);
  }

  // Totals row: sum enabled items only, using the same calculation used per row.
  let sumNet = 0;
  let sumTotal = 0;
  let enabledCount = 0;
  for (const item of items) {
    if (!item.enabled) continue;
    enabledCount++;
    const { monthlyPriceInBase, previewLanes, totalAmount } = computeRowAmounts(item, project.config, totalScale);
    sumNet += monthlyPriceInBase * previewLanes;
    sumTotal += totalAmount;
  }

  // Every column uses its user-configured width exactly. If the total is less than
  // the container, the table just renders with its natural width (empty space to
  // the right). If more, the inner wrapper scrolls horizontally. This keeps drag-
  // resize predictable: you drag to width X, the column stays at width X.
  const naturalWidth = visibleColumns.reduce((s, c) => s + widths[c.key], 0);
  const overflowing = naturalWidth > containerWidth && containerWidth > 0;
  const tableWidth = naturalWidth;

  return (
    <section>
      <div className="flex items-center justify-between mb-2 px-1">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
      </div>

      {headerExtra && <div className="mb-3">{headerExtra}</div>}

      {/* containerRef sits on the full-width outer block so the resize observer measures available space;
          the inner wrapper shrinks to the table's natural width when it fits, or scrolls when it doesn't. */}
      <div ref={containerRef} className="w-full">
        <div
          className={`bg-white border border-gray-200 rounded-xl overflow-hidden ${
            overflowing ? 'overflow-x-auto w-full' : 'w-fit max-w-full'
          }`}
        >
          <table className="text-sm border-collapse" style={{ width: tableWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {visibleColumns.map((c) => (
                <col
                  key={c.key}
                  ref={(el) => { colRefs.current[c.key] = el; }}
                  style={{ width: widths[c.key] }}
                />
              ))}
            </colgroup>
            <thead className={`${accentBg} ${accentText} text-xs uppercase tracking-wide`}>
              <tr>
                {visibleColumns.map((c, idx) => (
                  <th
                    key={c.key}
                    className={`px-2 py-2 font-semibold relative ${
                      c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                  >
                    {c.key === 'annual' ? (
                      <select
                        className={`bg-transparent border-0 font-semibold uppercase tracking-wide cursor-pointer focus:outline-none focus:ring-1 rounded px-1 -mx-1 ${accentText}`}
                        value={totalScale}
                        onChange={(e) => setTotalScale(e.target.value as TotalScale)}
                        title="Change total time scale"
                      >
                        <option value="monthly">{SCALE_LABEL.monthly}</option>
                        <option value="quarterly">{SCALE_LABEL.quarterly}</option>
                        <option value="annual">{SCALE_LABEL.annual}</option>
                      </select>
                    ) : c.label}
                    {idx < visibleColumns.length - 1 && (
                      <ResizeHandle
                        colKey={c.key}
                        minWidth={c.minWidth}
                        colRefs={colRefs}
                        onCommit={(w) => setWidth(c.key, w)}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <EditableRow
                  key={item.id}
                  item={item}
                  laneTypes={laneTypes}
                  baseCurrency={baseCurrency}
                  globalNewDiscountPct={globalNewDiscountPct}
                  visibleColumns={visibleColumns}
                  totalScale={totalScale}
                  onUpdate={(u) => onUpdate(item.id, u)}
                  onDelete={() => onDelete(item.id)}
                  dragging={draggingId === item.id}
                  dropBefore={dropTargetId === item.id && dropPosition === 'before'}
                  dropAfter={dropTargetId === item.id && dropPosition === 'after'}
                  onDragStart={() => setDraggingId(item.id)}
                  onDragEnd={() => { setDraggingId(null); setDropTargetId(null); }}
                  onDragOver={(pos) => {
                    if (!draggingId || draggingId === item.id) return;
                    setDropTargetId(item.id);
                    setDropPosition(pos);
                  }}
                  onDrop={(pos) => handleDrop(idx, item.id, pos)}
                />
              ))}
              {/* Draft row */}
              <DraftRow
                accent={accent}
                accentBg={accentBg}
                accentBorder={accentBorder}
                platform={platform}
                laneTypes={laneTypes}
                baseCurrency={baseCurrency}
                globalNewDiscountPct={globalNewDiscountPct}
                draft={draft}
                setDraft={setDraft}
                commit={commitDraft}
                visibleColumns={visibleColumns}
              />
            </tbody>
            <tfoot>
              <tr className={`border-t-2 ${accent === 'red' ? 'border-red-200 bg-red-50/60' : 'border-green-200 bg-green-50/60'} font-semibold`}>
                {visibleColumns.map((c) => {
                  if (c.key === 'name') {
                    return (
                      <td key={c.key} className="px-2 py-2 text-gray-700 text-sm">
                        Total <span className="text-gray-400 font-normal">({enabledCount} item{enabledCount === 1 ? '' : 's'})</span>
                      </td>
                    );
                  }
                  if (c.key === 'effective') {
                    return (
                      <td key={c.key} className={`px-2 py-2 text-right tabular-nums ${accent === 'red' ? 'text-red-700' : 'text-green-700'}`}>
                        {formatInCurrency(sumNet, baseCurrency)}
                      </td>
                    );
                  }
                  if (c.key === 'annual') {
                    return (
                      <td key={c.key} className={`px-2 py-2 text-right tabular-nums ${accent === 'red' ? 'text-red-700' : 'text-green-700'}`}>
                        {formatInCurrency(sumTotal, baseCurrency)}
                      </td>
                    );
                  }
                  return <td key={c.key} className="px-1 py-2" />;
                })}
              </tr>
            </tfoot>
          </table>
        </div>
        {items.length === 0 && (
          <div className="text-xs text-gray-400 italic text-center py-2 border-t border-gray-100">
            No items yet — add one using the row above.
          </div>
        )}
      </div>
    </section>
  );
}

interface ResizeHandleProps {
  colKey: ColKey;
  minWidth: number;
  colRefs: React.MutableRefObject<Partial<Record<ColKey, HTMLTableColElement | null>>>;
  onCommit: (w: number) => void;
}

/**
 * Column resize handle using pointer capture. During the drag we mutate the <col>
 * element's inline width directly (no React state updates) so the user sees a
 * perfectly smooth 1:1 edge that never stutters or rubber-bands from a re-layout.
 * On pointer-up we commit the final width to React state.
 */
function ResizeHandle({ colKey, minWidth, colRefs, onCommit }: ResizeHandleProps) {
  const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const colEl = colRefs.current[colKey];
    if (!colEl) return;

    const startX = e.clientX;
    const startW = colEl.getBoundingClientRect().width;
    let latest = startW;
    let rafPending = false;

    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const apply = () => {
      rafPending = false;
      colEl.style.width = `${latest}px`;
    };

    const onMove = (ev: PointerEvent) => {
      latest = Math.max(minWidth, startW + (ev.clientX - startX));
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(apply);
      }
    };

    const cleanup = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    const onUp = () => {
      cleanup();
      onCommit(Math.round(latest));
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  return (
    <span
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => {
        // Double-click resets the column to its minWidth; easy way to undo an overshoot.
        e.preventDefault();
        e.stopPropagation();
        onCommit(minWidth);
      }}
      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize touch-none hover:bg-indigo-300/60 active:bg-indigo-500"
      title="Drag to resize · double-click to reset"
    />
  );
}

interface EditableRowProps {
  item: CostItem;
  laneTypes: { id: string; name: string }[];
  baseCurrency: Currency;
  globalNewDiscountPct: number;
  visibleColumns: ColDef[];
  totalScale: TotalScale;
  onUpdate: (updates: Partial<CostItem>) => void;
  onDelete: () => void;
  dragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (pos: 'before' | 'after') => void;
  onDrop: (pos: 'before' | 'after') => void;
}

function EditableRow({
  item, laneTypes, baseCurrency, globalNewDiscountPct, visibleColumns, totalScale,
  onUpdate, onDelete,
  dragging, dropBefore, dropAfter, onDragStart, onDragEnd, onDragOver, onDrop,
}: EditableRowProps) {
  const config = useROIStore((s) => s.project.config);
  const itemCurrency: Currency = item.currency ?? baseCurrency;
  const { monthlyPriceInBase, previewLanes, totalAmount } = computeRowAmounts(item, config, totalScale);
  const effectiveLabel = formatInCurrency(monthlyPriceInBase, baseCurrency);
  const totalLabel = formatInCurrency(totalAmount, baseCurrency);
  const scaleMonths = SCALE_MONTHS[totalScale];

  const cells: Record<ColKey, React.ReactNode> = {
    drag: (
      <span
        className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-600 select-none inline-block"
        title="Drag to reorder"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          // Firefox requires setData to start a drag.
          e.dataTransfer.setData('text/plain', item.id);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
          <circle cx="7" cy="5" r="1.3" />
          <circle cx="7" cy="10" r="1.3" />
          <circle cx="7" cy="15" r="1.3" />
          <circle cx="13" cy="5" r="1.3" />
          <circle cx="13" cy="10" r="1.3" />
          <circle cx="13" cy="15" r="1.3" />
        </svg>
      </span>
    ),
    enabled: (
      <input
        type="checkbox"
        checked={item.enabled}
        onChange={(e) => onUpdate({ enabled: e.target.checked })}
        title="Enabled"
      />
    ),
    vendor: (
      <input
        className="w-full border border-transparent hover:border-gray-200 focus:border-indigo-400 focus:bg-white rounded px-2 py-1 text-sm"
        value={item.vendor}
        onChange={(e) => onUpdate({ vendor: e.target.value })}
      />
    ),
    name: (
      <input
        className="w-full border border-transparent hover:border-gray-200 focus:border-indigo-400 focus:bg-white rounded px-2 py-1 text-sm"
        value={item.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
      />
    ),
    costType: (
      <select
        className="w-full border border-transparent hover:border-gray-200 focus:border-indigo-400 focus:bg-white rounded px-1.5 py-1 text-sm"
        value={item.costType}
        onChange={(e) => {
          const costType = e.target.value as CostItem['costType'];
          onUpdate({ costType, laneTypeId: costType === 'per-lane' ? (item.laneTypeId ?? laneTypes[0]?.id) : undefined });
        }}
      >
        <option value="flat">Flat</option>
        <option value="per-lane">Per Lane</option>
        <option value="per-lane-total">Per Lane (all)</option>
      </select>
    ),
    lane: item.costType === 'per-lane' ? (
      <select
        className="w-full border border-transparent hover:border-gray-200 focus:border-indigo-400 focus:bg-white rounded px-1.5 py-1 text-sm"
        value={item.laneTypeId ?? ''}
        onChange={(e) => onUpdate({ laneTypeId: e.target.value || undefined })}
      >
        <option value="">—</option>
        {laneTypes.map((lt) => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
      </select>
    ) : item.costType === 'per-lane-total' ? (
      <span className="text-gray-500 text-xs px-2 italic">all lanes</span>
    ) : <span className="text-gray-300 text-xs px-2">—</span>,
    price: (
      <input
        type="number"
        className="w-full border border-transparent hover:border-gray-200 focus:border-indigo-400 focus:bg-white rounded px-2 py-1 text-sm text-right"
        value={item.unitPrice}
        onChange={(e) => onUpdate({ unitPrice: parseFloat(e.target.value) || 0 })}
        min={0}
      />
    ),
    currency: (
      <select
        className="w-full border border-transparent hover:border-gray-200 focus:border-indigo-400 focus:bg-white rounded px-1.5 py-1 text-sm"
        value={itemCurrency}
        onChange={(e) => onUpdate({ currency: e.target.value as Currency })}
      >
        <option value="AUD">AUD</option>
        <option value="USD">USD</option>
      </select>
    ),
    billing: (
      <select
        className="w-full border border-transparent hover:border-gray-200 focus:border-indigo-400 focus:bg-white rounded px-1.5 py-1 text-sm"
        value={item.billing}
        onChange={(e) => onUpdate({ billing: e.target.value as BillingCycle })}
      >
        <option value="monthly">Monthly</option>
        <option value="annual">Annual</option>
      </select>
    ),
    discount: (
      <DiscountCell
        platform={item.platform}
        globalNewDiscountPct={globalNewDiscountPct}
        value={item.discountPct}
        onChange={(v) => onUpdate({ discountPct: v })}
      />
    ),
    oneOff: (
      <>
        <input
          type="checkbox"
          checked={item.oneOff}
          onChange={(e) => onUpdate({ oneOff: e.target.checked, oneOffMonth: e.target.checked ? (item.oneOffMonth ?? 0) : undefined })}
        />
        {item.oneOff && (
          <input
            type="number"
            className="w-12 ml-1 border border-gray-200 rounded px-1 py-0.5 text-xs"
            value={item.oneOffMonth ?? 0}
            onChange={(e) => onUpdate({ oneOffMonth: parseInt(e.target.value) || 0 })}
            min={0}
            title="Month index"
          />
        )}
      </>
    ),
    effective: <span className="text-gray-600 font-medium tabular-nums">{effectiveLabel}</span>,
    annual: (
      <span
        className="text-gray-700 font-medium tabular-nums"
        title={
          item.oneOff
            ? `${effectiveLabel} × ${previewLanes.toLocaleString()} lanes (one-off: shown as single charge)`
            : item.costType === 'flat'
              ? `${effectiveLabel}/mo × ${scaleMonths} month${scaleMonths === 1 ? '' : 's'}`
              : `${effectiveLabel}/mo × ${previewLanes.toLocaleString()} lanes × ${scaleMonths} month${scaleMonths === 1 ? '' : 's'}`
        }
      >
        {totalLabel}
      </span>
    ),
    actions: (
      <button
        onClick={onDelete}
        className="p-1 text-gray-400 hover:text-white hover:bg-red-500 rounded"
        title="Delete row"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M4 7h16M10 7V4a1 1 0 011-1h2a1 1 0 011 1v3" />
        </svg>
      </button>
    ),
  };

  return (
    <tr
      className={`border-t border-gray-100 ${item.enabled ? '' : 'opacity-50'} ${
        dragging ? 'opacity-30' : ''
      } ${dropBefore ? 'shadow-[inset_0_2px_0_0_#6366f1]' : ''} ${
        dropAfter ? 'shadow-[inset_0_-2px_0_0_#6366f1]' : ''
      }`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/plain')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const rect = e.currentTarget.getBoundingClientRect();
          const pos: 'before' | 'after' = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
          onDragOver(pos);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const pos: 'before' | 'after' = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
        onDrop(pos);
      }}
    >
      {visibleColumns.map((c) => (
        <td
          key={c.key}
          className={`px-1 py-1 overflow-hidden ${
            c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''
          }`}
        >
          {cells[c.key]}
        </td>
      ))}
    </tr>
  );
}

interface DraftRowProps {
  accent: 'red' | 'green';
  accentBg: string;
  accentBorder: string;
  platform: Platform;
  laneTypes: { id: string; name: string }[];
  baseCurrency: Currency;
  globalNewDiscountPct: number;
  draft: NewRow;
  setDraft: (u: (d: NewRow) => NewRow) => void;
  commit: () => void;
  visibleColumns: ColDef[];
}

function DraftRow({
  accent, accentBg, accentBorder, platform, laneTypes, baseCurrency, globalNewDiscountPct,
  draft, setDraft, commit, visibleColumns,
}: DraftRowProps) {
  const cells: Record<ColKey, React.ReactNode> = {
    drag: <span className="text-gray-200 text-xs">+</span>,
    enabled: (
      <span className={`inline-block w-2 h-2 rounded-full ${accent === 'red' ? 'bg-red-400' : 'bg-green-400'}`} />
    ),
    vendor: (
      <input
        className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white"
        placeholder="Vendor"
        value={draft.vendor ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, vendor: e.target.value }))}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      />
    ),
    name: (
      <input
        className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white"
        placeholder="Item name"
        value={draft.name ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      />
    ),
    costType: (
      <select
        className="w-full border border-gray-200 rounded px-1.5 py-1 text-sm bg-white"
        value={draft.costType ?? 'flat'}
        onChange={(e) => setDraft((d) => ({ ...d, costType: e.target.value as CostItem['costType'] }))}
      >
        <option value="flat">Flat</option>
        <option value="per-lane">Per Lane</option>
        <option value="per-lane-total">Per Lane (all)</option>
      </select>
    ),
    lane: draft.costType === 'per-lane' ? (
      <select
        className="w-full border border-gray-200 rounded px-1.5 py-1 text-sm bg-white"
        value={draft.laneTypeId ?? laneTypes[0]?.id ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, laneTypeId: e.target.value || undefined }))}
      >
        {laneTypes.length === 0 && <option value="">No lanes</option>}
        {laneTypes.map((lt) => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
      </select>
    ) : draft.costType === 'per-lane-total' ? (
      <span className="text-gray-500 text-xs px-2 italic">all lanes</span>
    ) : <span className="text-gray-300 text-xs px-2">—</span>,
    price: (
      <input
        type="number"
        className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white text-right"
        placeholder="0"
        value={draft.unitPrice ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, unitPrice: parseFloat(e.target.value) || 0 }))}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
        min={0}
      />
    ),
    currency: (
      <select
        className="w-full border border-gray-200 rounded px-1.5 py-1 text-sm bg-white"
        value={draft.currency ?? baseCurrency}
        onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value as Currency }))}
      >
        <option value="AUD">AUD</option>
        <option value="USD">USD</option>
      </select>
    ),
    billing: (
      <select
        className="w-full border border-gray-200 rounded px-1.5 py-1 text-sm bg-white"
        value={draft.billing ?? 'monthly'}
        onChange={(e) => setDraft((d) => ({ ...d, billing: e.target.value as BillingCycle }))}
      >
        <option value="monthly">Monthly</option>
        <option value="annual">Annual</option>
      </select>
    ),
    discount: (
      <DiscountCell
        platform={platform}
        globalNewDiscountPct={globalNewDiscountPct}
        value={draft.discountPct}
        onChange={(v) => setDraft((d) => ({ ...d, discountPct: v }))}
      />
    ),
    oneOff: (
      <>
        <input
          type="checkbox"
          checked={draft.oneOff ?? false}
          onChange={(e) => setDraft((d) => ({ ...d, oneOff: e.target.checked }))}
        />
        {draft.oneOff && (
          <input
            type="number"
            className="w-12 ml-1 border border-gray-200 rounded px-1 py-0.5 text-xs bg-white"
            placeholder="m"
            value={draft.oneOffMonth ?? 0}
            onChange={(e) => setDraft((d) => ({ ...d, oneOffMonth: parseInt(e.target.value) || 0 }))}
            min={0}
          />
        )}
      </>
    ),
    effective: <span className="text-xs text-gray-400">—</span>,
    annual: <span className="text-xs text-gray-400">—</span>,
    actions: (
      <button
        onClick={commit}
        disabled={!draft.name?.trim()}
        className="p-1 text-indigo-600 disabled:text-gray-300 hover:bg-indigo-50 rounded"
        title="Add (Enter)"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    ),
  };

  return (
    <tr className={`border-t ${accentBorder} ${accentBg}`}>
      {visibleColumns.map((c) => (
        <td
          key={c.key}
          className={`px-1 py-1 overflow-hidden ${
            c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''
          }`}
        >
          {cells[c.key]}
        </td>
      ))}
    </tr>
  );
}

interface DiscountCellProps {
  platform: Platform;
  globalNewDiscountPct: number;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}

function DiscountCell({ platform, globalNewDiscountPct, value, onChange }: DiscountCellProps) {
  const isOverride = value !== undefined;
  const displayValue = isOverride ? value : (platform === 'new' ? globalNewDiscountPct : 0);
  const canClearToGlobal = platform === 'new';

  return (
    <div className="flex items-center gap-1">
      <div className="relative flex-1">
        <input
          type="number"
          className={`w-full border rounded px-1.5 py-1 text-sm text-right pr-5 ${
            isOverride
              ? 'border-gray-300 bg-white'
              : 'border-transparent hover:border-gray-200 bg-transparent text-gray-400 italic'
          }`}
          value={displayValue}
          onChange={(e) => {
            const v = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
            onChange(v);
          }}
          min={0}
          max={100}
          step={0.5}
          title={isOverride ? 'Per-item discount (click × to use global)' : (canClearToGlobal ? `Using global ${globalNewDiscountPct}% — type to override` : 'Discount %')}
        />
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">%</span>
      </div>
      {canClearToGlobal && isOverride && (
        <button
          onClick={() => onChange(undefined)}
          className="text-gray-300 hover:text-gray-600 text-xs px-1"
          title="Revert to global"
        >
          ×
        </button>
      )}
    </div>
  );
}
