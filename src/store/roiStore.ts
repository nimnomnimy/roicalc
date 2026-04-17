import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { ROIProject, CostItem, Phase, PhaseMonthDelta, ProjectConfig, LaneTypeDef } from '../types/models';
import { nanoid } from '../utils/nanoid';

const DEFAULT_PROJECT: ROIProject = {
  config: {
    name: 'My ROI Project',
    startDate: '2026-01-01',
    durationMonths: 24,
    laneTypes: [],
    totalLanes: {},
    globalNewDiscountPct: 0,
    baseCurrency: 'AUD',
    audPerUsd: 1.5,
  },
  costItems: [],
  phases: [
    { id: nanoid(), type: 'poc', name: 'Proof of Concept', color: '#6366f1', monthDeltas: [] },
    { id: nanoid(), type: 'pilot', name: 'Pilot', color: '#f59e0b', monthDeltas: [] },
    { id: nanoid(), type: 'controlled', name: 'Controlled Deployment', color: '#10b981', monthDeltas: [] },
    { id: nanoid(), type: 'rollout', name: 'Rollout', color: '#3b82f6', monthDeltas: [] },
  ],
};

interface ROIStore {
  project: ROIProject;
  updateConfig: (config: Partial<ProjectConfig>) => void;
  addLaneType: (name: string) => string;
  updateLaneType: (id: string, name: string) => void;
  deleteLaneType: (id: string) => void;
  setTotalLanes: (laneTypeId: string, count: number) => void;
  addCostItem: (item: Omit<CostItem, 'id'>) => void;
  updateCostItem: (id: string, updates: Partial<CostItem>) => void;
  deleteCostItem: (id: string) => void;
  /** Reorder a cost item within its platform group by moving it to a new index among same-platform items. */
  reorderCostItem: (id: string, targetIndexInGroup: number) => void;
  addPhase: (name?: string, color?: string) => string;
  updatePhase: (id: string, updates: Partial<Omit<Phase, 'id' | 'monthDeltas'>>) => void;
  deletePhase: (id: string) => void;
  reorderPhase: (id: string, targetIndex: number) => void;
  addPhaseMonthDelta: (phaseId: string, delta: PhaseMonthDelta) => void;
  updatePhaseMonthDelta: (phaseId: string, monthIndex: number, updates: Partial<PhaseMonthDelta>) => void;
  deletePhaseMonthDelta: (phaseId: string, monthIndex: number) => void;
  resetProject: () => void;
  importProject: (project: ROIProject) => void;
}

export const useROIStore = create<ROIStore>()(
  persist(
    immer((set) => ({
      project: DEFAULT_PROJECT,

      updateConfig: (config) =>
        set((s) => { Object.assign(s.project.config, config); }),

      addLaneType: (name) => {
        const id = nanoid();
        set((s) => {
          s.project.config.laneTypes.push({ id, name });
          s.project.config.totalLanes[id] = 0;
        });
        return id;
      },

      updateLaneType: (id, name) =>
        set((s) => {
          const lt = s.project.config.laneTypes.find((l: LaneTypeDef) => l.id === id);
          if (lt) lt.name = name;
        }),

      deleteLaneType: (id) =>
        set((s) => {
          s.project.config.laneTypes = s.project.config.laneTypes.filter((l: LaneTypeDef) => l.id !== id);
          delete s.project.config.totalLanes[id];
          for (const item of s.project.costItems) {
            if (item.laneTypeId === id) item.laneTypeId = undefined;
          }
          for (const phase of s.project.phases) {
            for (const delta of phase.monthDeltas) {
              delta.laneDeltas = delta.laneDeltas.filter((ld) => ld.laneTypeId !== id);
            }
          }
        }),

      setTotalLanes: (laneTypeId, count) =>
        set((s) => { s.project.config.totalLanes[laneTypeId] = count; }),

      addCostItem: (item) =>
        set((s) => { s.project.costItems.push({ ...item, id: nanoid() }); }),

      updateCostItem: (id, updates) =>
        set((s) => {
          const idx = s.project.costItems.findIndex((c: CostItem) => c.id === id);
          if (idx !== -1) Object.assign(s.project.costItems[idx], updates);
        }),

      deleteCostItem: (id) =>
        set((s) => { s.project.costItems = s.project.costItems.filter((c: CostItem) => c.id !== id); }),

      reorderCostItem: (id, targetIndexInGroup) =>
        set((s) => {
          const items = s.project.costItems;
          const moving = items.find((c: CostItem) => c.id === id);
          if (!moving) return;
          const platform = moving.platform;
          // Positions (in the full list) of items in the same platform group.
          const groupPositions: number[] = [];
          items.forEach((c: CostItem, i: number) => { if (c.platform === platform) groupPositions.push(i); });
          const fromGroupIdx = groupPositions.findIndex((i) => items[i].id === id);
          const clampedTarget = Math.max(0, Math.min(targetIndexInGroup, groupPositions.length - 1));
          if (fromGroupIdx === clampedTarget) return;
          // Remove item from global list, then re-insert at the position corresponding to target group index.
          const fromFullIdx = groupPositions[fromGroupIdx];
          const [item] = items.splice(fromFullIdx, 1);
          // Recompute group positions after removal.
          const newGroupPositions: number[] = [];
          items.forEach((c: CostItem, i: number) => { if (c.platform === platform) newGroupPositions.push(i); });
          const insertAt = clampedTarget >= newGroupPositions.length
            ? (newGroupPositions.length === 0 ? items.length : newGroupPositions[newGroupPositions.length - 1] + 1)
            : newGroupPositions[clampedTarget];
          items.splice(insertAt, 0, item);
        }),

      addPhase: (name, color) => {
        const id = nanoid();
        const palette = ['#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#14b8a6', '#a855f7', '#f43f5e'];
        set((s) => {
          const chosenColor = color ?? palette[s.project.phases.length % palette.length];
          s.project.phases.push({
            id,
            type: 'custom',
            name: name?.trim() || `Phase ${s.project.phases.length + 1}`,
            color: chosenColor,
            monthDeltas: [],
          });
        });
        return id;
      },

      updatePhase: (id, updates) =>
        set((s) => {
          const phase = s.project.phases.find((p: Phase) => p.id === id);
          if (phase) Object.assign(phase, updates);
        }),

      deletePhase: (id) =>
        set((s) => { s.project.phases = s.project.phases.filter((p: Phase) => p.id !== id); }),

      reorderPhase: (id, targetIndex) =>
        set((s) => {
          const phases = s.project.phases;
          const from = phases.findIndex((p: Phase) => p.id === id);
          if (from === -1) return;
          const to = Math.max(0, Math.min(targetIndex, phases.length - 1));
          if (from === to) return;
          const [phase] = phases.splice(from, 1);
          phases.splice(to, 0, phase);
        }),

      addPhaseMonthDelta: (phaseId, delta) =>
        set((s) => {
          const phase = s.project.phases.find((p: Phase) => p.id === phaseId);
          if (!phase) return;
          const existing = phase.monthDeltas.find((d: PhaseMonthDelta) => d.monthIndex === delta.monthIndex);
          if (existing) {
            for (const ld of delta.laneDeltas) {
              const found = existing.laneDeltas.find((x) => x.laneTypeId === ld.laneTypeId);
              if (found) found.added += ld.added;
              else existing.laneDeltas.push({ ...ld });
            }
          } else {
            phase.monthDeltas.push(delta);
            phase.monthDeltas.sort((a: PhaseMonthDelta, b: PhaseMonthDelta) => a.monthIndex - b.monthIndex);
          }
        }),

      updatePhaseMonthDelta: (phaseId, monthIndex, updates) =>
        set((s) => {
          const phase = s.project.phases.find((p: Phase) => p.id === phaseId);
          if (!phase) return;
          const idx = phase.monthDeltas.findIndex((d: PhaseMonthDelta) => d.monthIndex === monthIndex);
          if (idx === -1) return;

          // Moving to a different month: merge with an existing delta at that month if present,
          // otherwise just change the index and re-sort so the list stays in chronological order.
          if (updates.monthIndex !== undefined && updates.monthIndex !== monthIndex) {
            const moving = phase.monthDeltas[idx];
            const laneDeltas = updates.laneDeltas ?? moving.laneDeltas;
            const collidingIdx = phase.monthDeltas.findIndex(
              (d: PhaseMonthDelta) => d.monthIndex === updates.monthIndex,
            );
            phase.monthDeltas.splice(idx, 1);
            if (collidingIdx !== -1) {
              // splice shifted indices — recompute
              const dstIdx = phase.monthDeltas.findIndex(
                (d: PhaseMonthDelta) => d.monthIndex === updates.monthIndex,
              );
              const dst = phase.monthDeltas[dstIdx];
              for (const ld of laneDeltas) {
                const found = dst.laneDeltas.find((x) => x.laneTypeId === ld.laneTypeId);
                if (found) found.added += ld.added;
                else dst.laneDeltas.push({ ...ld });
              }
            } else {
              phase.monthDeltas.push({ monthIndex: updates.monthIndex, laneDeltas });
            }
            phase.monthDeltas.sort((a: PhaseMonthDelta, b: PhaseMonthDelta) => a.monthIndex - b.monthIndex);
            return;
          }

          Object.assign(phase.monthDeltas[idx], updates);
        }),

      deletePhaseMonthDelta: (phaseId, monthIndex) =>
        set((s) => {
          const phase = s.project.phases.find((p: Phase) => p.id === phaseId);
          if (phase) phase.monthDeltas = phase.monthDeltas.filter((d: PhaseMonthDelta) => d.monthIndex !== monthIndex);
        }),

      resetProject: () =>
        set((s) => { s.project = DEFAULT_PROJECT; }),

      importProject: (project) =>
        set((s) => { s.project = project; }),
    })),
    {
      name: 'roi-planner-v1',
      merge: (persisted: unknown, current) => {
        // Migrate old shape (totalPosLanes/totalScoLanes) to new shape
        const p = persisted as Record<string, unknown>;
        if (!p || typeof p !== 'object') return current;
        const proj = p.project as Record<string, unknown> | undefined;
        if (!proj) return current;
        const cfg = proj.config as Record<string, unknown> | undefined;
        if (cfg && ('totalPosLanes' in cfg || !('laneTypes' in cfg))) {
          // Old format — reset to default to avoid crashes
          return current;
        }
        // Also migrate phases with old posLanesAdded/scoLanesAdded
        const phases = proj.phases as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(phases)) {
          for (const phase of phases) {
            const deltas = phase.monthDeltas as Array<Record<string, unknown>> | undefined;
            if (Array.isArray(deltas)) {
              for (const d of deltas) {
                if ('posLanesAdded' in d || 'scoLanesAdded' in d) {
                  return current;
                }
              }
            }
          }
        }
        // Fill in missing currency/discount fields on older persisted state
        if (cfg) {
          if (cfg.globalNewDiscountPct === undefined) cfg.globalNewDiscountPct = 0;
          if (cfg.baseCurrency === undefined) cfg.baseCurrency = 'AUD';
          if (cfg.audPerUsd === undefined) cfg.audPerUsd = 1.5;
        }
        return { ...current, ...(persisted as object) };
      },
    }
  )
);
