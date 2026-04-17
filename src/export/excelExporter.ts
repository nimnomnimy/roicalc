import * as XLSX from 'xlsx';
import type { ROIProject } from '../types/models';
import type { Timeline } from '../types/models';

function col(n: number): string {
  let s = '';
  n++;
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

export function exportToExcel(project: ROIProject, timeline: Timeline) {
  const wb = XLSX.utils.book_new();
  const { laneTypes, totalLanes } = project.config;

  // ── Sheet 1: Summary ───────────────────────────────────────────────────────
  const summaryData: (string | number)[][] = [
    ['ROI Analysis Summary'],
    [],
    ['Project', project.config.name],
    ['Start Date', project.config.startDate.slice(0, 10)],
    ['Duration (months)', project.config.durationMonths],
    ...laneTypes.map((lt) => [`Total ${lt.name} Lanes`, totalLanes[lt.id] ?? 0]),
    [],
    ['', 'Amount'],
    ['Baseline Cost (no change)', timeline.totalBaseline],
    ['Total Existing Platform Cost', timeline.totalExisting],
    ['Total New Platform Cost', timeline.totalNew],
    ['Total Combined Cost', timeline.totalExisting + timeline.totalNew],
    ['Net Savings vs Baseline', timeline.totalSavings],
    [],
    ['Phases'],
    ['Phase', 'Type', 'Migration Events', ...laneTypes.map((lt) => `Total ${lt.name} Migrated`)],
    ...project.phases.map(p => [
      p.name,
      p.type ?? 'custom',
      p.monthDeltas.length,
      ...laneTypes.map((lt) =>
        p.monthDeltas.reduce((s, d) => s + (d.laneDeltas.find((x) => x.laneTypeId === lt.id)?.added ?? 0), 0)
      ),
    ]),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  const summaryOffset = 6 + laneTypes.length; // rows before currency block
  const currencyRefs = [`B${summaryOffset}`, `B${summaryOffset + 1}`, `B${summaryOffset + 2}`, `B${summaryOffset + 3}`, `B${summaryOffset + 4}`];
  const currencyVals = [timeline.totalBaseline, timeline.totalExisting, timeline.totalNew, timeline.totalExisting + timeline.totalNew, timeline.totalSavings];
  currencyRefs.forEach((ref, i) => {
    if (wsSummary[ref]) wsSummary[ref].z = '$#,##0';
    else wsSummary[ref] = { v: currencyVals[i], t: 'n', z: '$#,##0' };
  });
  wsSummary['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // ── Sheet 2: Monthly Breakdown ─────────────────────────────────────────────
  const laneHeaders = laneTypes.flatMap((lt) => [`Existing ${lt.name}`, `New ${lt.name}`]);
  const monthlyHeaders = [
    'Month', ...laneHeaders,
    'Existing Cost', 'New Cost', 'Combined Cost', 'Baseline', 'Savings vs Baseline', 'Cumulative Savings',
  ];
  const laneCount = laneTypes.length * 2;
  const costStartCol = 1 + laneCount; // 0-based index of first cost column

  const monthlyRows = timeline.rows.map(r => [
    r.label,
    ...laneTypes.flatMap((lt) => [r.existingLanes[lt.id] ?? 0, r.newLanes[lt.id] ?? 0]),
    r.existingCost,
    r.newCost,
    r.existingCost + r.newCost,
    r.baselineCost,
    r.savings,
    r.cumulativeSavings,
  ]);
  const blankLanes = laneTypes.flatMap(() => ['', '']);
  monthlyRows.push([
    'TOTAL', ...blankLanes,
    timeline.totalExisting,
    timeline.totalNew,
    timeline.totalExisting + timeline.totalNew,
    timeline.totalBaseline,
    timeline.totalSavings,
    '',
  ]);

  const wsMonthly = XLSX.utils.aoa_to_sheet([monthlyHeaders, ...monthlyRows]);
  const currencyCols = [costStartCol, costStartCol + 1, costStartCol + 2, costStartCol + 3, costStartCol + 4, costStartCol + 5];
  for (let r = 1; r <= monthlyRows.length; r++) {
    for (const c of currencyCols) {
      const ref = `${col(c)}${r + 1}`;
      if (wsMonthly[ref] && typeof wsMonthly[ref].v === 'number') {
        wsMonthly[ref].z = '$#,##0';
      }
    }
  }
  const laneCols = laneTypes.flatMap(() => [{ wch: 14 }, { wch: 12 }]);
  wsMonthly['!cols'] = [{ wch: 12 }, ...laneCols, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Breakdown');

  // ── Sheet 3: Cost Items ────────────────────────────────────────────────────
  const baseCurrency = project.config.baseCurrency ?? 'AUD';
  const globalNewDiscountPct = project.config.globalNewDiscountPct ?? 0;
  const costsHeaders = [
    'Platform', 'Vendor', 'Item', 'Cost Type', 'Lane Type',
    'Unit Price', 'Currency', 'Billing', 'Discount %', 'Discount Source', 'One-off', 'One-off Month', 'Enabled',
  ];
  const costsRows = project.costItems.map(item => {
    const laneTypeName = item.laneTypeId
      ? (laneTypes.find((lt) => lt.id === item.laneTypeId)?.name ?? item.laneTypeId)
      : 'N/A';
    const hasOverride = item.discountPct !== undefined;
    const effectivePct = hasOverride
      ? (item.discountPct ?? 0)
      : (item.platform === 'new' ? globalNewDiscountPct : 0);
    const discountSource = hasOverride ? 'item' : (item.platform === 'new' && globalNewDiscountPct > 0 ? 'global' : '');
    return [
      item.platform === 'existing' ? 'Existing' : 'New',
      item.vendor,
      item.name,
      item.costType,
      laneTypeName,
      item.unitPrice,
      item.currency ?? baseCurrency,
      item.billing,
      effectivePct,
      discountSource,
      item.oneOff ? 'Yes' : 'No',
      item.oneOff ? (item.oneOffMonth ?? 0) : '',
      item.enabled ? 'Yes' : 'No',
    ];
  });
  const wsCosts = XLSX.utils.aoa_to_sheet([costsHeaders, ...costsRows]);
  for (let r = 1; r <= costsRows.length; r++) {
    const ref = `F${r + 1}`;
    if (wsCosts[ref] && typeof wsCosts[ref].v === 'number') wsCosts[ref].z = '$#,##0.00';
  }
  wsCosts['!cols'] = [
    { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 10 }, { wch: 16 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCosts, 'Cost Items');

  // ── Sheet 4: Lane Types ────────────────────────────────────────────────────
  const laneTypesRows: (string | number)[][] = [
    ['ID', 'Name', 'Total Lanes'],
    ...laneTypes.map((lt) => [lt.id, lt.name, totalLanes[lt.id] ?? 0]),
  ];
  const wsLaneTypes = XLSX.utils.aoa_to_sheet(laneTypesRows);
  wsLaneTypes['!cols'] = [{ wch: 24 }, { wch: 20 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsLaneTypes, 'Lane Types');

  // ── Sheet 5: Phases ────────────────────────────────────────────────────────
  const phaseHeaders = ['Phase', 'Type', 'Month Index', 'Month Label', ...laneTypes.map((lt) => `${lt.name} Added`)];
  const phasesRows: (string | number)[][] = [phaseHeaders];
  for (const phase of project.phases) {
    for (const delta of phase.monthDeltas) {
      const d = new Date(project.config.startDate);
      d.setMonth(d.getMonth() + delta.monthIndex);
      const label = d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
      phasesRows.push([
        phase.name, phase.type ?? 'custom', delta.monthIndex, label,
        ...laneTypes.map((lt) => delta.laneDeltas.find((x) => x.laneTypeId === lt.id)?.added ?? 0),
      ]);
    }
  }
  const wsPhases = XLSX.utils.aoa_to_sheet(phasesRows);
  wsPhases['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, ...laneTypes.map(() => ({ wch: 16 }))];
  XLSX.utils.book_append_sheet(wb, wsPhases, 'Phases');

  // ── Download ───────────────────────────────────────────────────────────────
  const filename = `${project.config.name.replace(/\s+/g, '_')}_ROI.xlsx`;
  XLSX.writeFile(wb, filename);
}
