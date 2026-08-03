import fs from "fs";
import path from "path";
// pdfmake 0.3 ships as a singleton instance; @types lag behind virtualfs APIs.
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

/** Register embedded fonts once (vfs — no local FS reads during createPdf). */
export function ensureAttendancePdfFonts(): typeof pdfmake {
  if (!initialized) {
    const files = [
      "NotoSansHebrew-Regular.ttf",
      "NotoSansHebrew-Bold.ttf",
      "NotoSansArabic-Regular.ttf",
      "NotoSansArabic-Bold.ttf",
      "NotoSans-Regular.ttf",
      "NotoSans-Bold.ttf",
    ] as const;

    for (const fileName of files) {
      pdfmake.virtualfs.writeFileSync(fileName, readFont(fileName));
    }

    pdfmake.setFonts({
      NotoHebrew: {
        normal: "NotoSansHebrew-Regular.ttf",
        bold: "NotoSansHebrew-Bold.ttf",
        italics: "NotoSansHebrew-Regular.ttf",
        bolditalics: "NotoSansHebrew-Bold.ttf",
      },
      NotoArabic: {
        normal: "NotoSansArabic-Regular.ttf",
        bold: "NotoSansArabic-Bold.ttf",
        italics: "NotoSansArabic-Regular.ttf",
        bolditalics: "NotoSansArabic-Bold.ttf",
      },
      NotoSans: {
        normal: "NotoSans-Regular.ttf",
        bold: "NotoSans-Bold.ttf",
        italics: "NotoSans-Regular.ttf",
        bolditalics: "NotoSans-Bold.ttf",
      },
    });

    pdfmake.setUrlAccessPolicy(() => false);
    pdfmake.setLocalAccessPolicy(() => false);
    initialized = true;
  }
  return pdfmake;
}

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
