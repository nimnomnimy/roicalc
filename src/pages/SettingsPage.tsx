import { useROIStore } from '../store/roiStore';

export function SettingsPage() {
  const { project, updateConfig, resetProject } = useROIStore();
  const { config } = project;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Project Settings</h2>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total POS Lanes</label>
            <input
              type="number"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={config.totalPosLanes}
              onChange={(e) => updateConfig({ totalPosLanes: parseInt(e.target.value) || 0 })}
              min={0}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total SCO Lanes</label>
            <input
              type="number"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={config.totalScoLanes}
              onChange={(e) => updateConfig({ totalScoLanes: parseInt(e.target.value) || 0 })}
              min={0}
            />
          </div>
        </div>
      </div>

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
