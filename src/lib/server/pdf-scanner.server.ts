import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// Use require() for CommonJS-only packages inside an ESM project
const require = createRequire(import.meta.url);

export interface PdfScanItem {
  fileName: string;
  filePath: string;
  qrFound: boolean;
  qrText: string;
  pageNumber: number;
  error?: string;
}

// Scan all PDF files in a directory and extract QR codes from every page.
// Returns one item per QR code found (a single PDF may contain multiple pages/QRs).
export async function scanDirectoryForQr(dirPath: string): Promise<PdfScanItem[]> {
  const resolved = path.resolve(dirPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory not found: ${resolved}`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`Path is not a directory: ${resolved}`);
  }

  const files = fs.readdirSync(resolved).filter((f) => f.toLowerCase().endsWith(".pdf"));

  if (files.length === 0) {
    return [];
  }

  const results: PdfScanItem[] = [];

  for (const fileName of files) {
    const filePath = path.join(resolved, fileName);
    try {
      const items = await extractQrFromPdf(filePath, fileName);
      if (items.length === 0) {
        results.push({ fileName, filePath, qrFound: false, qrText: "", pageNumber: 0 });
      } else {
        results.push(...items);
      }
    } catch (err) {
      results.push({
        fileName,
        filePath,
        qrFound: false,
        qrText: "",
        pageNumber: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

async function extractQrFromPdf(filePath: string, fileName: string): Promise<PdfScanItem[]> {
  // Lazy-require to avoid issues at module load time
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pdfjsLib: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let createCanvas: any;
  let jsQR: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;

  try {
    pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
    ({ createCanvas } = require("canvas"));
    jsQR = require("jsqr");
  } catch (e) {
    throw new Error(
      `PDF scanning requires additional packages. Run: npm install pdfjs-dist canvas jsqr\n${e}`,
    );
  }

  // Disable worker for Node.js (not needed for server-side rendering)
  pdfjsLib.GlobalWorkerOptions.workerSrc = "";

  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjsLib.getDocument({ data, disableWorker: true }).promise;

  const found: PdfScanItem[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const scale = 2.5; // higher scale = better QR detection
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");

    await page.render({ canvasContext: ctx, viewport }).promise;

    const imageData = ctx.getImageData(0, 0, Math.floor(viewport.width), Math.floor(viewport.height));
    const code = jsQR(
      new Uint8ClampedArray(imageData.data.buffer),
      Math.floor(viewport.width),
      Math.floor(viewport.height),
    );

    if (code?.data) {
      found.push({
        fileName,
        filePath,
        qrFound: true,
        qrText: code.data,
        pageNumber: pageNum,
      });
    }
  }

  return found;
}
