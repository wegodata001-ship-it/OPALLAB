import bidiFactory from "bidi-js";
import { PDF_DEFAULT_FONT } from "@/lib/pdf/fonts";

const bidi = bidiFactory();

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const HEBREW_RE = /[\u0590-\u05FF]/;
/** Pure LTR tokens (times, dates, decimals, latin ids) — do not reverse. */
const LTR_TOKEN_RE = /^[\d./:\-\s,*+|%]+$|^[A-Za-z0-9@._+\-/#]+$/;

/** Reorder logical Unicode → visual order for pdfmake (no native BiDi engine). */
export function visualText(text: string, baseDir: "rtl" | "ltr" = "rtl"): string {
  if (!text) return "";
  if (LTR_TOKEN_RE.test(text.trim())) return text;
  const levels = bidi.getEmbeddingLevels(text, baseDir);
  const chars = Array.from(text);
  const mirrored = bidi.getMirroredCharactersMap(text, levels);
  for (const [index, ch] of mirrored) {
    chars[index] = ch;
  }
  const flips = bidi.getReorderSegments(text, levels);
  for (const [start, end] of flips) {
    const slice = chars.slice(start, end + 1).reverse();
    for (let i = 0; i < slice.length; i++) {
      chars[start + i] = slice[i]!;
    }
  }
  return chars.join("");
}

export type PdfFontName = "Rubik" | "Heebo" | "NotoHebrew" | "NotoArabic";

export function pickFont(text: string): PdfFontName {
  const arabic = (text.match(ARABIC_RE) || []).length;
  const hebrew = (text.match(HEBREW_RE) || []).length;
  if (arabic > 0 && arabic >= hebrew) return "NotoArabic";
  return PDF_DEFAULT_FONT;
}

export type PdfTextNode = {
  text: string;
  font: string;
  alignment: "right" | "left" | "center";
  bold?: boolean;
  fontSize?: number;
  color?: string;
  link?: string;
  decoration?: "underline";
};

export function rtlText(
  text: string,
  opts?: { bold?: boolean; fontSize?: number; color?: string; link?: string },
): PdfTextNode {
  const font = pickFont(text);
  return {
    text: visualText(text, "rtl"),
    font,
    alignment: "right",
    ...(opts?.bold ? { bold: true } : {}),
    ...(opts?.fontSize != null ? { fontSize: opts.fontSize } : {}),
    ...(opts?.color ? { color: opts.color } : {}),
    ...(opts?.link
      ? { link: opts.link, color: opts.color ?? "#0369a1", decoration: "underline" as const }
      : {}),
  };
}

/** Numbers / times / dates — keep logical order, align right in RTL tables. */
export function ltrText(
  text: string,
  opts?: {
    bold?: boolean;
    fontSize?: number;
    color?: string;
    link?: string;
    align?: "right" | "left" | "center";
  },
): PdfTextNode {
  return {
    text,
    font: PDF_DEFAULT_FONT,
    alignment: opts?.align ?? "right",
    ...(opts?.bold ? { bold: true } : {}),
    ...(opts?.fontSize != null ? { fontSize: opts.fontSize } : {}),
    ...(opts?.color ? { color: opts.color } : {}),
    ...(opts?.link
      ? { link: opts.link, color: opts.color ?? "#0369a1", decoration: "underline" as const }
      : {}),
  };
}

export function autoText(
  text: string,
  opts?: { bold?: boolean; fontSize?: number; color?: string; link?: string },
): PdfTextNode {
  if (!text || text === "—") return rtlText("—", opts);
  if (LTR_TOKEN_RE.test(text.trim())) return ltrText(text, opts);
  return rtlText(text, opts);
}
