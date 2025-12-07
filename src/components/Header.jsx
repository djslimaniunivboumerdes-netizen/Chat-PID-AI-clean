import React from 'react';

export default function Header({ dark, setDark }) {
  return (
    <header className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b dark:border-gray-700">
      <div className="flex items-center gap-3">
        <div className="text-2xl font-bold">Chat-P&amp;ID-AI</div>
        <div className="text-sm text-gray-500 hidden sm:block">P&ID assistant</div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setDark(!dark)} className="px-3 py-1 rounded bg-gray-100 dark:bg-gray-700">
          {dark ? '☀ Light' : '🌙 Dark'}
        </button>
      </div>
    </header>
  );
}