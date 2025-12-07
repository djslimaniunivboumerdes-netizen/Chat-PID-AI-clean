const { PDFDocument, rgb } = require('pdf-lib');

function hexToRgbFrac(hex){
  if(!hex) return { r:0, g:0, b:0 };
  const h = hex.replace('#','');
  const bigint = parseInt(h,16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r: r/255, g: g/255, b: b/255 };
}

exports.handler = async function(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const pdfBase64 = body.pdfBase64;
    const overlays = body.overlays || [];
    if(!pdfBase64) return { statusCode:400, body: JSON.stringify({ error: 'Missing pdfBase64' }) };
    const pdfBytes = Uint8Array.from(Buffer.from(pdfBase64, 'base64'));
    const pdfDoc = await PDFDocument.load(pdfBytes);

    for(const ov of overlays){
      const pageIndex = Math.max(0,(ov.page||1)-1);
      if(pageIndex >= pdfDoc.getPageCount()) continue;
      const page = pdfDoc.getPage(pageIndex);
      const { pageWidth = ov.pageWidth || page.getWidth(), pageHeight = ov.pageHeight || page.getHeight() } = ov;
      const scaleX = page.getWidth() / pageWidth;
      const scaleY = page.getHeight() / pageHeight;
      const x = (ov.x || 0) * scaleX;
      const yTop = (ov.y || 0) * scaleY;
      const h = (ov.height || 10) * scaleY;
      const w = (ov.width || 80) * scaleX;
      const y = page.getHeight() - yTop - h;
      const color = hexToRgbFrac(ov.color || '#ff0000');
      page.drawRectangle({ x, y, width: w, height: h, color: rgb(color.r, color.g, color.b), opacity: ov.opacity ?? 0.35, borderWidth: 0 });
    }

    const out = await pdfDoc.save();
    const outB64 = Buffer.from(out).toString('base64');
    return { statusCode:200, body: JSON.stringify({ pdfBase64: outB64 }) };
  } catch(err) {
    console.error(err);
    return { statusCode:500, body: JSON.stringify({ error: err.message || String(err) }) };
  }
};