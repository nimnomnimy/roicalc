export type Platform = 'existing' | 'new';
export type LaneType = 'POS' | 'SCO' | 'both';
export type BillingCycle = 'monthly' | 'annual';

export interface CostItem {
  id: string;
  platform: Platform;
  vendor: string;
  name: string;
  /** flat = same every month regardless of lanes */
  costType: 'per-lane' | 'flat';
  laneType?: LaneType; // only when costType === 'per-lane'
  unitPrice: number; // price per lane per month (or flat monthly amount)
  billing: BillingCycle; // annual gets divided by 12
  oneOff: boolean; // one-off cost, appears once at phase start month
  /** month index (0-based from project start) when one-off fires; ignored if !oneOff */
  oneOffMonth?: number;
  /** discount % applied to new platform items only, 0–100 */
  discountPct?: number;
  enabled: boolean;
}

export type PhaseType = 'poc' | 'pilot' | 'controlled' | 'rollout';

export interface PhaseMonthDelta {
  /** 0-based month offset from project start */
  monthIndex: number;
  posLanesAdded: number;
  scoLanesAdded: number;
}

export interface Phase {
  id: string;
  type: PhaseType;
  name: string;
  color: string;
  /** Ordered list of month events where lanes migrate to new platform */
  monthDeltas: PhaseMonthDelta[];
}

export interface ProjectConfig {
  name: string;
  /** ISO date string of the first month, e.g. "2026-06-01" */
  startDate: string;
  /** Total number of months in the project timeline */
  durationMonths: number;
  /** Total POS lanes at start (before any migration) */
  totalPosLanes: number;
  /** Total SCO lanes at start (before any migration) */
  totalScoLanes: number;
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
  /** e.g. "Jun 2026" */
  label: string;
  /** Lanes on new platform at start of this month */
  newPosLanes: number;
  newScoLanes: number;
  /** Remaining on old platform */
  existingPosLanes: number;
  existingScoLanes: number;
  existingCost: number;
  newCost: number;
  /** What existing costs would have been at full lanes with no migration (month 0 baseline) */
  baselineCost: number;
  /** baseline - (existing + new): positive = saving vs doing nothing */
  savings: number;
  /** Cumulative savings from month 0 */
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
