import { useState } from 'react';
import { useROIStore } from '../store/roiStore';
import type { Phase, PhaseMonthDelta, LaneTypeDef } from '../types/models';

function monthLabel(startDate: string, idx: number): string {
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + idx);
  return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

interface DeltaFormProps {
  startDate: string;
  durationMonths: number;
  laneTypes: LaneTypeDef[];
  onAdd: (delta: PhaseMonthDelta) => void;
  onCancel: () => void;
}

function DeltaForm({ startDate, durationMonths, laneTypes, onAdd, onCancel }: DeltaFormProps) {
  const [monthIndex, setMonthIndex] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});

  function setCount(id: string, val: number) {
    setCounts((prev) => ({ ...prev, [id]: val }));
  }

  function handleAdd() {
    const laneDeltas = laneTypes
      .filter((lt) => (counts[lt.id] ?? 0) > 0)
      .map((lt) => ({ laneTypeId: lt.id, added: counts[lt.id] }));
    onAdd({ monthIndex, laneDeltas });
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
        <select
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          value={monthIndex}
          onChange={(e) => setMonthIndex(parseInt(e.target.value))}
        >
          {Array.from({ length: durationMonths }, (_, i) => (
            <option key={i} value={i}>{monthLabel(startDate, i)}</option>
          ))}
        </select>
      </div>

      {laneTypes.length === 0 ? (
        <p className="text-xs text-amber-600">Add lane types in Settings before creating migration events.</p>
      ) : (
        <div className={`grid gap-3 grid-cols-${Math.min(laneTypes.length, 3)}`}>
          {laneTypes.map((lt) => (
            <div key={lt.id}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{lt.name} lanes added</label>
              <input
                type="number"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                value={counts[lt.id] ?? 0}
                onChange={(e) => setCount(lt.id, parseInt(e.target.value) || 0)}
                min={0}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-100">Cancel</button>
        <button
          onClick={handleAdd}
          disabled={laneTypes.length === 0}
          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          Add Migration Event
        </button>
      </div>
    </div>
  );
}

interface PhaseCardProps {
  phase: Phase;
  startDate: string;
  durationMonths: number;
  laneTypes: LaneTypeDef[];
  onAddDelta: (delta: PhaseMonthDelta) => void;
  onDeleteDelta: (monthIndex: number) => void;
  onUpdateDelta: (monthIndex: number, updates: Partial<PhaseMonthDelta>) => void;
}

function PhaseCard({ phase, startDate, durationMonths, laneTypes, onAddDelta, onDeleteDelta, onUpdateDelta }: PhaseCardProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const totalByType = laneTypes.map((lt) => ({
    lt,
    total: phase.monthDeltas.reduce((s, d) => s + (d.laneDeltas.find((x) => x.laneTypeId === lt.id)?.added ?? 0), 0),
  })).filter((x) => x.total > 0);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderLeft: `4px solid ${phase.color}` }}>
        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: phase.color }} />
        <h3 className="font-semibold text-gray-900">{phase.name}</h3>
        <span className="text-xs text-gray-500 capitalize">{phase.type}</span>
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          {totalByType.length > 0
            ? totalByType.map(({ lt, total }) => (
                <span key={lt.id}>{total.toLocaleString()} {lt.name}</span>
              ))
            : <span>no lanes migrated</span>
          }
          {totalByType.length > 0 && <span>migrated total</span>}
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {phase.monthDeltas.length === 0 && !showForm && (
          <p className="text-sm text-gray-400 italic">No migration events yet</p>
        )}

        {phase.monthDeltas.map((delta) => (
          <div key={delta.monthIndex}>
            {editingIdx === delta.monthIndex ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
                <div className={`grid gap-3 grid-cols-${Math.min(laneTypes.length, 3)}`}>
                  {laneTypes.map((lt) => {
                    const existing = delta.laneDeltas.find((x) => x.laneTypeId === lt.id);
                    return (
                      <div key={lt.id}>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{lt.name} lanes added</label>
                        <input
                          type="number"
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                          defaultValue={existing?.added ?? 0}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const newLaneDeltas = delta.laneDeltas.filter((x) => x.laneTypeId !== lt.id);
                            if (val > 0) newLaneDeltas.push({ laneTypeId: lt.id, added: val });
                            onUpdateDelta(delta.monthIndex, { laneDeltas: newLaneDeltas });
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => setEditingIdx(null)} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700">Done</button>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg">
                <div className="text-sm font-medium text-gray-700 w-24 shrink-0">
                  {monthLabel(startDate, delta.monthIndex)}
                </div>
                <div className="flex gap-3 text-sm text-gray-600 flex-1 flex-wrap">
                  {delta.laneDeltas.length === 0
                    ? <span className="text-gray-400">No lanes</span>
                    : delta.laneDeltas.map((ld) => {
                        const lt = laneTypes.find((x) => x.id === ld.laneTypeId);
                        return (
                          <span key={ld.laneTypeId} className="text-blue-700">
                            +{ld.added.toLocaleString()} {lt?.name ?? ld.laneTypeId}
                          </span>
                        );
                      })
                  }
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditingIdx(delta.monthIndex)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button onClick={() => onDeleteDelta(delta.monthIndex)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {showForm ? (
          <DeltaForm
            startDate={startDate}
            durationMonths={durationMonths}
            laneTypes={laneTypes}
            onAdd={(delta) => { onAddDelta(delta); setShowForm(false); }}
            onCancel={() => setShowForm(false)}
          />
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 mt-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add migration event
          </button>
        )}
      </div>
    </div>
  );
}

export function PhasesPage() {
  const { project, addPhaseMonthDelta, deletePhaseMonthDelta, updatePhaseMonthDelta } = useROIStore();
  const laneTypes = project.config.laneTypes;

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Migration Phases</h2>
        <p className="text-sm text-gray-500">
          Define when lanes migrate from the existing to the new platform. Add migration events per phase — the timeline engine accumulates these to compute running costs.
        </p>
      </div>

      {laneTypes.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          No lane types defined. Go to <strong>Settings</strong> to add lane types before creating migration events.
        </div>
      )}

      {project.phases.map((phase) => (
        <PhaseCard
          key={phase.id}
          phase={phase}
          startDate={project.config.startDate}
          durationMonths={project.config.durationMonths}
          laneTypes={laneTypes}
          onAddDelta={(delta) => addPhaseMonthDelta(phase.id, delta)}
          onDeleteDelta={(m) => deletePhaseMonthDelta(phase.id, m)}
          onUpdateDelta={(m, updates) => updatePhaseMonthDelta(phase.id, m, updates)}
        />
      ))}
    </div>
  );
}
