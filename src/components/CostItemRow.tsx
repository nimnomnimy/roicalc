import { useState } from 'react';
import type { CostItem } from '../types/models';
import { useROIStore } from '../store/roiStore';
import { CostItemForm } from './CostItemForm';
import { formatCurrency } from '../utils/format';

interface Props {
  item: CostItem;
  onUpdate: (updates: Partial<CostItem>) => void;
  onDelete: () => void;
}

export function CostItemRow({ item, onUpdate, onDelete }: Props) {
  const { project } = useROIStore();
  const laneTypes = project.config.laneTypes;
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <CostItemForm
        platform={item.platform}
        initial={item}
        onSave={(updates) => {
          onUpdate(updates);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const priceLabel = item.billing === 'annual'
    ? `${formatCurrency(item.unitPrice)}/yr`
    : `${formatCurrency(item.unitPrice)}/mo`;

  const laneName = item.laneTypeId
    ? (laneTypes.find((lt) => lt.id === item.laneTypeId)?.name ?? item.laneTypeId)
    : '—';

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${item.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
      <input
        type="checkbox"
        checked={item.enabled}
        onChange={(e) => onUpdate({ enabled: e.target.checked })}
        className="shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">{item.vendor} — {item.name}</span>
          {item.oneOff && (
            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">one-off</span>
          )}
          {(item.discountPct ?? 0) > 0 && (
            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{item.discountPct}% off</span>
          )}
        </div>
        <div className="flex gap-3 mt-0.5 text-xs text-gray-500">
          <span>{item.costType === 'per-lane' ? `${laneName} × ${priceLabel}` : `flat ${priceLabel}`}</span>
          {(item.discountPct ?? 0) > 0 && (
            <span className="text-green-600">
              → {formatCurrency(
                (item.billing === 'annual' ? item.unitPrice / 12 : item.unitPrice) * (1 - (item.discountPct ?? 0) / 100)
              )}/mo after discount
            </span>
          )}
          {item.billing === 'annual' && !(item.discountPct ?? 0) && (
            <span className="text-gray-400">(≈ {formatCurrency(item.unitPrice / 12)}/mo)</span>
          )}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          onClick={() => setEditing(true)}
          className="p-1.5 text-gray-400 hover:text-indigo-600 rounded"
          title="Edit"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-gray-400 hover:text-red-600 rounded"
          title="Delete"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
    </div>
  );
}
