import React, { useState } from 'react';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import PdfViewer from './components/PdfViewer.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import useDarkMode from './hooks/useDarkMode.js';
import { generateId } from './utils.js';

export default function App() {
  const [dark, setDark] = useDarkMode();
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeFile, setActiveFile] = useState(null);

  const createProject = () => {
    const name = prompt('Project name:') || `Project-${Date.now()}`;
    const p = { id: generateId(), name, files: [] };
    setProjects(prev => [...prev, p]);
    setActiveId(p.id);
  };

  const uploadToProject = (projId, files) => {
    const arr = Array.from(files || []);
    const pdfs = arr.filter(f => f.type === 'application/pdf').map(f => ({ id: generateId(), name: f.name, file: f }));
    if (pdfs.length === 0) return;
    setProjects(prev => prev.map(p => p.id === projId ? { ...p, files: [...p.files, ...pdfs] } : p));
  };

  const activeProject = projects.find(p => p.id === activeId) || null;

  // Mock RAG ask; can be replaced by calling serverless function
  const askRag = async (q) => {
    // return placeholder summary / fallback logic
    // Example: count occurrences of "8" diameters from parsed items (not implemented)
    return `Received: "${q}". RAG integration required for real answers.`;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header dark={dark} setDark={setDark} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar projects={projects} activeId={activeId} setActiveId={setActiveId} onCreate={createProject} />
        <main className="flex-1 p-4 overflow-auto">
          <div className="grid grid-cols-12 gap-4">
            <section className="col-span-8">
              <div className="mb-4 flex gap-2 items-center">
                <label className="flex-1">
                  <input type="file" multiple accept="application/pdf" onChange={e => uploadToProject(activeId, e.target.files)} />
                </label>
              </div>

              <PdfViewer file={activeFile?.file} />

            </section>

            <aside className="col-span-4 flex flex-col gap-4">
              <div className="bg-white dark:bg-gray-800 p-3 rounded shadow">
                <div className="font-semibold mb-2">Project</div>
                <div className="text-sm">{activeProject ? activeProject.name : 'No project selected'}</div>
                <div className="mt-2 space-y-1 max-h-40 overflow-auto">
                  {activeProject?.files?.map(f => (
                    <div key={f.id} className="p-2 border rounded cursor-pointer" onClick={() => setActiveFile(f)}>{f.name}</div>
                  ))}
                </div>
              </div>

              <div className="flex-1 bg-white dark:bg-gray-800 p-2 rounded">
                <ChatPanel project={activeProject} onAsk={askRag} />
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}