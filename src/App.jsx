import React, { useMemo, useState } from 'react';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import PdfViewer from './components/PdfViewer.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import useDarkMode from './hooks/useDarkMode.js';
import { generateId } from './utils.js';
import { extractPdfText, buildInventory, buildHazopCandidates, answerFromInventory } from './lib/pidAnalysis.js';

const COLORS = { '8': '#ef4444', '20': '#3b82f6', gt24: '#22c55e', lt4: '#f97316' };

function downloadCsv(rows, filename) {
  if (!rows.length) return;
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const quote = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  const csv = [columns.map(quote).join(','), ...rows.map(row => columns.map(key => quote(Array.isArray(row[key]) ? row[key].join('; ') : row[key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [dark, setDark] = useDarkMode();
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeFileId, setActiveFileId] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState('overview');

  const activeProject = projects.find(project => project.id === activeId) || null;
  const allFiles = activeProject?.files || [];
  const activeFile = allFiles.find(file => file.id === activeFileId) || allFiles[0] || null;
  const equipment = allFiles.flatMap(file => file.analysis?.equipment || []);
  const lines = allFiles.flatMap(file => file.analysis?.lines || []);
  const hazards = useMemo(() => buildHazopCandidates(equipment, lines), [activeProject]);
  const tags = useMemo(() => [...new Set(equipment.map(item => item.tag))].sort(), [activeProject]);
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return equipment.filter(item => item.tag.toLowerCase().includes(q) || item.type.toLowerCase().includes(q)).slice(0, 20);
  }, [query, activeProject]);

  const createProject = () => {
    const name = window.prompt('Project name:') || `Project-${new Date().toLocaleDateString()}`;
    const project = { id: generateId(), name, files: [], createdAt: new Date().toISOString() };
    setProjects(previous => [...previous, project]);
    setActiveId(project.id);
    setNotice(`Project “${name}” created. Upload P&ID PDFs to begin.`);
  };

  const uploadToProject = async fileList => {
    const pdfs = Array.from(fileList || []).filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) { setNotice('Choose one or more PDF files.'); return; }
    let projectId = activeId;
    if (!projectId || !projects.some(project => project.id === projectId)) {
      const project = { id: generateId(), name: 'P&ID Review', files: [], createdAt: new Date().toISOString() };
      setProjects(previous => [...previous, project]);
      projectId = project.id;
      setActiveId(projectId);
    }
    setBusy(true);
    setNotice(`Reading PDF text layers from ${pdfs.length} file(s)… scanned drawings may need OCR.`);
    const processed = [];
    for (const file of pdfs) {
      const item = { id: generateId(), name: file.name, file, pageCount: 0, pages: [], analysis: { equipment: [], lines: [] }, status: 'processing' };
      try {
        const extracted = await extractPdfText(file);
        item.pageCount = extracted.pageCount;
        item.pages = extracted.pages;
        item.analysis = buildInventory(item.id, item.name, extracted.pages);
        item.status = extracted.pages.some(page => page.text.trim()) ? 'text extracted' : 'needs OCR';
      } catch (error) {
        item.status = 'failed';
        item.error = error?.message || 'Could not read PDF';
      }
      processed.push(item);
    }
    setProjects(previous => previous.map(project => project.id === projectId ? { ...project, files: [...project.files, ...processed] } : project));
    if (!activeFileId && processed[0]) setActiveFileId(processed[0].id);
    setBusy(false);
    const tagCount = processed.reduce((sum, file) => sum + (file.analysis?.equipment?.length || 0), 0);
    const lineCount = processed.reduce((sum, file) => sum + (file.analysis?.lines?.length || 0), 0);
    setNotice(`Analysis finished: ${tagCount} tag candidates and ${lineCount} line-spec candidates. Scanned PDFs may require OCR; all extracted data must be verified.`);
  };

  const askRag = async question => answerFromInventory(question, allFiles);

  const currentRows = view === 'equipment' ? equipment : lines;
  const diameterColor = diameter => {
    if (diameter === 8) return COLORS['8'];
    if (diameter === 20) return COLORS['20'];
    if (diameter > 24) return COLORS.gt24;
    if (diameter < 4) return COLORS.lt4;
    return '#64748b';
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header dark={dark} setDark={setDark} />
      <div className="flex flex-1 min-h-0">
        <Sidebar projects={projects} activeId={activeId} setActiveId={setActiveId} onCreate={createProject} />
        <main className="flex-1 min-w-0 overflow-auto p-4 md:p-6">
          <div className="mx-auto max-w-[1600px] space-y-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-600">Engineering document intelligence</p>
                <h1 className="mt-1 text-2xl font-bold md:text-3xl">Chat-PID-AI <span className="text-teal-500">Workspace</span></h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Upload P&IDs, index searchable text, review candidate inventory and explore engineering checks.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => downloadCsv(lines, 'pipeline-inventory.csv')} disabled={!lines.length} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800">Export line CSV</button>
                <button onClick={() => downloadCsv(equipment, 'equipment-inventory.csv')} disabled={!equipment.length} className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-40">Export equipment CSV</button>
              </div>
            </header>

            {notice && <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-100">{notice}</div>}

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ['P&ID files', allFiles.length, 'PDF documents in this project'],
                ['Pages', allFiles.reduce((sum, file) => sum + (file.pageCount || 0), 0), 'PDF pages read'],
                ['Tag candidates', equipment.length, 'Text-layer matches'],
                ['Line candidates', lines.length, 'Possible line specifications']
              ].map(([label, value, description]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-sm text-slate-500 dark:text-slate-400">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-slate-500">{description}</p></div>)}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="font-semibold">Upload P&ID drawings</h2><p className="text-sm text-slate-500 dark:text-slate-400">Multiple PDFs supported. Processing currently reads embedded PDF text in your browser.</p></div>
                <label className={`cursor-pointer rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                  {busy ? 'Analyzing…' : '＋ Upload PDF files'}
                  <input className="hidden" type="file" multiple accept="application/pdf,.pdf" disabled={busy} onChange={event => { uploadToProject(event.target.files); event.target.value = ''; }} />
                </label>
              </div>
              {allFiles.length > 0 && <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{allFiles.map(file => <button key={file.id} onClick={() => setActiveFileId(file.id)} className={`rounded-xl border p-3 text-left transition ${activeFile?.id === file.id ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40' : 'border-slate-200 hover:border-slate-400 dark:border-slate-700'}`}><div className="truncate font-medium">{file.name}</div><div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500"><span>{file.pageCount} pages · {file.analysis?.equipment?.length || 0} tags</span><span>{file.status}</span></div></button>)}</div>}
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.8fr)]">
              <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h2 className="font-semibold">Drawing viewer</h2><p className="text-sm text-slate-500 dark:text-slate-400">{activeFile ? activeFile.name : 'Select a PDF to view'}</p></div>
                  {activeFile && <a className="text-sm font-semibold text-teal-600 hover:underline" href={URL.createObjectURL(activeFile.file)} target="_blank" rel="noreferrer">Open PDF ↗</a>}
                </div>
                <div className="mt-3"><PdfViewer file={activeFile?.file} /></div>
                {activeFile?.status === 'needs OCR' && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">No selectable text was found. Run OCR on a backend (Tesseract or PaddleOCR) to index this scanned drawing.</p>}
                <div className="mt-4 flex flex-wrap gap-2 text-xs">{[['8-inch', COLORS['8']], ['20-inch', COLORS['20']], ['>24-inch', COLORS.gt24], ['<4-inch', COLORS.lt4]].map(([label, color]) => <span key={label} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 dark:border-slate-700"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{label}</span>)}</div>
                <p className="mt-2 text-xs text-slate-500">Diameter colors are a rule preview only. This browser MVP does not yet trace physical pipe geometry or apply colors to pipeline strokes in the PDF.</p>
              </section>

              <section className="flex min-h-[430px] flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="px-2 pb-2"><h2 className="font-semibold">Chat with your P&IDs</h2><p className="text-sm text-slate-500 dark:text-slate-400">Answers use extracted text candidates only; no unsupported engineering assumptions.</p></div>
                <div className="min-h-[360px] flex-1"><ChatPanel project={activeProject} onAsk={askRag} /></div>
              </section>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="font-semibold">Cross-P&ID tag search</h2><p className="text-sm text-slate-500 dark:text-slate-400">Autocomplete across the currently selected project.</p></div>
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tags, e.g. PSV-114 or P-101…" className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-teal-500 md:max-w-sm dark:border-slate-700" list="pid-tag-suggestions" />
                <datalist id="pid-tag-suggestions">{tags.map(tag => <option key={tag} value={tag} />)}</datalist>
              </div>
              {query && <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">{searchResults.map(item => <button key={item.id} onClick={() => { setActiveFileId(allFiles.find(file => file.name === item.filename)?.id || activeFileId); setNotice(`${item.tag}: ${item.type}, ${item.filename}, page ${item.page}. Text match only; confirm location visually.`); }} className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"><span><strong>{item.tag}</strong><span className="ml-2 text-sm text-slate-500">{item.type}</span></span><span className="text-xs text-slate-500">{item.filename} · p. {item.page}</span></button>)}{!searchResults.length && <p className="py-3 text-sm text-slate-500">No matches in extracted text.</p>}</div>}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Extracted inventory</h2><p className="text-sm text-slate-500 dark:text-slate-400">Candidate data, not an approved engineering register.</p></div><div className="flex gap-2"><button onClick={() => setView('lines')} className={`rounded-lg px-3 py-2 text-sm ${view !== 'equipment' ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>Pipeline candidates</button><button onClick={() => setView('equipment')} className={`rounded-lg px-3 py-2 text-sm ${view === 'equipment' ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>Equipment / instruments</button></div></div>
              <div className="mt-4 overflow-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60"><tr>{(view === 'equipment' ? ['Tag', 'Type', 'PDF', 'Page', 'Source'] : ['Diameter', 'Line spec candidate', 'Fluid', 'Pressure class', 'PDF', 'Page']).map(col => <th key={col} className="px-3 py-3 font-semibold">{col}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{currentRows.slice(0, 500).map(row => view === 'equipment' ? <tr key={row.id}><td className="px-3 py-3 font-semibold">{row.tag}</td><td className="px-3 py-3">{row.type}</td><td className="px-3 py-3">{row.filename}</td><td className="px-3 py-3">{row.page}</td><td className="px-3 py-3 text-xs text-slate-500">{row.source}</td></tr> : <tr key={row.id}><td className="px-3 py-3"><span className="rounded-full px-2 py-1 text-xs font-semibold text-white" style={{ backgroundColor: diameterColor(row.diameterIn) }}>{row.diameterIn}&quot;</span></td><td className="px-3 py-3 font-medium">{row.spec}</td><td className="px-3 py-3">{row.fluid || '—'}</td><td className="px-3 py-3">{row.pressureRating || '—'}</td><td className="px-3 py-3">{row.filename}</td><td className="px-3 py-3">{row.page}</td></tr>)}</tbody></table>{!currentRows.length && <div className="py-10 text-center text-sm text-slate-500">Upload a PDF with a selectable text layer to populate this table.</div>}</div>
            </section>

            <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/20">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">AI Inspector · HAZOP review candidates</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Preliminary review prompts only. These checks do not establish a design deficiency or replace a formal HAZOP.</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">{hazards.length} review prompts</span></div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">{hazards.slice(0, 12).map(item => <article key={item.id} className="rounded-xl border border-amber-200 bg-white p-3 dark:border-amber-900 dark:bg-slate-900"><div className="flex items-center justify-between gap-2"><strong className="text-sm">{item.node}</strong><span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{item.severity}</span></div><p className="mt-1 text-sm font-medium">{item.category}</p><p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{item.evidence}</p><p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{item.recommendation}</p></article>)}</div>
              {!hazards.length && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Upload and parse P&IDs to create review prompts. Absence of a prompt does not mean a system is safe.</p>}
            </section>
            <footer className="pb-4 text-center text-xs text-slate-500">Chat-PID-AI prototype · Local browser analysis · No engineering approval implied · Verify all extracted information against controlled drawings.</footer>
          </div>
        </main>
      </div>
    </div>
  );
}
