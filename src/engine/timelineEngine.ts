import type { ROIProject, MonthlyRow, Timeline, CostItem, Phase, CostLineItem, ProjectConfig } from '../types/models';

function formatMonthLabel(startDate: string, monthIndex: number): string {
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + monthIndex);
  return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

function buildLaneMigrationMap(phases: Phase[]): Map<number, Record<string, number>> {
  const map = new Map<number, Record<string, number>>();
  for (const phase of phases) {
    for (const delta of phase.monthDeltas) {
      const existing = map.get(delta.monthIndex) ?? {};
      const merged = { ...existing };
      for (const ld of delta.laneDeltas) {
        merged[ld.laneTypeId] = (merged[ld.laneTypeId] ?? 0) + ld.added;
      }
      map.set(delta.monthIndex, merged);
    }
  }
  return map;
}

interface CostResult {
  amount: number;
  lanes?: number;
  unitPrice?: number;
  discountPct?: number;
}

/** Returns the effective discount percent for an item (per-item override wins over global-new default). */
export function effectiveDiscountPct(item: CostItem, config: ProjectConfig): number {
  if (item.discountPct !== undefined) return item.discountPct;
  if (item.platform === 'new') return config.globalNewDiscountPct ?? 0;
  return 0;
}

/** Converts an item's unit price to base currency (AUD). */
function toBaseCurrency(item: CostItem, config: ProjectConfig): number {
  const base = config.baseCurrency ?? 'AUD';
  const itemCcy = item.currency ?? base;
  if (itemCcy === base) return item.unitPrice;
  const rate = config.audPerUsd ?? 1;
  if (itemCcy === 'USD' && base === 'AUD') return item.unitPrice * rate;
  if (itemCcy === 'AUD' && base === 'USD') return rate > 0 ? item.unitPrice / rate : item.unitPrice;
  return item.unitPrice;
}

function costForItem(
  item: CostItem,
  newLanes: Record<string, number>,
  existingLanes: Record<string, number>,
  monthIndex: number,
  config: ProjectConfig,
): CostResult {
  if (!item.enabled) return { amount: 0 };
  if (item.oneOff) {
    if (monthIndex !== (item.oneOffMonth ?? 0)) return { amount: 0 };
  }

  const unitPriceBase = toBaseCurrency(item, config);
  const baseMonthlyPrice = item.billing === 'annual' ? unitPriceBase / 12 : unitPriceBase;
  const discountPct = effectiveDiscountPct(item, config);
  const monthlyPrice = baseMonthlyPrice * (1 - discountPct / 100);

  if (item.costType === 'flat') {
    return { amount: monthlyPrice, unitPrice: monthlyPrice, discountPct };
  }

  const lanesForPlatform = item.platform === 'existing' ? existingLanes : newLanes;

  if (item.costType === 'per-lane-total') {
    const lanes = Object.values(lanesForPlatform).reduce((s, n) => s + n, 0);
    return { amount: monthlyPrice * lanes, lanes, unitPrice: monthlyPrice, discountPct };
  }

  // per-lane (single lane type)
  const lanes = item.laneTypeId ? (lanesForPlatform[item.laneTypeId] ?? 0) : 0;
  return { amount: monthlyPrice * lanes, lanes, unitPrice: monthlyPrice, discountPct };
}

function computeBaselineCost(
  costItems: CostItem[],
  totalLanes: Record<string, number>,
  config: ProjectConfig,
  existingVendorFilter?: Set<string>,
): number {
  let total = 0;
  for (const item of costItems) {
    if (item.platform !== 'existing' || !item.enabled || item.oneOff) continue;
    if (existingVendorFilter && !existingVendorFilter.has(item.vendor)) continue;
    const result = costForItem(item, {}, totalLanes, -1, config);
    total += result.amount;
  }
  return total;
}

export interface ComputeTimelineOptions {
  /** When provided, only these vendors contribute to baseline + existing-platform costs. */
  existingVendorFilter?: Set<string>;
}

export function computeTimeline(project: ROIProject, opts: ComputeTimelineOptions = {}): Timeline {
  const { config, costItems, phases } = project;
  const { laneTypes, totalLanes } = config;
  const migrationMap = buildLaneMigrationMap(phases);
  const { existingVendorFilter } = opts;

  const baselineCostPerMonth = computeBaselineCost(costItems, totalLanes, config, existingVendorFilter);

  const newLanes: Record<string, number> = {};
  for (const lt of laneTypes) newLanes[lt.id] = 0;

  let cumulativeSavings = 0;
  const rows: MonthlyRow[] = [];

  for (let m = 0; m < config.durationMonths; m++) {
    const migration = migrationMap.get(m);
    if (migration) {
      for (const lt of laneTypes) {
        const added = migration[lt.id] ?? 0;
        newLanes[lt.id] = Math.min((newLanes[lt.id] ?? 0) + added, totalLanes[lt.id] ?? 0);
      }
    }

    const existingLanes: Record<string, number> = {};
    for (const lt of laneTypes) {
      existingLanes[lt.id] = Math.max(0, (totalLanes[lt.id] ?? 0) - (newLanes[lt.id] ?? 0));
    }

    let existingCost = 0;
    let newCost = 0;
    const existingBreakdown: CostLineItem[] = [];
    const newBreakdown: CostLineItem[] = [];

    for (const item of costItems) {
      if (item.platform === 'existing' && existingVendorFilter && !existingVendorFilter.has(item.vendor)) continue;
      const result = costForItem(item, { ...newLanes }, existingLanes, m, config);
      if (result.amount === 0) continue;

      const lineItem: CostLineItem = {
        itemId: item.id,
        vendor: item.vendor,
        name: item.name,
        amount: result.amount,
        lanes: result.lanes,
        unitPrice: result.unitPrice,
        discountPct: result.discountPct && result.discountPct > 0 ? result.discountPct : undefined,
      };

      if (item.platform === 'existing') {
        existingCost += result.amount;
        existingBreakdown.push(lineItem);
      } else {
        newCost += result.amount;
        newBreakdown.push(lineItem);
      }
    }

    const savings = baselineCostPerMonth - (existingCost + newCost);
    cumulativeSavings += savings;

    rows.push({
      monthIndex: m,
      label: formatMonthLabel(config.startDate, m),
      newLanes: { ...newLanes },
      existingLanes,
      existingCost,
      newCost,
      baselineCost: baselineCostPerMonth,
      savings,
      cumulativeSavings,
      existingBreakdown,
      newBreakdown,
    });
  }

  const totalExisting = rows.reduce((s, r) => s + r.existingCost, 0);
  const totalNew = rows.reduce((s, r) => s + r.newCost, 0);
  const totalBaseline = baselineCostPerMonth * config.durationMonths;

  return {
    rows,
    baselineCostPerMonth,
    totalExisting,
    totalNew,
    totalBaseline,
    totalSavings: totalBaseline - (totalExisting + totalNew),
  };
}

export type PeriodView = 'monthly' | 'quarterly' | 'annual';

export interface AggregatedRow {
  label: string;
  existingCost: number;
  newCost: number;
  combinedCost: number;
  baselineCost: number;
  savings: number;
  cumulativeSavings: number;
}

export function aggregateTimeline(rows: MonthlyRow[], period: PeriodView): AggregatedRow[] {
  if (period === 'monthly') {
    return rows.map(r => ({
      label: r.label,
      existingCost: r.existingCost,
      newCost: r.newCost,
      combinedCost: r.existingCost + r.newCost,
      baselineCost: r.baselineCost,
      savings: r.savings,
      cumulativeSavings: r.cumulativeSavings,
    }));
  }

  const groupSize = period === 'quarterly' ? 3 : 12;
  const result: AggregatedRow[] = [];

  for (let i = 0; i < rows.length; i += groupSize) {
    const chunk = rows.slice(i, i + groupSize);
    const existingCost = chunk.reduce((s, r) => s + r.existingCost, 0);
    const newCost = chunk.reduce((s, r) => s + r.newCost, 0);
    const baselineCost = chunk.reduce((s, r) => s + r.baselineCost, 0);
    result.push({
      label: chunk[0].label,
      existingCost,
      newCost,
      combinedCost: existingCost + newCost,
      baselineCost,
      savings: baselineCost - (existingCost + newCost),
      cumulativeSavings: chunk[chunk.length - 1].cumulativeSavings,
    });
  }

  return result;
}
