# Chat-PID-AI enhancement branch

## Added in this branch

- Browser-side PDF text-layer extraction using PDF.js.
- Candidate equipment/instrument tags and pipeline-spec inventory.
- Cross-P&ID tag search and tag suggestions.
- CSV export for candidate equipment and line inventory.
- Preliminary HAZOP review prompts with explicit uncertainty language.
- FastAPI backend with `/health`, `/api/analyze`, Excel exports, `/api/colorize`, and `/api/hazop/candidates`.
- Dockerfile and Docker Compose for the backend.

## Important limits (not yet implemented)

- Scanned-page OCR is not connected to the app. Add Tesseract/PaddleOCR on the backend and route image-only pages through OCR.
- Current diameter colorization annotates matching diameter text labels only. It does **not** trace pipe geometry or recolor the actual pipeline strokes.
- Equipment detection is tag-text matching, not symbol recognition. Grounding DINO/SAM or a fine-tuned detector needs a tested model and P&ID-specific validation set.
- Connectivity graph, upstream/downstream tracing, instrument loop sheets, process narrative generation, Google OAuth/Drive persistence, and Supabase per-user project storage remain future integrations.
- HAZOP results are screening prompts only; they are not a formal HAZOP or a statement that a safety device is missing.

## Run locally

```bash
npm install
npm run dev
```

In another terminal:

```bash
docker compose up --build
```

API docs: `http://localhost:8000/docs`; health check: `http://localhost:8000/health`.

The current React workspace runs local browser extraction. The API is scaffolded for integration and is not yet called by the UI automatically. Do not expose the API publicly without authentication, rate limits, upload scanning, and project-level authorization.
