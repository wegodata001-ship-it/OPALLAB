export const MEDIA_MODULES = [
  "ZIRCONIA",
  "TITANIUM",
  "BMMA",
  "DRILLS",
  "IMPLANTS",
  "CLINIC_MATERIALS",
  "OTHER_MATERIALS",
  "DOCTOR_PARTS",
] as const;

export type MediaModule = (typeof MEDIA_MODULES)[number];

export const MEDIA_KINDS: Record<MediaModule, readonly string[]> = {
  ZIRCONIA: ["model", "variant", "color", "height"],
  TITANIUM: ["category", "model", "radius", "size"],
  BMMA: ["category", "model", "color", "height"],
  DRILLS: ["machine", "type", "bit"],
  IMPLANTS: ["brand", "model", "type", "height"],
  CLINIC_MATERIALS: ["item"],
  OTHER_MATERIALS: ["item"],
  DOCTOR_PARTS: ["part"],
};

export const MEDIA_LEAF: Record<MediaModule, string> = {
  ZIRCONIA: "height",
  TITANIUM: "size",
  BMMA: "height",
  DRILLS: "bit",
  IMPLANTS: "height",
  CLINIC_MATERIALS: "item",
  OTHER_MATERIALS: "item",
  DOCTOR_PARTS: "part",
};

export function isMediaModule(value: string | null | undefined): value is MediaModule {
  return Boolean(value && MEDIA_MODULES.includes(value as MediaModule));
}

export function isMediaKind(module: MediaModule, kind: string) {
  return MEDIA_KINDS[module].includes(kind);
}

export function isMediaLeaf(module: MediaModule, kind: string) {
  return MEDIA_LEAF[module] === kind;
}
