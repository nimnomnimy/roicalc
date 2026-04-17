import { useState, useMemo, Fragment, useRef, useEffect } from 'react';
import { CostsPage } from './pages/CostsPage';
import { PhasesPage } from './pages/PhasesPage';
import { ChartPage } from './pages/ChartPage';
import { TablePage } from './pages/TablePage';
import { SettingsPage } from './pages/SettingsPage';
import { useROIStore } from './store/roiStore';
import { exportToExcel } from './export/excelExporter';
import { importFromExcel } from './export/excelImporter';
import type { ROIProject } from './types/models';
import { computeTimeline } from './engine/timelineEngine';
import { setDisplayCurrency } from './utils/format';

type Tab = 'chart' | 'table' | 'costs' | 'phases' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'chart', label: 'Chart' },
  { id: 'table', label: 'Table' },
  { id: 'costs', label: 'Costs' },
  { id: 'phases', label: 'Phases' },
  { id: 'settings', label: 'Settings' },
];

const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const BUILD_SERVER = 'http://localhost:5174';
const STORAGE_KEY = 'roi-planner-v1';

function injectBootstrap(html: string): string {
  const storeData = localStorage.getItem(STORAGE_KEY) ?? '';
  const escaped = JSON.stringify(storeData).replace(/</g, '\\u003c');
  const bootstrap = `<script>try{localStorage.setItem(${JSON.stringify(STORAGE_KEY)},${escaped});}catch(e){}<\/script>`;
  // Remove any previously injected bootstrap, then prepend a fresh one
  const cleaned = html.replace(/<script>try\{localStorage\.setItem\("roi-planner-v1"[\s\S]*?<\/script>/, '');
  return cleaned.replace('<head>', '<head>' + bootstrap);
}

function downloadHtml(html: string) {
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ROI_Planner.html';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importFromHtml(file: File): Promise<ROIProject> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const html = e.target!.result as string;
        const marker = 'localStorage.setItem("roi-planner-v1",';
        const markerIdx = html.indexOf(marker);
        if (markerIdx === -1) throw new Error('No ROI Planner data found in this HTML file');
        // The second argument starts immediately after the marker — it's a JSON string literal.
        // Walk past the opening quote, then find the matching close using JSON.parse on growing slices.
        const afterMarker = html.slice(markerIdx + marker.length).trimStart();
        // afterMarker starts with a JSON-encoded string: "\"...\""
        // Use JSON.parse progressively isn't reliable; instead find the end of the JSON string token.
        // Since the value was produced by JSON.stringify(storeData) it's a well-formed JSON string
        // starting with " and ending with " followed by );
        // We scan for the closing quote that isn't escaped.
        if (afterMarker[0] !== '"') throw new Error('Unexpected format in HTML bootstrap');
        let i = 1;
        while (i < afterMarker.length) {
          if (afterMarker[i] === '\\') { i += 2; continue; }
          if (afterMarker[i] === '"') break;
          i++;
        }
        const outerJson = afterMarker.slice(0, i + 1); // includes surrounding quotes
        const innerStr = JSON.parse(outerJson) as string;
        const stored = JSON.parse(innerStr) as { state?: { project?: ROIProject } };
        const project = stored?.state?.project;
        if (!project) throw new Error('Could not read project data from HTML file');
        resolve(project);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

import type { Timeline } from './types/models';

function TransferDropdown({ project, timeline }: { project: ROIProject; timeline: Timeline }) {
  const { importProject } = useROIStore();
  const [open, setOpen] = useState(false);
  const [htmlState, setHtmlState] = useState<'idle' | 'building' | 'error'>('idle');
  const [warnings, setWarnings] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleExportHtml() {
    setOpen(false);
    setHtmlState('building');
    try {
      if (IS_DEV) {
        const storeData = localStorage.getItem(STORAGE_KEY) ?? '';
        const res = await fetch(`${BUILD_SERVER}/build`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeData }),
        });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ROI_Planner.html';
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        const url = window.location.protocol === 'file:'
          ? null
          : window.location.href.split('?')[0].split('#')[0];
        let html: string;
        if (url) {
          const res = await fetch(url);
          html = await res.text();
        } else {
          html = document.documentElement.outerHTML;
        }
        downloadHtml(injectBootstrap(html));
      }
      setHtmlState('idle');
    } catch {
      setHtmlState('error');
      setTimeout(() => setHtmlState('idle'), 3000);
    }
  }

  function handleExportExcel() {
    setOpen(false);
    exportToExcel(project, timeline);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setOpen(false);

    if (file.name.endsWith('.html')) {
      importFromHtml(file)
        .then((proj) => importProject(proj))
        .catch((err) => alert(`Import failed: ${err.message}`));
    } else {
      importFromExcel(file)
        .then(({ project: proj, warnings }) => {
          importProject(proj);
          setWarnings(warnings);
        })
        .catch((err) => alert(`Import failed: ${err.message}`));
    }
  }

  const busy = htmlState === 'building';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-wait"
      >
        {busy ? (
          <svg className="w-4 h-4 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        )}
        {busy ? 'Building…' : 'Import / Export'}
        <svg className="w-3 h-3 shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 bg-white border border-gray-200 rounded-xl shadow-lg w-52 py-1 text-sm">
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Download</div>
          <button
            onClick={handleExportHtml}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700"
          >
            <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {IS_DEV ? 'Export HTML' : 'Download HTML'}
          </button>
          <button
            onClick={handleExportExcel}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700"
          >
            <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Excel
          </button>

          <div className="border-t border-gray-100 my-1" />
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Upload</div>
          <label className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700 cursor-pointer">
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import HTML / Excel
            <input type="file" accept=".xlsx,.html" className="hidden" onChange={handleImportFile} />
          </label>

          {warnings.length > 0 && (
            <div className="mx-2 mb-2 mt-1 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800">
              <div className="font-semibold mb-1">Import warnings:</div>
              {warnings.map((w, i) => <div key={i}>• {w}</div>)}
              <button onClick={() => setWarnings([])} className="mt-1 text-amber-600 underline">Dismiss</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>('chart');
  const { project } = useROIStore();
  const timeline = useMemo(() => computeTimeline(project), [project]);

  useEffect(() => {
    setDisplayCurrency(project.config.baseCurrency ?? 'AUD');
  }, [project.config.baseCurrency]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">R</div>
          <div>
            <div className="text-sm font-semibold text-gray-900 leading-tight">{project.config.name}</div>
            <div className="text-xs text-gray-400">ROI Planner</div>
          </div>
        </div>

        <nav className="flex gap-1 ml-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === t.id
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {project.config.laneTypes.map((lt) => (
            <Fragment key={lt.id}>
              <span className="text-xs text-gray-400">
                {(project.config.totalLanes[lt.id] ?? 0).toLocaleString()} {lt.name}
              </span>
              <span className="text-xs text-gray-300">·</span>
            </Fragment>
          ))}
          <span className="text-xs text-gray-400">{project.config.durationMonths} months</span>

          <TransferDropdown project={project} timeline={timeline} />
        </div>
      </header>

      <main className="flex-1">
        {tab === 'chart' && <ChartPage />}
        {tab === 'table' && <TablePage />}
        {tab === 'costs' && <CostsPage />}
        {tab === 'phases' && <PhasesPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
