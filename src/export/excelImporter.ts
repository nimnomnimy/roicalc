import * as XLSX from 'xlsx';
import type { ROIProject, CostItem, Phase, PhaseType, Platform, BillingCycle, LaneTypeDef } from '../types/models';
import { nanoid } from '../utils/nanoid';

function str(v: unknown): string { return v == null ? '' : String(v).trim(); }
function num(v: unknown): number { return typeof v === 'number' ? v : parseFloat(String(v)) || 0; }
function bool(v: unknown): boolean { return str(v).toLowerCase() === 'yes'; }

const PHASE_TYPES: Record<string, PhaseType> = {
  poc: 'poc', pilot: 'pilot', controlled: 'controlled', rollout: 'rollout',
};
const PHASE_COLORS: Record<PhaseType, string> = {
  poc: '#6366f1', pilot: '#f59e0b', controlled: '#10b981', rollout: '#3b82f6',
};
const PHASE_NAMES: Record<PhaseType, string> = {
  poc: 'Proof of Concept', pilot: 'Pilot', controlled: 'Controlled Deployment', rollout: 'Rollout',
};

export interface ImportResult {
  project: ROIProject;
  warnings: string[];
}

export function importFromExcel(file: File): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const warnings: string[] = [];

        // ── Summary sheet → config ─────────────────────────────────────────
        const wsSummary = wb.Sheets['Summary'];
        if (!wsSummary) throw new Error('Missing "Summary" sheet');
        const summary = XLSX.utils.sheet_to_json<string[]>(wsSummary, { header: 1 }) as unknown[][];

        const config = {
          name: str(summary[2]?.[1]) || 'Imported Project',
          startDate: str(summary[3]?.[1]) || '2026-01-01',
          durationMonths: num(summary[4]?.[1]) || 24,
          laneTypes: [] as LaneTypeDef[],
          totalLanes: {} as Record<string, number>,
        };
        if (typeof summary[3]?.[1] === 'number') {
          const d = XLSX.SSF.parse_date_code(summary[3][1] as number);
          config.startDate = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        }

        // ── Lane Types sheet ───────────────────────────────────────────────
        const wsLaneTypes = wb.Sheets['Lane Types'];
        if (wsLaneTypes) {
          const laneTypesRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsLaneTypes);
          for (const row of laneTypesRaw) {
            const name = str(row['Name']);
            const existingId = str(row['ID']);
            if (!name) continue;
            const id = existingId || nanoid();
            config.laneTypes.push({ id, name });
            config.totalLanes[id] = num(row['Total Lanes']);
          }
        } else {
          warnings.push('No "Lane Types" sheet found — lane types will be empty');
        }

        // Build a lookup: lane type name → id (for matching cost items)
        const laneNameToId = new Map<string, string>(config.laneTypes.map((lt) => [lt.name.toLowerCase(), lt.id]));

        // ── Cost Items sheet ───────────────────────────────────────────────
        const wsCosts = wb.Sheets['Cost Items'];
        if (!wsCosts) throw new Error('Missing "Cost Items" sheet');
        const costsRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsCosts);

        const costItems: CostItem[] = costsRaw.map((row, i) => {
          const platformStr = str(row['Platform']).toLowerCase();
          const platform: Platform = platformStr === 'new' ? 'new' : 'existing';
          const costType = str(row['Cost Type']) === 'per-lane' ? 'per-lane' : 'flat';
          const billing: BillingCycle = str(row['Billing']) === 'annual' ? 'annual' : 'monthly';
          const discountPct = Math.min(100, Math.max(0, num(row['Discount %'] ?? 0)));
          const oneOff = bool(row['One-off']);
          const laneTypeName = str(row['Lane Type']).toLowerCase();
          const laneTypeId = laneNameToId.get(laneTypeName);

          if (!str(row['Vendor']) || !str(row['Item'])) {
            warnings.push(`Cost Items row ${i + 2}: missing Vendor or Item — skipped`);
            return null;
          }

          if (costType === 'per-lane' && laneTypeName && laneTypeName !== 'n/a' && !laneTypeId) {
            warnings.push(`Cost Items row ${i + 2}: lane type "${laneTypeName}" not found in Lane Types sheet`);
          }

          return {
            id: nanoid(),
            platform,
            vendor: str(row['Vendor']),
            name: str(row['Item']),
            costType,
            laneTypeId: costType === 'per-lane' ? laneTypeId : undefined,
            unitPrice: num(row['Unit Price']),
            billing,
            discountPct: discountPct > 0 ? discountPct : undefined,
            oneOff,
            oneOffMonth: oneOff ? num(row['One-off Month']) : undefined,
            enabled: str(row['Enabled']).toLowerCase() !== 'no',
          } satisfies CostItem;
        }).filter(Boolean) as CostItem[];

        // ── Phases sheet ───────────────────────────────────────────────────
        const wsPhases = wb.Sheets['Phases'];
        if (!wsPhases) throw new Error('Missing "Phases" sheet');
        const phasesRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsPhases);

        const phaseMap = new Map<PhaseType, Phase>();
        const phaseOrder: PhaseType[] = [];

        for (const row of phasesRaw) {
          const typeStr = str(row['Type']).toLowerCase() as PhaseType;
          const phaseType = PHASE_TYPES[typeStr];
          if (!phaseType) {
            warnings.push(`Phases: unknown type "${typeStr}" — skipped`);
            continue;
          }
          if (!phaseMap.has(phaseType)) {
            phaseOrder.push(phaseType);
            phaseMap.set(phaseType, {
              id: nanoid(),
              type: phaseType,
              name: str(row['Phase']) || PHASE_NAMES[phaseType],
              color: PHASE_COLORS[phaseType],
              monthDeltas: [],
            });
          }
          const phase = phaseMap.get(phaseType)!;
          const monthIndex = num(row['Month Index']);

          // Build laneDeltas from dynamic lane type columns
          const laneDeltas: { laneTypeId: string; added: number }[] = [];
          for (const lt of config.laneTypes) {
            const colName = `${lt.name} Added`;
            const added = num(row[colName] ?? 0);
            if (added > 0) laneDeltas.push({ laneTypeId: lt.id, added });
          }

          if (laneDeltas.length > 0) {
            const existing = phase.monthDeltas.find(d => d.monthIndex === monthIndex);
            if (existing) {
              for (const ld of laneDeltas) {
                const found = existing.laneDeltas.find((x) => x.laneTypeId === ld.laneTypeId);
                if (found) found.added += ld.added;
                else existing.laneDeltas.push({ ...ld });
              }
            } else {
              phase.monthDeltas.push({ monthIndex, laneDeltas });
            }
          }
        }

        const allTypes: PhaseType[] = ['poc', 'pilot', 'controlled', 'rollout'];
        for (const t of allTypes) {
          if (!phaseMap.has(t)) {
            phaseMap.set(t, { id: nanoid(), type: t, name: PHASE_NAMES[t], color: PHASE_COLORS[t], monthDeltas: [] });
            phaseOrder.push(t);
          }
        }
        const phases = allTypes.map(t => phaseMap.get(t)!);
        for (const phase of phases) {
          phase.monthDeltas.sort((a, b) => a.monthIndex - b.monthIndex);
        }

        resolve({
          project: { config, costItems, phases },
          warnings,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}
