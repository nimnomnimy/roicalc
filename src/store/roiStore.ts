import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { ROIProject, CostItem, Phase, PhaseMonthDelta, ProjectConfig } from '../types/models';
import { nanoid } from '../utils/nanoid';

const DEFAULT_PROJECT: ROIProject = {
  config: {
    name: 'Software Transformation ROI',
    startDate: '2026-06-01',
    durationMonths: 24,
    totalPosLanes: 6000,
    totalScoLanes: 11468,
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
  // Cost items
  addCostItem: (item: Omit<CostItem, 'id'>) => void;
  updateCostItem: (id: string, updates: Partial<CostItem>) => void;
  deleteCostItem: (id: string) => void;
  // Phases
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
        set((s) => {
          Object.assign(s.project.config, config);
        }),

      addCostItem: (item) =>
        set((s) => {
          s.project.costItems.push({ ...item, id: nanoid() });
        }),

      updateCostItem: (id, updates) =>
        set((s) => {
          const idx = s.project.costItems.findIndex((c) => c.id === id);
          if (idx !== -1) Object.assign(s.project.costItems[idx], updates);
        }),

      deleteCostItem: (id) =>
        set((s) => {
          s.project.costItems = s.project.costItems.filter((c) => c.id !== id);
        }),

      updatePhase: (id, updates) =>
        set((s) => {
          const phase = s.project.phases.find((p) => p.id === id);
          if (phase) Object.assign(phase, updates);
        }),

      addPhaseMonthDelta: (phaseId, delta) =>
        set((s) => {
          const phase = s.project.phases.find((p) => p.id === phaseId);
          if (!phase) return;
          const existing = phase.monthDeltas.find((d) => d.monthIndex === delta.monthIndex);
          if (existing) {
            existing.posLanesAdded += delta.posLanesAdded;
            existing.scoLanesAdded += delta.scoLanesAdded;
          } else {
            phase.monthDeltas.push(delta);
            phase.monthDeltas.sort((a, b) => a.monthIndex - b.monthIndex);
          }
        }),

      updatePhaseMonthDelta: (phaseId, monthIndex, updates) =>
        set((s) => {
          const phase = s.project.phases.find((p) => p.id === phaseId);
          if (!phase) return;
          const delta = phase.monthDeltas.find((d) => d.monthIndex === monthIndex);
          if (delta) Object.assign(delta, updates);
        }),

      deletePhaseMonthDelta: (phaseId, monthIndex) =>
        set((s) => {
          const phase = s.project.phases.find((p) => p.id === phaseId);
          if (phase) phase.monthDeltas = phase.monthDeltas.filter((d) => d.monthIndex !== monthIndex);
        }),

      resetProject: () =>
        set((s) => {
          s.project = DEFAULT_PROJECT;
        }),

      importProject: (project) =>
        set((s) => {
          s.project = project;
        }),
    })),
    { name: 'roi-planner-v1' }
  )
);
