import fs from "fs";
import path from "path";

type FontFace = {
  family: string;
  weight: number;
  style: "normal" | "italic";
  file: string;
};

const FONT_FILES: FontFace[] = [
  { family: "Noto Sans Hebrew", weight: 400, style: "normal", file: "NotoSansHebrew.ttf" },
  { family: "Noto Sans Hebrew", weight: 700, style: "normal", file: "NotoSansHebrew.ttf" },
  { family: "Noto Sans Arabic", weight: 400, style: "normal", file: "NotoSansArabic-Regular.ttf" },
  { family: "Noto Sans Arabic", weight: 700, style: "normal", file: "NotoSansArabic-Bold.ttf" },
];

const INTER_WOFF2: FontFace[] = [
  { family: "Inter", weight: 400, style: "normal", file: "inter-latin-400-normal.woff2" },
  { family: "Inter", weight: 600, style: "normal", file: "inter-latin-600-normal.woff2" },
  { family: "Inter", weight: 700, style: "normal", file: "inter-latin-700-normal.woff2" },
];

const cache = new Map<string, string>();

function resolveFontPath(fileName: string): string {
  const assetsPath = path.join(process.cwd(), "assets", "fonts", fileName);
  if (fs.existsSync(assetsPath)) return assetsPath;
  const interPath = path.join(
    process.cwd(),
    "node_modules",
    "@fontsource",
    "inter",
    "files",
    fileName,
  );
  if (fs.existsSync(interPath)) return interPath;
  throw new Error(`Font file not found: ${fileName}`);
}

function fontBase64(fileName: string): string {
  const hit = cache.get(fileName);
  if (hit) return hit;
  const buf = fs.readFileSync(resolveFontPath(fileName));
  const b64 = buf.toString("base64");
  cache.set(fileName, b64);
  return b64;
}

function fontMime(fileName: string): string {
  if (fileName.endsWith(".woff2")) return "font/woff2";
  return "font/ttf";
}

/** Embedded @font-face rules — fonts ship inside the PDF via print. */
export function buildEmbeddedFontCss(): string {
  const rules: string[] = [];
  const allFonts = [...FONT_FILES, ...INTER_WOFF2];
  for (const f of allFonts) {
    const b64 = fontBase64(f.file);
    const mime = fontMime(f.file);
    rules.push(`
@font-face {
  font-family: '${f.family}';
  font-style: ${f.style};
  font-weight: ${f.weight};
  src: url(data:${mime};base64,${b64}) format('${mime === "font/woff2" ? "woff2" : "truetype"}');
  font-display: block;
}`);
  }
  return rules.join("\n");
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
