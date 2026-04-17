import { useState } from 'react';
import { useROIStore } from '../store/roiStore';
import { CostItemRow } from '../components/CostItemRow';
import { CostItemForm } from '../components/CostItemForm';
import type { Platform } from '../types/models';

export function CostsPage() {
  const { project, addCostItem, updateCostItem, deleteCostItem } = useROIStore();
  const [adding, setAdding] = useState<Platform | null>(null);

  const existing = project.costItems.filter((c) => c.platform === 'existing');
  const newPlatform = project.costItems.filter((c) => c.platform === 'new');

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      {/* Existing Platform */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Existing Platform Costs</h2>
            <p className="text-sm text-gray-500">Costs that reduce as lanes migrate to the new platform</p>
          </div>
          <button
            onClick={() => setAdding('existing')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Cost
          </button>
        </div>

        <div className="space-y-2">
          {existing.length === 0 && adding !== 'existing' && (
            <p className="text-sm text-gray-400 italic py-4 text-center border border-dashed border-gray-200 rounded-lg">
              No existing platform costs yet
            </p>
          )}
          {existing.map((item) => (
            <CostItemRow
              key={item.id}
              item={item}
              onUpdate={(updates) => updateCostItem(item.id, updates)}
              onDelete={() => deleteCostItem(item.id)}
            />
          ))}
          {adding === 'existing' && (
            <CostItemForm
              platform="existing"
              onSave={(item) => { addCostItem(item); setAdding(null); }}
              onCancel={() => setAdding(null)}
            />
          )}
        </div>
      </section>

      {/* New Platform */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">New Platform Costs</h2>
            <p className="text-sm text-gray-500">Costs that increase as lanes migrate to the new platform</p>
          </div>
          <button
            onClick={() => setAdding('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Cost
          </button>
        </div>

        <div className="space-y-2">
          {newPlatform.length === 0 && adding !== 'new' && (
            <p className="text-sm text-gray-400 italic py-4 text-center border border-dashed border-gray-200 rounded-lg">
              No new platform costs yet
            </p>
          )}
          {newPlatform.map((item) => (
            <CostItemRow
              key={item.id}
              item={item}
              onUpdate={(updates) => updateCostItem(item.id, updates)}
              onDelete={() => deleteCostItem(item.id)}
            />
          ))}
          {adding === 'new' && (
            <CostItemForm
              platform="new"
              onSave={(item) => { addCostItem(item); setAdding(null); }}
              onCancel={() => setAdding(null)}
            />
          )}
        </div>
      </section>
    </div>
  );
}
