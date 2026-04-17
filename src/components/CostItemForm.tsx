import { useState } from 'react';
import type { CostItem, Platform, BillingCycle } from '../types/models';
import { useROIStore } from '../store/roiStore';
import { formatCurrency } from '../utils/format';

interface Props {
  platform: Platform;
  onSave: (item: Omit<CostItem, 'id'>) => void;
  onCancel: () => void;
  initial?: CostItem;
}

const EMPTY: Omit<CostItem, 'id'> = {
  platform: 'existing',
  vendor: '',
  name: '',
  costType: 'flat',
  laneTypeId: undefined,
  unitPrice: 0,
  billing: 'monthly',
  oneOff: false,
  oneOffMonth: 0,
  discountPct: 0,
  enabled: true,
};

export function CostItemForm({ platform, onSave, onCancel, initial }: Props) {
  const { project } = useROIStore();
  const laneTypes = project.config.laneTypes;
  const [form, setForm] = useState<Omit<CostItem, 'id'>>(
    initial ? { ...initial } : { ...EMPTY, platform, laneTypeId: laneTypes[0]?.id }
  );

  const set = (updates: Partial<typeof form>) => setForm((f) => ({ ...f, ...updates }));

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
          <input
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            value={form.vendor}
            onChange={(e) => set({ vendor: e.target.value })}
            placeholder="Vendor name"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Item Name</label>
          <input
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Cost item description"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Cost Type</label>
          <select
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            value={form.costType}
            onChange={(e) => set({ costType: e.target.value as 'flat' | 'per-lane' })}
          >
            <option value="flat">Flat</option>
            <option value="per-lane">Per Lane</option>
          </select>
        </div>

        {form.costType === 'per-lane' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Lane Type</label>
            {laneTypes.length === 0 ? (
              <p className="text-xs text-amber-600 mt-1">Add lane types in Settings first.</p>
            ) : (
              <select
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                value={form.laneTypeId ?? ''}
                onChange={(e) => set({ laneTypeId: e.target.value || undefined })}
              >
                <option value="">— select —</option>
                {laneTypes.map((lt) => (
                  <option key={lt.id} value={lt.id}>{lt.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {form.costType === 'per-lane' ? 'Price / Lane / Month' : 'Monthly Amount'}
          </label>
          <input
            type="number"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            value={form.unitPrice}
            onChange={(e) => set({ unitPrice: parseFloat(e.target.value) || 0 })}
            min={0}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 items-end">
        {form.platform === 'new' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Discount %</label>
            <div className="relative">
              <input
                type="number"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm pr-7"
                value={form.discountPct ?? 0}
                onChange={(e) => set({ discountPct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                min={0}
                max={100}
                step={0.5}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
            </div>
            {(form.discountPct ?? 0) > 0 && (
              <p className="text-xs text-green-600 mt-0.5">
                Effective: {form.billing === 'annual'
                  ? formatCurrency(form.unitPrice / 12 * (1 - (form.discountPct ?? 0) / 100))
                  : formatCurrency(form.unitPrice * (1 - (form.discountPct ?? 0) / 100))}/mo
              </p>
            )}
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Billing</label>
          <select
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            value={form.billing}
            onChange={(e) => set({ billing: e.target.value as BillingCycle })}
          >
            <option value="monthly">Monthly</option>
            <option value="annual">Annual (÷12)</option>
          </select>
        </div>

        <div className="flex items-center gap-2 pt-4">
          <input
            type="checkbox"
            id="oneOff"
            checked={form.oneOff}
            onChange={(e) => set({ oneOff: e.target.checked })}
            className="rounded"
          />
          <label htmlFor="oneOff" className="text-sm text-gray-700">One-off cost</label>
        </div>

        {form.oneOff && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Month # (0 = first)</label>
            <input
              type="number"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              value={form.oneOffMonth ?? 0}
              onChange={(e) => set({ oneOffMonth: parseInt(e.target.value) || 0 })}
              min={0}
            />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            if (!form.name || !form.vendor) return;
            onSave(form);
          }}
          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          {initial ? 'Save Changes' : 'Add Item'}
        </button>
      </div>
    </div>
  );
}
