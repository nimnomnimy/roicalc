import { useMemo, useState, Fragment } from 'react';
import { useROIStore } from '../store/roiStore';
import { computeTimeline } from '../engine/timelineEngine';
import { formatCurrency } from '../utils/format';
import type { MonthlyRow, CostLineItem } from '../types/models';

type DrillPlatform = 'existing' | 'new';
interface DrillTarget { monthIndex: number; platform: DrillPlatform }

function BreakdownPanel({
  row,
  platform,
  onClose,
}: {
  row: MonthlyRow;
  platform: DrillPlatform;
  onClose: () => void;
}) {
  const items: CostLineItem[] = platform === 'existing' ? row.existingBreakdown : row.newBreakdown;
  const total = platform === 'existing' ? row.existingCost : row.newCost;
  const color = platform === 'existing' ? 'red' : 'blue';
  const laneColCount = 6;

  return (
    <tr>
      <td colSpan={6} className="px-0 py-0">
        <div className={`mx-4 mb-3 border rounded-xl overflow-hidden border-${color}-100`}>
          <div className={`flex items-center justify-between px-4 py-2 bg-${color}-50 border-b border-${color}-100`}>
            <div className="text-sm font-semibold text-gray-800">
              {platform === 'existing' ? 'Existing' : 'New'} platform breakdown — {row.label}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs">Vendor</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs">Item</th>
                <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">Lanes</th>
                <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">Unit Price<br/><span className="text-gray-400 font-normal">mo / yr</span></th>
                <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">Discount</th>
                <th className="text-right px-4 py-2 font-medium text-gray-500 text-xs">Amount<br/><span className="text-gray-400 font-normal">mo / yr</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 bg-white">
              {items.length === 0 && (
                <tr>
                  <td colSpan={laneColCount} className="px-4 py-3 text-gray-400 text-xs italic text-center">No costs this month</td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.itemId} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-600">{item.vendor}</td>
                  <td className="px-4 py-2 text-gray-800 font-medium">{item.name}</td>
                  <td className="px-4 py-2 text-right text-gray-500">
                    {item.lanes != null ? item.lanes.toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {item.unitPrice != null ? (
                      <div className="leading-tight">
                        <div className="text-gray-600">{formatCurrency(item.unitPrice)}</div>
                        <div className="text-xs text-gray-400">{formatCurrency(item.unitPrice * 12)}/yr</div>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {item.discountPct ? (
                      <span className="text-green-600 font-medium">{item.discountPct}%</span>
                    ) : '—'}
                  </td>
                  <td className={`px-4 py-2 text-right text-${color}-600`}>
                    <div className="leading-tight">
                      <div className="font-medium">{formatCurrency(item.amount)}</div>
                      <div className={`text-xs text-${color}-400`}>{formatCurrency(item.amount * 12)}/yr</div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={`border-t border-${color}-100 bg-${color}-50`}>
                <td colSpan={5} className="px-4 py-2 text-sm font-semibold text-gray-700">Total</td>
                <td className={`px-4 py-2 text-right text-${color}-700`}>
                  <div className="leading-tight">
                    <div className="font-bold">{formatCurrency(total)}</div>
                    <div className={`text-xs text-${color}-500 font-normal`}>{formatCurrency(total * 12)}/yr</div>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </td>
    </tr>
  );
}

export function TablePage() {
  const { project } = useROIStore();
  const timeline = useMemo(() => computeTimeline(project), [project]);
  const [drill, setDrill] = useState<DrillTarget | null>(null);
  const laneTypes = project.config.laneTypes;

  function toggleDrill(monthIndex: number, platform: DrillPlatform) {
    if (drill?.monthIndex === monthIndex && drill.platform === platform) {
      setDrill(null);
    } else {
      setDrill({ monthIndex, platform });
    }
  }

  // colSpan for totals row: Month + lane columns (2 per type) + cost columns
  const laneColSpan = laneTypes.length * 2;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Monthly Breakdown</h2>
        <p className="text-sm text-gray-400">Click any cost cell to see the line-item breakdown</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Month</th>
              {laneTypes.map((lt) => (
                <Fragment key={lt.id}>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs whitespace-nowrap">
                    Exist. {lt.name}
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs whitespace-nowrap">
                    New {lt.name}
                  </th>
                </Fragment>
              ))}
              <th className="text-right px-4 py-3 font-medium text-red-500 whitespace-nowrap">
                Existing Cost <span className="text-gray-400 font-normal text-xs">↗ click</span>
              </th>
              <th className="text-right px-4 py-3 font-medium text-blue-500 whitespace-nowrap">
                New Cost <span className="text-gray-400 font-normal text-xs">↗ click</span>
              </th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs whitespace-nowrap">Baseline</th>
              <th className="text-right px-4 py-3 font-medium text-green-600 whitespace-nowrap">Savings</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Cumulative</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {timeline.rows.map((row) => (
              <Fragment key={row.monthIndex}>
                <tr
                  className={`hover:bg-gray-50 ${drill?.monthIndex === row.monthIndex ? 'bg-gray-50' : ''}`}
                >
                  <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">{row.label}</td>
                  {laneTypes.map((lt) => (
                    <Fragment key={lt.id}>
                      <td className="px-4 py-2.5 text-right text-gray-500 text-xs">
                        {(row.existingLanes[lt.id] ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 text-xs">
                        {(row.newLanes[lt.id] ?? 0).toLocaleString()}
                      </td>
                    </Fragment>
                  ))}

                  <td
                    className={`px-4 py-2.5 text-right cursor-pointer rounded transition-colors
                      ${drill?.monthIndex === row.monthIndex && drill.platform === 'existing'
                        ? 'bg-red-100 text-red-700 font-semibold'
                        : 'text-red-600 hover:bg-red-50'}`}
                    onClick={() => toggleDrill(row.monthIndex, 'existing')}
                    title="Click to see breakdown"
                  >
                    {formatCurrency(row.existingCost)}
                  </td>

                  <td
                    className={`px-4 py-2.5 text-right cursor-pointer rounded transition-colors
                      ${drill?.monthIndex === row.monthIndex && drill.platform === 'new'
                        ? 'bg-blue-100 text-blue-700 font-semibold'
                        : 'text-blue-600 hover:bg-blue-50'}`}
                    onClick={() => toggleDrill(row.monthIndex, 'new')}
                    title="Click to see breakdown"
                  >
                    {formatCurrency(row.newCost)}
                  </td>

                  <td className="px-4 py-2.5 text-right text-gray-400 text-xs">
                    {formatCurrency(row.baselineCost)}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-medium ${row.savings >= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                    {row.savings >= 0 ? '+' : ''}{formatCurrency(row.savings)}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-medium ${row.cumulativeSavings >= 0 ? 'text-green-700' : 'text-amber-700'}`}>
                    {row.cumulativeSavings >= 0 ? '+' : ''}{formatCurrency(row.cumulativeSavings)}
                  </td>
                </tr>

                {drill?.monthIndex === row.monthIndex && (
                  <BreakdownPanel
                    row={row}
                    platform={drill.platform}
                    onClose={() => setDrill(null)}
                  />
                )}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
              <td className="px-4 py-3 text-gray-800">Total</td>
              {laneColSpan > 0 && <td colSpan={laneColSpan} />}
              <td className="px-4 py-3 text-right text-red-700">{formatCurrency(timeline.totalExisting)}</td>
              <td className="px-4 py-3 text-right text-blue-700">{formatCurrency(timeline.totalNew)}</td>
              <td className="px-4 py-3 text-right text-gray-400 text-sm">{formatCurrency(timeline.totalBaseline)}</td>
              <td className={`px-4 py-3 text-right ${timeline.totalSavings >= 0 ? 'text-green-700' : 'text-amber-700'}`}>
                {timeline.totalSavings >= 0 ? '+' : ''}{formatCurrency(timeline.totalSavings)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
