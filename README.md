# Chat-PID-AI (clean)

This is a clean scaffold for Chat-PID-AI:
- Vite + React
- Tailwind CSS (dark mode via 'class')
- Basic PDF viewer/stubs (pdfjs)
- Netlify serverless function templates for RAG and vector PDF export

How to run locally (Windows / macOS / Linux / Termux):
1. Install Node.js (LTS).
2. In project root:
   npm install
   npm run dev
3. Open the URL shown by Vite (e.g. http://localhost:5173)

Netlify RAG function:
- Set OPENAI_API_KEY in Netlify environment variables before deploying.

Notes:
- The UI contains placeholders and basic parsing hooks. Replace RAG/netlify endpoints with your production API or keys.