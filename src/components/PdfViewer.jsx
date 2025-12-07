import React, { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.449/pdf.worker.min.js';

export default function PdfViewer({ file }) {
  const [pages, setPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!file) { setPages(0); return; }
      try {
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        if (cancelled) return;
        setPages(pdf.numPages || 0);
      } catch (e) {
        console.error('PDF load error', e);
        setPages(0);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded shadow min-h-[220px]">
      <div className="font-semibold mb-2">PDF Viewer {pages ? `— ${pages} pages` : ''}</div>
      <div className="border border-gray-200 dark:border-gray-700 rounded p-4 min-h-[160px] flex items-center justify-center text-gray-500 dark:text-gray-300">
        {file ? 'PDF loaded (text parsing available via Parse action)' : 'No PDF selected'}
      </div>
    </div>
  );
}