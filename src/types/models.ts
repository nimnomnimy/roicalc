export type Platform = 'existing' | 'new';
export type BillingCycle = 'monthly' | 'annual';

export interface LaneTypeDef {
  id: string;
  name: string;
}

export interface CostItem {
  id: string;
  platform: Platform;
  vendor: string;
  name: string;
  costType: 'per-lane' | 'flat';
  laneTypeId?: string; // id of LaneTypeDef; only when costType === 'per-lane'
  unitPrice: number;
  billing: BillingCycle;
  oneOff: boolean;
  oneOffMonth?: number;
  discountPct?: number;
  enabled: boolean;
}

export type PhaseType = 'poc' | 'pilot' | 'controlled' | 'rollout';

export interface PhaseMonthDelta {
  monthIndex: number;
  laneDeltas: { laneTypeId: string; added: number }[];
}

export interface Phase {
  id: string;
  type: PhaseType;
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
