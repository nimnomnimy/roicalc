export type Platform = 'existing' | 'new';
export type BillingCycle = 'monthly' | 'annual';
export type Currency = 'AUD' | 'USD';

export interface LaneTypeDef {
  id: string;
  name: string;
}

export interface CostItem {
  id: string;
  platform: Platform;
  vendor: string;
  name: string;
  /**
   * - 'flat': a single monthly amount
   * - 'per-lane': charged per lane of a specific lane type
   * - 'per-lane-total': charged per lane across ALL lane types (sum of every lane)
   */
  costType: 'per-lane' | 'per-lane-total' | 'flat';
  laneTypeId?: string; // id of LaneTypeDef; only when costType === 'per-lane'
  unitPrice: number;
  currency?: Currency; // defaults to project base currency when absent
  billing: BillingCycle;
  oneOff: boolean;
  oneOffMonth?: number;
  /** Per-item discount override; when undefined, falls back to globalNewDiscountPct for 'new' platform items. */
  discountPct?: number;
  enabled: boolean;
}

/**
 * Preset phase kinds kept around for backwards compatibility with existing projects
 * and Excel imports. New phases can be created without a type — the name and colour
 * are the source of truth for display.
 */
export type PhaseType = 'poc' | 'pilot' | 'controlled' | 'rollout' | 'custom';

export interface PhaseMonthDelta {
  monthIndex: number;
  laneDeltas: { laneTypeId: string; added: number }[];
}

export interface Phase {
  id: string;
  /** Optional preset kind (for imports / legacy projects). User-created phases default to 'custom'. */
  type?: PhaseType;
  name: string;
  color: string;
  monthDeltas: PhaseMonthDelta[];
}

export interface ProjectConfig {
  name: string;
  startDate: string;
  durationMonths: number;
  laneTypes: LaneTypeDef[];
  /** Total lanes per lane type id at project start */
  totalLanes: Record<string, number>;
  /** Default discount % applied to all 'new' platform items unless the item has its own discountPct. */
  globalNewDiscountPct?: number;
  /** Base currency for display and totals. Defaults to AUD. */
  baseCurrency?: Currency;
  /** AUD equivalent of 1 USD (e.g. 1.52). Used to convert USD-priced items to AUD. */
  audPerUsd?: number;
}

export interface ROIProject {
  config: ProjectConfig;
  costItems: CostItem[];
  phases: Phase[];
}

// --- Computed types ---

export interface CostLineItem {
  itemId: string;
  vendor: string;
  name: string;
  amount: number;
  lanes?: number;
  unitPrice?: number;
  discountPct?: number;
}

export interface MonthlyRow {
  monthIndex: number;
  label: string;
  newLanes: Record<string, number>;
  existingLanes: Record<string, number>;
  existingCost: number;
  newCost: number;
  baselineCost: number;
  savings: number;
  cumulativeSavings: number;
  existingBreakdown: CostLineItem[];
  newBreakdown: CostLineItem[];
}

export interface Timeline {
  rows: MonthlyRow[];
  baselineCostPerMonth: number;
  totalExisting: number;
  totalNew: number;
  totalBaseline: number;
  totalSavings: number;
}
