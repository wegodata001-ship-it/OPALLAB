import fs from "fs";
import path from "path";

// pdfmake 0.3 ships as a singleton; @types lag behind virtualfs APIs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmake = require("pdfmake") as {
  virtualfs: { writeFileSync: (name: string, content: Buffer) => void };
  setFonts: (fonts: Record<string, Record<string, string>>) => void;
  setUrlAccessPolicy: (cb: (url: string) => boolean) => void;
  setLocalAccessPolicy: (cb: (path: string) => boolean) => void;
  createPdf: (doc: unknown) => { getBuffer: () => Promise<Buffer> };
};

let initialized = false;

function readFont(name: string): Buffer {
  return fs.readFileSync(path.join(process.cwd(), "assets", "fonts", name));
}

/**
 * Shared PDF font registry for the whole app.
 * Rubik: Hebrew + Latin (+ Arabic coverage in variable face)
 * NotoArabic: full Arabic shaping/glyphs
 */
export function ensurePdfFonts(): typeof pdfmake {
  if (!initialized) {
    const files = [
      "Rubik.ttf",
      "Heebo.ttf",
      "NotoSansHebrew.ttf",
      "NotoSansArabic-Regular.ttf",
      "NotoSansArabic-Bold.ttf",
    ] as const;

    for (const fileName of files) {
      pdfmake.virtualfs.writeFileSync(fileName, readFont(fileName));
    }

    pdfmake.setFonts({
      Rubik: {
        normal: "Rubik.ttf",
        bold: "Rubik.ttf",
        italics: "Rubik.ttf",
        bolditalics: "Rubik.ttf",
      },
      Heebo: {
        normal: "Heebo.ttf",
        bold: "Heebo.ttf",
        italics: "Heebo.ttf",
        bolditalics: "Heebo.ttf",
      },
      NotoHebrew: {
        normal: "NotoSansHebrew.ttf",
        bold: "NotoSansHebrew.ttf",
        italics: "NotoSansHebrew.ttf",
        bolditalics: "NotoSansHebrew.ttf",
      },
      NotoArabic: {
        normal: "NotoSansArabic-Regular.ttf",
        bold: "NotoSansArabic-Bold.ttf",
        italics: "NotoSansArabic-Regular.ttf",
        bolditalics: "NotoSansArabic-Bold.ttf",
      },
    });

    pdfmake.setUrlAccessPolicy(() => false);
    pdfmake.setLocalAccessPolicy(() => false);
    initialized = true;
  }
  return pdfmake;
}

export const PDF_DEFAULT_FONT = "Rubik";

export function loadLogoDataUrl(): string | null {
  const candidates = [
    path.join(process.cwd(), "public", "android-chrome-192x192.png"),
    path.join(process.cwd(), "public", "apple-touch-icon.png"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const buf = fs.readFileSync(file);
    return `data:image/png;base64,${buf.toString("base64")}`;
  }
  return null;
}
