import io
import re
import os
from typing import Any
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import fitz
import pandas as pd

app = FastAPI(title="Chat-PID-AI API", version="0.2.0", description="P&ID document parsing API. Results are candidate extractions and require engineering verification.")

origins = [value.strip() for value in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if value.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["*"])

TAG_RE = re.compile(r"\b(?:P|PU|V|XV|HV|FCV|PCV|TCV|LCV|PSV|PRV|BDV|E|HX|HE|TK|T|D|C|K|FT|FE|FI|FIC|PT|PI|PIC|TT|TI|TIC|LT|LI|LIC|LSH|LSL|AIT|AT|NRV|SDV)[- ]?\d{2,5}[A-Z]?(?:\s*[A/B])?\b", re.I)
LINE_RE = re.compile(r'\b(\d{1,3})\s*(?:\"|IN(?:CH(?:ES)?)?)\s*[- ]?\s*([A-Z0-9]{1,8})?\s*[- ]?\s*(\d{2,4})\s*(?:#|LB)?\b', re.I)
DIA_RE = re.compile(r'\b(\d{1,3})\s*(?:\"|IN(?:CH(?:ES)?)?)\b', re.I)
COLORS = {8: (1, 0, 0), 20: (0, 0.25, 1), "gt24": (0, 0.7, 0.2), "lt4": (1, 0.45, 0)}

def classify_tag(tag: str) -> str:
    prefix = re.match(r"[A-Z]+", tag.upper())
    prefix = prefix.group(0) if prefix else ""
    if prefix in {"P", "PU"}: return "Pump"
    if prefix in {"PSV", "PRV"}: return "Pressure relief device"
    if prefix in {"FCV", "PCV", "TCV", "LCV"}: return "Control valve"
    if prefix in {"E", "HX", "HE"}: return "Heat exchanger"
    if prefix in {"TK"}: return "Tank"
    if prefix in {"FT", "FE", "FI", "FIC"}: return "Flow instrument"
    if prefix in {"PT", "PI", "PIC"}: return "Pressure instrument"
    if prefix in {"TT", "TI", "TIC"}: return "Temperature instrument"
    if prefix in {"LT", "LI", "LIC", "LSH", "LSL"}: return "Level instrument"
    if prefix in {"V", "D"}: return "Vessel / drum (verify)"
    return "Equipment / instrument (verify)"

def analyze_pdf_bytes(data: bytes, filename: str) -> dict[str, Any]:
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"{filename}: invalid or unreadable PDF") from exc
    pages, equipment, lines = [], [], []
    for page_no, page in enumerate(doc, 1):
        text = page.get_text("text") or ""
        pages.append({"page": page_no, "text": text, "has_text": bool(text.strip())})
        for tag in sorted({m.group(0).upper().replace(" ", "") for m in TAG_RE.finditer(text)}):
            equipment.append({"tag": tag, "type": classify_tag(tag), "filename": filename, "page": page_no, "source": "PDF text layer", "confidence": "candidate"})
        seen = set()
        for match in LINE_RE.finditer(text):
            spec = match.group(0).strip()
            if spec in seen: continue
            seen.add(spec)
            lines.append({"line_number": "", "diameter_in": int(match.group(1)), "fluid": "", "pressure_rating": f"{match.group(3)}#", "insulation": "", "from_equipment": "", "to_equipment": "", "control_valves": "", "instruments": "", "spec_candidate": spec, "filename": filename, "page": page_no, "confidence": "candidate — verify on drawing"})
    doc.close()
    return {"filename": filename, "page_count": len(pages), "pages": pages, "equipment": equipment, "pipelines": lines, "ocr_needed": any(not page["has_text"] for page in pages)}

@app.get("/health")
def health():
    return {"status": "ok", "service": "chat-pid-ai-api", "version": "0.2.0"}

@app.post("/api/analyze")
async def analyze(files: list[UploadFile] = File(...)):
    if not files: raise HTTPException(status_code=400, detail="Upload at least one PDF.")
    if len(files) > 30: raise HTTPException(status_code=413, detail="Maximum 30 PDFs per request.")
    results = []
    for file in files:
        if not file.filename or not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=415, detail="Only PDF files are accepted.")
        data = await file.read()
        if len(data) > 50 * 1024 * 1024: raise HTTPException(status_code=413, detail=f"{file.filename} exceeds 50 MB.")
        results.append(analyze_pdf_bytes(data, file.filename))
    return {"files": results, "equipment": [row for result in results for row in result["equipment"]], "pipelines": [row for result in results for row in result["pipelines"]], "notice": "Text-layer extraction only. Scanned pages require OCR; line endpoints and connectivity are not inferred."}

@app.post("/api/export/inventory.xlsx")
async def export_inventory(files: list[UploadFile] = File(...)):
    results = []
    for file in files:
        data = await file.read()
        result = analyze_pdf_bytes(data, file.filename or "drawing.pdf")
        results.extend(result["pipelines"])
    output = io.BytesIO()
    pd.DataFrame(results).to_excel(output, index=False)
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": 'attachment; filename="pid-pipeline-inventory.xlsx"'})

@app.post("/api/export/equipment.xlsx")
async def export_equipment(files: list[UploadFile] = File(...)):
    results = []
    for file in files:
        data = await file.read()
        results.extend(analyze_pdf_bytes(data, file.filename or "drawing.pdf")["equipment"])
    output = io.BytesIO()
    pd.DataFrame(results).to_excel(output, index=False)
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": 'attachment; filename="pid-equipment-inventory.xlsx"'})

@app.post("/api/colorize")
async def colorize(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Only PDF files are accepted.")
    raw = await file.read()
    try: doc = fitz.open(stream=raw, filetype="pdf")
    except Exception as exc: raise HTTPException(status_code=400, detail="Invalid PDF.") from exc
    annotated_count = 0
    for page in doc:
        words = page.get_text("words")
        text = page.get_text("text") or ""
        for match in DIA_RE.finditer(text):
            diameter = int(match.group(1))
            color = COLORS.get(diameter, COLORS["gt24"] if diameter > 24 else COLORS["lt4"] if diameter < 4 else None)
            if color is None: continue
            # This marks matching text labels only; it does not trace or recolor pipe strokes.
            for rect in page.search_for(match.group(0)):
                annot = page.add_rect_annot(rect + (-2, -1, 2, 1))
                annot.set_colors(stroke=color)
                annot.set_border(width=1.5)
                annot.update(opacity=0.85)
                annotated_count += 1
    output = io.BytesIO(doc.tobytes(garbage=4, deflate=True))
    doc.close()
    output.seek(0)
    return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="pid-color-review.pdf"', "X-Annotations-Count": str(annotated_count), "X-Annotation-Limit": "Diameter labels only; pipe geometry is not traced."})

@app.post("/api/hazop/candidates")
async def hazop_candidates(files: list[UploadFile] = File(...)):
    all_equipment, all_lines = [], []
    for file in files:
        result = analyze_pdf_bytes(await file.read(), file.filename or "drawing.pdf")
        all_equipment.extend(result["equipment"])
        all_lines.extend(result["pipelines"])
    findings = []
    for item in all_equipment:
        if item["type"] in {"Tank", "Vessel / drum (verify)"}:
            findings.append({"tag": item["tag"], "category": "Relief protection review", "severity": "Review required", "finding": "Relief-device connectivity could not be confirmed from text extraction.", "recommendation": "Verify the approved P&ID and design basis for correctly sized pressure relief protection. This is not proof a device is missing.", "filename": item["filename"], "page": item["page"]})
        if item["type"] == "Pump":
            findings.append({"tag": item["tag"], "category": "Pump suction protection review", "severity": "Review required", "finding": "Suction-side components were not reliably established.", "recommendation": "Check approved P&ID and vendor requirements for strainer, isolation, check-valve and minimum-flow arrangements.", "filename": item["filename"], "page": item["page"]})
    return {"findings": findings, "disclaimer": "Screening prompts only; not a HAZOP study, engineering approval or proof of a design deficiency."}
