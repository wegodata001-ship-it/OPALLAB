import bidiFactory from "bidi-js";

const bidi = bidiFactory();

/** Reorder logical Unicode text to visual order for pdfmake (no native BiDi). */
export function visualText(text: string, baseDir: "rtl" | "ltr" = "rtl"): string {
  if (!text) return "";
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

export function pickFont(text: string): "NotoHebrew" | "NotoArabic" | "NotoSans" {
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text)) return "NotoArabic";
  if (/[\u0590-\u05FF]/.test(text)) return "NotoHebrew";
  return "NotoSans";
}

export function rtlText(
  text: string,
  opts?: { bold?: boolean; fontSize?: number; color?: string; link?: string },
): {
  text: string;
  font: string;
  alignment: "right";
  bold?: boolean;
  fontSize?: number;
  color?: string;
  link?: string;
  decoration?: "underline";
} {
  const font = pickFont(text);
  const baseDir = font === "NotoSans" ? "ltr" : "rtl";
  return {
    text: visualText(text, baseDir),
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

export function ltrText(
  text: string,
  opts?: { bold?: boolean; fontSize?: number; color?: string; link?: string },
): {
  text: string;
  font: string;
  alignment: "left";
  bold?: boolean;
  fontSize?: number;
  color?: string;
  link?: string;
  decoration?: "underline";
} {
  return {
    text,
    font: "NotoSans",
    alignment: "left",
    ...(opts?.bold ? { bold: true } : {}),
    ...(opts?.fontSize != null ? { fontSize: opts.fontSize } : {}),
    ...(opts?.color ? { color: opts.color } : {}),
    ...(opts?.link
      ? { link: opts.link, color: opts.color ?? "#0369a1", decoration: "underline" as const }
      : {}),
  };
}
