import React from 'react';

export default function Sidebar({ projects, activeId, setActiveId, onCreate }) {
  return (
    <aside className="w-72 bg-white dark:bg-gray-800 border-r p-4 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Projects</h2>
        <button className="text-sm text-blue-600" onClick={onCreate}>New</button>
      </div>

      <div className="flex-1 overflow-auto space-y-2">
        {projects.length === 0 && <div className="text-sm text-gray-500">No projects yet</div>}
        {projects.map(p => (
          <div key={p.id} onClick={() => setActiveId(p.id)}
               className={`p-2 rounded cursor-pointer ${activeId === p.id ? 'ring-2 ring-blue-300' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            <div className="font-medium">{p.name}</div>
            <div className="text-xs text-gray-400">{p.files?.length || 0} files</div>
          </div>
        ))}
      </div>
    </aside>
  );
}