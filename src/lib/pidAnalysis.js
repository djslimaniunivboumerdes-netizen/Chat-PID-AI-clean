import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';

const TAG_RE = /\b(?:P|PU|V|XV|HV|FCV|PCV|TCV|LCV|PSV|PRV|BDV|E|HX|HE|TK|T|D|C|K|FT|FE|FI|FIC|PT|PI|PIC|TT|TI|TIC|LT|LI|LIC|LSH|LSL|AIT|AT|XV|NRV|SDV)[- ]?\d{2,5}[A-Z]?(?:\s*[A/B])?\b/gi;
const LINE_RE = /\b(\d{1,3})\s*(?:\"|IN(?:CH(?:ES)?)?)\s*[- ]?\s*([A-Z0-9]{1,8})?\s*[- ]?\s*(\d{2,4})\s*(?:#|LB)?\b/gi;
const DIAMETER_RE = /\b(\d{1,3})\s*(?:\"|IN(?:CH(?:ES)?)?)\b/gi;

export async function extractPdfText(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str || '').join(' ');
    const words = content.items.map(item => {
      const t = item.str || '';
      const tr = item.transform || [];
      return { text: t, x: tr[4] || 0, y: tr[5] || 0, width: item.width || 0, height: item.height || 0 };
    }).filter(item => item.text.trim());
    pages.push({ page: i, text, words });
  }
  return { pageCount: pdf.numPages, pages };
}

export function buildInventory(fileId, filename, pages) {
  const equipment = [];
  const lines = [];
  const seenTags = new Set();
  const seenLines = new Set();

  for (const page of pages) {
    let match;
    TAG_RE.lastIndex = 0;
    while ((match = TAG_RE.exec(page.text)) !== null) {
      const tag = match[0].toUpperCase().replace(/\s+/g, '');
      const key = `${fileId}:${page.page}:${tag}`;
      if (seenTags.has(key)) continue;
      seenTags.add(key);
      equipment.push({ id: key, tag, type: inferType(tag), filename, page: page.page, confidence: 'text-match', source: 'PDF text layer' });
    }

    const sizes = [...page.text.matchAll(DIAMETER_RE)].map(m => Number(m[1]));
    LINE_RE.lastIndex = 0;
    while ((match = LINE_RE.exec(page.text)) !== null) {
      const diameter = Number(match[1]);
      const spec = (match[0] || '').trim();
      const key = `${fileId}:${page.page}:${spec}`;
      if (seenLines.has(key)) continue;
      seenLines.add(key);
      lines.push({
        id: key, lineNumber: '', diameterIn: diameter, fluid: '', pressureRating: match[3] ? `${match[3]}#` : '',
        insulation: '', from: '', to: '', valves: [], instruments: [], spec, filename, page: page.page,
        confidence: 'candidate — verify on drawing'
      });
    }

    // Preserve diameters even when no full line-spec pattern was recognized.
    if (!sizes.length) continue;
  }
  return { equipment, lines };
}

function inferType(tag) {
  const prefix = tag.match(/^[A-Z]+/)?.[0] || '';
  const types = {
    P: 'Pump', PU: 'Pump', V: 'Vessel / Valve', XV: 'Actuated valve', HV: 'Hand valve',
    FCV: 'Control valve', PCV: 'Control valve', TCV: 'Control valve', LCV: 'Control valve',
    PSV: 'Pressure safety valve', PRV: 'Pressure relief valve', E: 'Heat exchanger', HX: 'Heat exchanger',
    HE: 'Heat exchanger', TK: 'Tank', T: 'Temperature / tank tag', D: 'Drum / vessel',
    C: 'Compressor / column', K: 'Compressor', FT: 'Flow transmitter', FE: 'Flow element',
    FI: 'Flow indicator', FIC: 'Flow controller', PT: 'Pressure transmitter', PI: 'Pressure indicator',
    PIC: 'Pressure controller', TT: 'Temperature transmitter', TI: 'Temperature indicator',
    TIC: 'Temperature controller', LT: 'Level transmitter', LI: 'Level indicator', LIC: 'Level controller',
    LSH: 'Level switch high', LSL: 'Level switch low', AIT: 'Analyzer transmitter', AT: 'Analyzer'
  };
  return types[prefix] || 'Instrument / equipment (unverified)';
}

export function buildHazopCandidates(equipment, lines) {
  const findings = [];
  const byType = type => equipment.filter(item => item.type === type);
  for (const vessel of equipment.filter(item => /Vessel|Tank|Drum/.test(item.type))) {
    findings.push({
      id: `relief-review-${vessel.id}`, node: vessel.tag, category: 'Relief protection review',
      severity: 'Review required', evidence: `Tag ${vessel.tag} was detected; relief-device connectivity was not established by text extraction.`,
      recommendation: 'Verify the approved P&ID and design basis for a correctly sized, connected pressure-relief device. This is not proof that a relief device is missing.'
    });
  }
  for (const pump of byType('Pump')) {
    findings.push({
      id: `pump-review-${pump.id}`, node: pump.tag, category: 'Suction protection review',
      severity: 'Review required', evidence: `Pump tag ${pump.tag} was detected; suction-side components may not be reliably recognized.`,
      recommendation: 'Check the approved P&ID and pump/vendor requirements for suction strainer, isolation, minimum-flow and check-valve arrangements. Do not treat this candidate as a confirmed defect.'
    });
  }
  for (const line of lines.filter(item => !item.lineNumber || !item.from || !item.to)) {
    findings.push({
      id: `line-data-${line.id}`, node: line.spec, category: 'Incomplete line data',
      severity: 'Data quality', evidence: `Candidate line spec found on page ${line.page} of ${line.filename}; endpoint and/or line number could not be established.`,
      recommendation: 'Review the drawing and confirm the line number, fluid, endpoints, pressure class and connected components.'
    });
  }
  return findings;
}

export function answerFromInventory(question, files) {
  const q = question.toLowerCase();
  const equipment = files.flatMap(f => f.analysis?.equipment || []);
  const lines = files.flatMap(f => f.analysis?.lines || []);
  if (/how many.*(8|eight).*(line|pipe)/.test(q) || /count.*8\s*(inch|")/.test(q)) {
    const count = lines.filter(line => line.diameterIn === 8).length;
    return `I found ${count} candidate 8-inch line specifications in the searchable PDF text. This is a text-layer count, not a verified count of every physical pipeline.`;
  }
  const tagQuery = question.match(/\b(?:P|PU|V|XV|HV|FCV|PCV|TCV|LCV|PSV|PRV|E|HX|HE|TK|T|D|C|K|FT|FE|FI|FIC|PT|PI|PIC|TT|TI|TIC|LT|LI|LIC|LSH|LSL|AIT|AT)-?\d{2,5}[A-Z]?\b/i)?.[0];
  if (tagQuery) {
    const found = equipment.filter(item => item.tag.toLowerCase() === tagQuery.toLowerCase());
    if (found.length) return found.map(item => `${item.tag} — ${item.type}; ${item.filename}, page ${item.page} (text match; verify against drawing)`).join('\n');
    return `No exact text-layer match for ${tagQuery}. It may be in a scanned image; run OCR or check the source PDF manually.`;
  }
  if (/how many|count|number of/.test(q) && /flange/.test(q)) {
    return 'Flange symbols are not reliably countable from text extraction alone. Symbol recognition and manual verification are required; no flange count is reported to avoid inventing a result.';
  }
  if (!equipment.length && !lines.length) return 'Upload a PDF with an embedded text layer or run OCR first. No extracted P&ID inventory is available yet.';
  return `Current text-layer index: ${equipment.length} equipment/instrument tag candidates and ${lines.length} line-spec candidates across uploaded PDFs. Ask for a specific tag, or ask “How many candidate 8-inch lines?” Results are preliminary and should be checked against the drawing.`;
}
