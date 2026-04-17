import { useEffect, useRef, useState } from 'react';
import { useROIStore } from '../store/roiStore';
import type { Phase, PhaseMonthDelta, LaneTypeDef } from '../types/models';

const PHASE_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#ec4899',
  '#14b8a6', '#a855f7', '#f43f5e', '#eab308', '#0ea5e9',
  '#64748b',
];

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

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-5 h-5 rounded-full border border-white ring-1 ring-gray-300 shrink-0 hover:ring-gray-500"
        style={{ backgroundColor: value }}
        title="Change colour"
      />
      {open && (
        <div className="absolute left-0 top-7 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 grid grid-cols-6 gap-1.5">
          {PHASE_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => { onChange(c); setOpen(false); }}
              className={`w-5 h-5 rounded-full hover:scale-110 transition-transform ${c === value ? 'ring-2 ring-offset-1 ring-gray-700' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface PhaseHeaderProps {
  phase: Phase;
  totalByType: { lt: LaneTypeDef; total: number }[];
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onDelete: () => void;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
}

function PhaseHeader({ phase, totalByType, onRename, onRecolor, onDelete, onMoveUp, onMoveDown }: PhaseHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(phase.name);

  useEffect(() => { setDraft(phase.name); }, [phase.name]);

  function commit() {
    const next = draft.trim();
    if (next && next !== phase.name) onRename(next);
    else setDraft(phase.name);
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ borderLeft: `4px solid ${phase.color}` }}>
      <ColorPicker value={phase.color} onChange={onRecolor} />

      {editing ? (
        <input
          className="flex-shrink-0 font-semibold text-gray-900 bg-white border border-indigo-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(phase.name); setEditing(false); }
          }}
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="font-semibold text-gray-900 hover:text-indigo-700 hover:underline decoration-dotted underline-offset-2"
          title="Click to rename"
        >
          {phase.name}
        </button>
      )}

      <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
        {totalByType.length > 0
          ? (
            <div className="flex items-center gap-2">
              {totalByType.map(({ lt, total }) => (
                <span key={lt.id}>{total.toLocaleString()} {lt.name}</span>
              ))}
              <span className="text-gray-400">migrated</span>
            </div>
          )
          : <span className="italic text-gray-400">no lanes migrated</span>
        }

        <div className="flex items-center border border-gray-200 rounded-md">
          <button
            onClick={() => onMoveUp?.()}
            disabled={!onMoveUp}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move up"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 13l4-4 4 4" /></svg>
          </button>
          <button
            onClick={() => onMoveDown?.()}
            disabled={!onMoveDown}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed border-l border-gray-200"
            title="Move down"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 7l4 4 4-4" /></svg>
          </button>
        </div>

        <button
          onClick={onDelete}
          className="p-1.5 text-gray-400 hover:text-red-600 rounded"
          title="Delete phase"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M4 7h16M10 7V4a1 1 0 011-1h2a1 1 0 011 1v3" /></svg>
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
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onDelete: () => void;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  onAddDelta: (delta: PhaseMonthDelta) => void;
  onDeleteDelta: (monthIndex: number) => void;
  onUpdateDelta: (monthIndex: number, updates: Partial<PhaseMonthDelta>) => void;
}

function PhaseCard({
  phase, startDate, durationMonths, laneTypes,
  onRename, onRecolor, onDelete, onMoveUp, onMoveDown,
  onAddDelta, onDeleteDelta, onUpdateDelta,
}: PhaseCardProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const totalByType = laneTypes.map((lt) => ({
    lt,
    total: phase.monthDeltas.reduce((s, d) => s + (d.laneDeltas.find((x) => x.laneTypeId === lt.id)?.added ?? 0), 0),
  })).filter((x) => x.total > 0);

  function handleDelete() {
    if (phase.monthDeltas.length > 0) {
      const ok = confirm(`Delete phase "${phase.name}"? It has ${phase.monthDeltas.length} migration event(s) which will also be removed.`);
      if (!ok) return;
    }
    onDelete();
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <PhaseHeader
        phase={phase}
        totalByType={totalByType}
        onRename={onRename}
        onRecolor={onRecolor}
        onDelete={handleDelete}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />

      <div className="px-4 py-3 space-y-2">
        {phase.monthDeltas.length === 0 && !showForm && (
          <p className="text-sm text-gray-400 italic">No migration events yet</p>
        )}

        {phase.monthDeltas.map((delta) => (
          <div key={delta.monthIndex}>
            {editingIdx === delta.monthIndex ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
                  <select
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                    value={delta.monthIndex}
                    onChange={(e) => {
                      const nextMonth = parseInt(e.target.value);
                      if (nextMonth === delta.monthIndex) return;
                      onUpdateDelta(delta.monthIndex, { monthIndex: nextMonth });
                      setEditingIdx(nextMonth);
                    }}
                  >
                    {Array.from({ length: durationMonths }, (_, i) => (
                      <option key={i} value={i}>{monthLabel(startDate, i)}</option>
                    ))}
                  </select>
                </div>
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
                <select
                  className="text-sm font-medium text-gray-700 w-28 shrink-0 bg-transparent border border-transparent hover:border-gray-300 focus:border-indigo-400 focus:bg-white focus:outline-none rounded px-1.5 py-1 cursor-pointer"
                  value={delta.monthIndex}
                  onChange={(e) => {
                    const nextMonth = parseInt(e.target.value);
                    if (nextMonth !== delta.monthIndex) {
                      onUpdateDelta(delta.monthIndex, { monthIndex: nextMonth });
                    }
                  }}
                  title="Change migration month"
                >
                  {Array.from({ length: durationMonths }, (_, i) => (
                    <option key={i} value={i}>{monthLabel(startDate, i)}</option>
                  ))}
                </select>
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
  const {
    project,
    addPhase, updatePhase, deletePhase, reorderPhase,
    addPhaseMonthDelta, deletePhaseMonthDelta, updatePhaseMonthDelta,
  } = useROIStore();
  const laneTypes = project.config.laneTypes;
  const phases = project.phases;

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Migration Phases</h2>
        <p className="text-sm text-gray-500">
          Define when lanes migrate from the existing to the new platform. Click a phase name to rename it; use the colour swatch to change its colour on the chart.
        </p>
      </div>

      {laneTypes.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          No lane types defined. Go to <strong>Settings</strong> to add lane types before creating migration events.
        </div>
      )}

      {phases.map((phase, idx) => (
        <PhaseCard
          key={phase.id}
          phase={phase}
          startDate={project.config.startDate}
          durationMonths={project.config.durationMonths}
          laneTypes={laneTypes}
          onRename={(name) => updatePhase(phase.id, { name })}
          onRecolor={(color) => updatePhase(phase.id, { color })}
          onDelete={() => deletePhase(phase.id)}
          onMoveUp={idx > 0 ? () => reorderPhase(phase.id, idx - 1) : null}
          onMoveDown={idx < phases.length - 1 ? () => reorderPhase(phase.id, idx + 1) : null}
          onAddDelta={(delta) => addPhaseMonthDelta(phase.id, delta)}
          onDeleteDelta={(m) => deletePhaseMonthDelta(phase.id, m)}
          onUpdateDelta={(m, updates) => updatePhaseMonthDelta(phase.id, m, updates)}
        />
      ))}

      {phases.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">
          No phases yet — add one to start planning the migration.
        </div>
      )}

      <button
        onClick={() => addPhase()}
        className="w-full border-2 border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 rounded-xl p-3 text-sm text-gray-500 hover:text-indigo-700 transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add phase
      </button>
    </div>
  );
}
