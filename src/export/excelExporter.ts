import * as XLSX from 'xlsx';
import type { ROIProject } from '../types/models';
import type { Timeline } from '../types/models';

function col(n: number): string {
  // Convert 0-based column index to Excel letter (A, B, ... Z, AA, ...)
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

  // ── Sheet 1: Summary ───────────────────────────────────────────────────────
  const summaryData: (string | number)[][] = [
    ['ROI Analysis Summary'],
    [],
    ['Project', project.config.name],
    ['Start Date', project.config.startDate.slice(0, 10)],
    ['Duration (months)', project.config.durationMonths],
    ['Total POS Lanes', project.config.totalPosLanes],
    ['Total SCO Lanes', project.config.totalScoLanes],
    [],
    ['', 'Amount'],
    ['Baseline Cost (no change)', timeline.totalBaseline],
    ['Total Existing Platform Cost', timeline.totalExisting],
    ['Total New Platform Cost', timeline.totalNew],
    ['Total Combined Cost', timeline.totalExisting + timeline.totalNew],
    ['Net Savings vs Baseline', timeline.totalSavings],
    [],
    ['Phases'],
    ['Phase', 'Type', 'Migration Events', 'Total POS Migrated', 'Total SCO Migrated'],
    ...project.phases.map(p => [
      p.name,
      p.type,
      p.monthDeltas.length,
      p.monthDeltas.reduce((s, d) => s + d.posLanesAdded, 0),
      p.monthDeltas.reduce((s, d) => s + d.scoLanesAdded, 0),
    ]),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  // Format currency cells
  ['B10', 'B11', 'B12', 'B13', 'B14'].forEach((ref, i) => {
    const values = [timeline.totalBaseline, timeline.totalExisting, timeline.totalNew,
      timeline.totalExisting + timeline.totalNew, timeline.totalSavings];
    if (wsSummary[ref]) wsSummary[ref].z = '$#,##0';
    else wsSummary[ref] = { v: values[i], t: 'n', z: '$#,##0' };
  });
  wsSummary['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // ── Sheet 2: Monthly Breakdown ─────────────────────────────────────────────
  const monthlyHeaders = [
    'Month', 'Existing POS Lanes', 'Existing SCO Lanes', 'New POS Lanes', 'New SCO Lanes',
    'Existing Cost', 'New Cost', 'Combined Cost', 'Baseline', 'Savings vs Baseline', 'Cumulative Savings',
  ];
  const monthlyRows = timeline.rows.map(r => [
    r.label,
    r.existingPosLanes,
    r.existingScoLanes,
    r.newPosLanes,
    r.newScoLanes,
    r.existingCost,
    r.newCost,
    r.existingCost + r.newCost,
    r.baselineCost,
    r.savings,
    r.cumulativeSavings,
  ]);
  // Totals row
  monthlyRows.push([
    'TOTAL', '', '', '', '',
    timeline.totalExisting,
    timeline.totalNew,
    timeline.totalExisting + timeline.totalNew,
    timeline.totalBaseline,
    timeline.totalSavings,
    '',
  ]);

  const wsMonthly = XLSX.utils.aoa_to_sheet([monthlyHeaders, ...monthlyRows]);
  // Apply currency format to columns F–K (indices 5–10)
  const currencyCols = [5, 6, 7, 8, 9, 10];
  const rowCount = monthlyRows.length + 1;
  for (let r = 1; r < rowCount + 1; r++) {
    for (const c of currencyCols) {
      const ref = `${col(c)}${r + 1}`;
      if (wsMonthly[ref] && typeof wsMonthly[ref].v === 'number') {
        wsMonthly[ref].z = '$#,##0';
      }
    }
  }
  wsMonthly['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Breakdown');

  // ── Sheet 3: Cost Items ────────────────────────────────────────────────────
  const costsHeaders = [
    'Platform', 'Vendor', 'Item', 'Cost Type', 'Lane Type',
    'Unit Price', 'Billing', 'Discount %', 'One-off', 'One-off Month', 'Enabled',
  ];
  const costsRows = project.costItems.map(item => [
    item.platform === 'existing' ? 'Existing' : 'New',
    item.vendor,
    item.name,
    item.costType,
    item.laneType ?? 'N/A',
    item.unitPrice,
    item.billing,
    item.discountPct ?? 0,
    item.oneOff ? 'Yes' : 'No',
    item.oneOff ? (item.oneOffMonth ?? 0) : '',
    item.enabled ? 'Yes' : 'No',
  ]);
  const wsCosts = XLSX.utils.aoa_to_sheet([costsHeaders, ...costsRows]);
  for (let r = 1; r <= costsRows.length; r++) {
    const ref = `F${r + 1}`;
    if (wsCosts[ref] && typeof wsCosts[ref].v === 'number') wsCosts[ref].z = '$#,##0.00';
  }
  wsCosts['!cols'] = [
    { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 10 }, { wch: 10 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCosts, 'Cost Items');

  // ── Sheet 4: Phases ────────────────────────────────────────────────────────
  const phasesRows: (string | number)[][] = [
    ['Phase', 'Type', 'Month Index', 'Month Label', 'POS Lanes Added', 'SCO Lanes Added'],
  ];
  for (const phase of project.phases) {
    for (const delta of phase.monthDeltas) {
      const d = new Date(project.config.startDate);
      d.setMonth(d.getMonth() + delta.monthIndex);
      const label = d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
      phasesRows.push([phase.name, phase.type, delta.monthIndex, label, delta.posLanesAdded, delta.scoLanesAdded]);
    }
  }
  const wsPhases = XLSX.utils.aoa_to_sheet(phasesRows);
  wsPhases['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsPhases, 'Phases');

  // ── Download ───────────────────────────────────────────────────────────────
  const filename = `${project.config.name.replace(/\s+/g, '_')}_ROI.xlsx`;
  XLSX.writeFile(wb, filename);
}
