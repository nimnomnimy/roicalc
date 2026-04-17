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
  updatePhase: (id: string, updates: Partial<Omit<Phase, 'id' | 'monthDeltas'>>) => void;
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

      updatePhase: (id, updates) =>
        set((s) => {
          const phase = s.project.phases.find((p: Phase) => p.id === id);
          if (phase) Object.assign(phase, updates);
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
          const delta = phase.monthDeltas.find((d: PhaseMonthDelta) => d.monthIndex === monthIndex);
          if (delta) Object.assign(delta, updates);
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
    { name: 'roi-planner-v1' }
  )
);
