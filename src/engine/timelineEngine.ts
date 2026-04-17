import type { ROIProject, MonthlyRow, Timeline, CostItem, Phase, CostLineItem } from '../types/models';

function formatMonthLabel(startDate: string, monthIndex: number): string {
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + monthIndex);
  return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

function buildLaneMigrationMap(phases: Phase[]): Map<number, { pos: number; sco: number }> {
  const map = new Map<number, { pos: number; sco: number }>();
  for (const phase of phases) {
    for (const delta of phase.monthDeltas) {
      const existing = map.get(delta.monthIndex) ?? { pos: 0, sco: 0 };
      map.set(delta.monthIndex, {
        pos: existing.pos + delta.posLanesAdded,
        sco: existing.sco + delta.scoLanesAdded,
      });
    }
  }
  return map;
}

interface CostResult {
  amount: number;
  lanes?: number;
  unitPrice?: number;
}

function costForItem(
  item: CostItem,
  posLanesForPlatform: number,
  scoLanesForPlatform: number,
  monthIndex: number,
): CostResult {
  if (!item.enabled) return { amount: 0 };
  if (item.oneOff) {
    if (monthIndex !== (item.oneOffMonth ?? 0)) return { amount: 0 };
  }

  const baseMonthlyPrice = item.billing === 'annual' ? item.unitPrice / 12 : item.unitPrice;
  const discount = (item.discountPct ?? 0) / 100;
  const monthlyPrice = baseMonthlyPrice * (1 - discount);

  if (item.costType === 'flat') {
    return { amount: monthlyPrice, unitPrice: monthlyPrice };
  }

  // per-lane
  let lanes = 0;
  if (item.laneType === 'POS') lanes = posLanesForPlatform;
  else if (item.laneType === 'SCO') lanes = scoLanesForPlatform;
  else if (item.laneType === 'both') lanes = posLanesForPlatform + scoLanesForPlatform;

  return { amount: monthlyPrice * lanes, lanes, unitPrice: monthlyPrice };
}

/** Compute the full-lanes baseline cost for existing platform (what you'd pay with no migration) */
function computeBaselineCost(costItems: CostItem[], totalPos: number, totalSco: number): number {
  let total = 0;
  for (const item of costItems) {
    if (item.platform !== 'existing' || !item.enabled || item.oneOff) continue;
    const result = costForItem(item, totalPos, totalSco, -1);
    total += result.amount;
  }
  return total;
}

export function computeTimeline(project: ROIProject): Timeline {
  const { config, costItems, phases } = project;
  const migrationMap = buildLaneMigrationMap(phases);

  const baselineCostPerMonth = computeBaselineCost(costItems, config.totalPosLanes, config.totalScoLanes);

  let newPosLanes = 0;
  let newScoLanes = 0;
  let cumulativeSavings = 0;

  const rows: MonthlyRow[] = [];

  for (let m = 0; m < config.durationMonths; m++) {
    const migration = migrationMap.get(m);
    if (migration) {
      newPosLanes = Math.min(newPosLanes + migration.pos, config.totalPosLanes);
      newScoLanes = Math.min(newScoLanes + migration.sco, config.totalScoLanes);
    }

    const existingPosLanes = Math.max(0, config.totalPosLanes - newPosLanes);
    const existingScoLanes = Math.max(0, config.totalScoLanes - newScoLanes);

    let existingCost = 0;
    let newCost = 0;
    const existingBreakdown: CostLineItem[] = [];
    const newBreakdown: CostLineItem[] = [];

    for (const item of costItems) {
      const posLanes = item.platform === 'existing' ? existingPosLanes : newPosLanes;
      const scoLanes = item.platform === 'existing' ? existingScoLanes : newScoLanes;
      const result = costForItem(item, posLanes, scoLanes, m);

      if (result.amount === 0) continue;

      const lineItem: CostLineItem = {
        itemId: item.id,
        vendor: item.vendor,
        name: item.name,
        amount: result.amount,
        lanes: result.lanes,
        unitPrice: result.unitPrice,
        discountPct: item.discountPct && item.discountPct > 0 ? item.discountPct : undefined,
      };

      if (item.platform === 'existing') {
        existingCost += result.amount;
        existingBreakdown.push(lineItem);
      } else {
        newCost += result.amount;
        newBreakdown.push(lineItem);
      }
    }

    // Savings = what you would have paid (baseline) minus what you're actually paying (existing + new)
    const savings = baselineCostPerMonth - (existingCost + newCost);
    cumulativeSavings += savings;

    rows.push({
      monthIndex: m,
      label: formatMonthLabel(config.startDate, m),
      newPosLanes,
      newScoLanes,
      existingPosLanes,
      existingScoLanes,
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
  baselineCost: number;
  savings: number; // positive = saving vs baseline
  cumulativeSavings: number; // running total at end of this period
}

export function aggregateTimeline(rows: MonthlyRow[], period: PeriodView): AggregatedRow[] {
  if (period === 'monthly') {
    return rows.map(r => ({
      label: r.label,
      existingCost: r.existingCost,
      newCost: r.newCost,
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
      baselineCost,
      savings: baselineCost - (existingCost + newCost),
      cumulativeSavings: chunk[chunk.length - 1].cumulativeSavings,
    });
  }

  return result;
}
