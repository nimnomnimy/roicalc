import { useState } from 'react';
import { useROIStore } from '../store/roiStore';

export function SettingsPage() {
  const { project, updateConfig, resetProject, addLaneType, updateLaneType, deleteLaneType, setTotalLanes } = useROIStore();
  const { config } = project;
  const [newLaneName, setNewLaneName] = useState('');
  const [editingLaneId, setEditingLaneId] = useState<string | null>(null);
  const [editingLaneName, setEditingLaneName] = useState('');

  function handleAddLane() {
    const name = newLaneName.trim();
    if (!name) return;
    addLaneType(name);
    setNewLaneName('');
  }

  function startEdit(id: string, name: string) {
    setEditingLaneId(id);
    setEditingLaneName(name);
  }

  function commitEdit(id: string) {
    const name = editingLaneName.trim();
    if (name) updateLaneType(id, name);
    setEditingLaneId(null);
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Project Settings</h2>

      {/* General */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">General</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={config.name}
            onChange={(e) => updateConfig({ name: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={config.startDate.slice(0, 10)}
              onChange={(e) => updateConfig({ startDate: e.target.value + 'T00:00:00' })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (months)</label>
            <input
              type="number"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={config.durationMonths}
              onChange={(e) => updateConfig({ durationMonths: parseInt(e.target.value) || 24 })}
              min={1}
              max={120}
            />
          </div>
        </div>
      </div>

      {/* Lane Types */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Lane Types</h3>
          <p className="text-xs text-gray-400 mt-0.5">Define the types of lanes in your project. These appear as options in cost items and phase migration events.</p>
        </div>

        {config.laneTypes.length === 0 && (
          <p className="text-sm text-gray-400 italic">No lane types defined yet. Add one below.</p>
        )}

        <div className="space-y-2">
          {config.laneTypes.map((lt) => (
            <div key={lt.id} className="flex items-center gap-3 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
              {editingLaneId === lt.id ? (
                <>
                  <input
                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                    value={editingLaneName}
                    onChange={(e) => setEditingLaneName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(lt.id); if (e.key === 'Escape') setEditingLaneId(null); }}
                    autoFocus
                  />
                  <button onClick={() => commitEdit(lt.id)} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">Save</button>
                  <button onClick={() => setEditingLaneId(null)} className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100">Cancel</button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-gray-800">{lt.name}</span>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Total lanes</label>
                    <input
                      type="number"
                      className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right"
                      value={config.totalLanes[lt.id] ?? 0}
                      onChange={(e) => setTotalLanes(lt.id, parseInt(e.target.value) || 0)}
                      min={0}
                    />
                  </div>
                  <button
                    onClick={() => startEdit(lt.id, lt.name)}
                    className="p-1.5 text-gray-400 hover:text-indigo-600 rounded"
                    title="Rename"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete lane type "${lt.name}"? This will remove it from all cost items and phase events.`)) {
                        deleteLaneType(lt.id);
                      }
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                    title="Delete"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="e.g. Checkout Lane, Self-Checkout, Kiosk…"
            value={newLaneName}
            onChange={(e) => setNewLaneName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddLane(); }}
          />
          <button
            onClick={handleAddLane}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            disabled={!newLaneName.trim()}
          >
            Add Lane Type
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="border border-red-200 rounded-xl p-5 bg-red-50">
        <h3 className="text-sm font-semibold text-red-800 mb-1">Danger Zone</h3>
        <p className="text-sm text-red-600 mb-3">Reset all data including cost items, phases, and settings.</p>
        <button
          onClick={() => {
            if (confirm('Reset all project data? This cannot be undone.')) resetProject();
          }}
          className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Reset Project
        </button>
      </div>
    </div>
  );
}
