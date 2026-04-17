import { useState, useMemo } from 'react';
import { CostsPage } from './pages/CostsPage';
import { PhasesPage } from './pages/PhasesPage';
import { ChartPage } from './pages/ChartPage';
import { TablePage } from './pages/TablePage';
import { SettingsPage } from './pages/SettingsPage';
import { useROIStore } from './store/roiStore';
import { exportToExcel } from './export/excelExporter';
import { importFromExcel } from './export/excelImporter';
import { computeTimeline } from './engine/timelineEngine';

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

function ExportHtmlButton() {
  const [state, setState] = useState<'idle' | 'building' | 'error'>('idle');

  async function handleExport() {
    setState('building');
    try {
      if (IS_DEV) {
        // In dev: Vite serves non-inlined assets so we need the build server
        // to produce a proper single-file bundle, then we inject the data.
        const storeData = localStorage.getItem(STORAGE_KEY) ?? '';
        const res = await fetch(`${BUILD_SERVER}/build`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeData }),
        });
        if (!res.ok) throw new Error(await res.text());
        // Build server already injects the bootstrap, just download
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ROI_Planner.html';
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        // On Cloudflare (or file://) — fetch the page's own URL to get the
        // clean inlined HTML, inject the data bootstrap, download.
        const url = window.location.protocol === 'file:'
          ? null  // can't fetch file:// — fall back to DOM
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
      setState('idle');
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  }

  const label = IS_DEV ? 'Export HTML' : 'Download HTML';

  return (
    <button
      onClick={handleExport}
      disabled={state === 'building'}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-wait"
    >
      {state === 'building' ? (
        <>
          <svg className="w-4 h-4 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          {IS_DEV ? 'Building…' : 'Downloading…'}
        </>
      ) : state === 'error' ? (
        <>
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Failed
        </>
      ) : (
        <>
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

function ImportExcelButton() {
  const { importProject } = useROIStore();
  const [state, setState] = useState<'idle' | 'error'>('idle');
  const [warnings, setWarnings] = useState<string[]>([]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so same file can be re-imported
    importFromExcel(file)
      .then(({ project, warnings }) => {
        importProject(project);
        setWarnings(warnings);
        setState('idle');
      })
      .catch((err) => {
        alert(`Import failed: ${err.message}`);
        setState('error');
        setTimeout(() => setState('idle'), 3000);
      });
  }

  return (
    <div className="relative">
      <label
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
          state === 'error'
            ? 'bg-red-600 text-white'
            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
        }`}
        title="Import from Excel (.xlsx)"
      >
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        {state === 'error' ? 'Failed' : 'Import Excel'}
        <input type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
      </label>
      {warnings.length > 0 && (
        <div className="absolute right-0 top-10 z-50 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 w-72 shadow-lg">
          <div className="font-semibold mb-1">Import warnings:</div>
          {warnings.map((w, i) => <div key={i}>• {w}</div>)}
          <button onClick={() => setWarnings([])} className="mt-2 text-amber-600 underline">Dismiss</button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>('chart');
  const { project } = useROIStore();
  const timeline = useMemo(() => computeTimeline(project), [project]);

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
          <span className="text-xs text-gray-400">{project.config.totalPosLanes.toLocaleString()} POS lanes</span>
          <span className="text-xs text-gray-300">·</span>
          <span className="text-xs text-gray-400">{project.config.totalScoLanes.toLocaleString()} SCO lanes</span>
          <span className="text-xs text-gray-300">·</span>
          <span className="text-xs text-gray-400">{project.config.durationMonths} months</span>

          <ImportExcelButton />

          <button
            onClick={() => exportToExcel(project, timeline)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Excel
          </button>

          <ExportHtmlButton />
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
