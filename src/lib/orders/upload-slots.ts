export type OrderUploadSlotId =
  | "face_front"
  | "smile"
  | "side_right"
  | "side_left"
  | "occlusion_front"
  | "occlusion_right"
  | "occlusion_left"
  | "arch_upper"
  | "arch_lower"
  | "scan_upper"
  | "scan_lower"
  | "scan_bite"
  | "extra_files";

export type OrderUploadSlotGroup = "photos" | "scans" | "docs";

export interface OrderUploadSlotDef {
  id: OrderUploadSlotId;
  label: string;
  group: OrderUploadSlotGroup;
  /** All slots accept unlimited files; kept for accept/input wiring. */
  multiple: boolean;
  accept: string;
  /** Prefer camera capture on mobile when choosing "camera". */
  capture?: boolean;
  /** Professional dental guide illustration (null = document icon only). */
  guideSrc: string | null;
  hint: string;
  /** CTA label inside the slot file manager (“הוסף תמונה / סריקה”). */
  addLabel: string;
}

const GUIDE = "/order-upload-guides";

function guide(slotFile: string): string {
  return `${GUIDE}/${slotFile}`;
}

export const ORDER_UPLOAD_SLOTS: OrderUploadSlotDef[] = [
  {
    id: "face_front",
    label: "פנים ישר",
    group: "photos",
    multiple: true,
    accept: "image/*",
    capture: true,
    guideSrc: guide("slot-face-front.png"),
    hint: "לחץ להעלאת תמונה",
    addLabel: "הוסף תמונה",
  },
  {
    id: "smile",
    label: "חיוך",
    group: "photos",
    multiple: true,
    accept: "image/*",
    capture: true,
    guideSrc: guide("slot-smile.png"),
    hint: "לחץ להעלאת תמונה",
    addLabel: "הוסף תמונה",
  },
  {
    id: "side_right",
    label: "צד ימין",
    group: "photos",
    multiple: true,
    accept: "image/*",
    capture: true,
    guideSrc: guide("slot-side-right.png"),
    hint: "לחץ להעלאת תמונה",
    addLabel: "הוסף תמונה",
  },
  {
    id: "side_left",
    label: "צד שמאל",
    group: "photos",
    multiple: true,
    accept: "image/*",
    capture: true,
    guideSrc: guide("slot-side-left.png"),
    hint: "לחץ להעלאת תמונה",
    addLabel: "הוסף תמונה",
  },
  {
    id: "occlusion_front",
    label: "סגר קדמי",
    group: "photos",
    multiple: true,
    accept: "image/*",
    capture: true,
    guideSrc: guide("slot-occlusion-front.png"),
    hint: "לחץ להעלאת תמונה",
    addLabel: "הוסף תמונה",
  },
  {
    id: "occlusion_right",
    label: "סגר צד ימין",
    group: "photos",
    multiple: true,
    accept: "image/*",
    capture: true,
    guideSrc: guide("slot-occlusion-right.png"),
    hint: "לחץ להעלאת תמונה",
    addLabel: "הוסף תמונה",
  },
  {
    id: "occlusion_left",
    label: "סגר צד שמאל",
    group: "photos",
    multiple: true,
    accept: "image/*",
    capture: true,
    guideSrc: guide("slot-occlusion-left.png"),
    hint: "לחץ להעלאת תמונה",
    addLabel: "הוסף תמונה",
  },
  {
    id: "arch_upper",
    label: "קשת עליונה",
    group: "photos",
    multiple: true,
    accept: "image/*",
    capture: true,
    guideSrc: guide("slot-arch-upper.png"),
    hint: "לחץ להעלאת תמונה",
    addLabel: "הוסף תמונה",
  },
  {
    id: "arch_lower",
    label: "קשת תחתונה",
    group: "photos",
    multiple: true,
    accept: "image/*",
    capture: true,
    guideSrc: guide("slot-arch-lower.png"),
    hint: "לחץ להעלאת תמונה",
    addLabel: "הוסף תמונה",
  },
  {
    id: "scan_upper",
    label: "סריקה עליונה",
    group: "scans",
    multiple: true,
    accept: ".stl,.obj,.ply,.dcm,.zip,model/stl,application/zip,image/*",
    guideSrc: guide("slot-scan-upper.png"),
    hint: "לחץ להעלאת סריקה",
    addLabel: "הוסף סריקה",
  },
  {
    id: "scan_lower",
    label: "סריקה תחתונה",
    group: "scans",
    multiple: true,
    accept: ".stl,.obj,.ply,.dcm,.zip,model/stl,application/zip,image/*",
    guideSrc: guide("slot-scan-lower.png"),
    hint: "לחץ להעלאת סריקה",
    addLabel: "הוסף סריקה",
  },
  {
    id: "scan_bite",
    label: "Bite Scan",
    group: "scans",
    multiple: true,
    accept: ".stl,.obj,.ply,.dcm,.zip,model/stl,application/zip,image/*",
    guideSrc: guide("slot-scan-bite.png"),
    hint: "לחץ להעלאת סריקה",
    addLabel: "הוסף סריקה",
  },
  {
    id: "extra_files",
    label: "קבצים נוספים",
    group: "docs",
    multiple: true,
    accept: ".pdf,.zip,.stl,.obj,.ply,.dcm,.jpg,.jpeg,.png,application/pdf,image/*",
    guideSrc: null,
    hint: "לחץ להעלאת קובץ",
    addLabel: "הוסף קובץ",
  },
];

export const SLOT_NOTES_PREFIX = "slot:";

export function slotNotes(slotId: OrderUploadSlotId): string {
  return `${SLOT_NOTES_PREFIX}${slotId}`;
}

export function parseSlotFromNotes(notes?: string | null): OrderUploadSlotId | null {
  if (!notes?.startsWith(SLOT_NOTES_PREFIX)) return null;
  const id = notes.slice(SLOT_NOTES_PREFIX.length) as OrderUploadSlotId;
  return ORDER_UPLOAD_SLOTS.some((s) => s.id === id) ? id : null;
}

export function getSlotDef(id: OrderUploadSlotId): OrderUploadSlotDef {
  return ORDER_UPLOAD_SLOTS.find((s) => s.id === id)!;
}

/** Map stored slotKey / notes back to create-order tile id. */
export function resolveUploadSlotId(input: {
  notes?: string | null;
  slotKey?: string | null;
}): OrderUploadSlotId | null {
  const fromNotes = parseSlotFromNotes(input.notes);
  if (fromNotes) return fromNotes;

  const key = input.slotKey;
  if (!key) return null;

  const bySlotKey: Record<string, OrderUploadSlotId> = {
    FrontFace: "face_front",
    Smile: "smile",
    RightProfile: "side_right",
    LeftProfile: "side_left",
    FrontalOcclusion: "occlusion_front",
    RightBuccal: "occlusion_right",
    LeftBuccal: "occlusion_left",
    UpperOcclusal: "arch_upper",
    LowerOcclusal: "arch_lower",
    UpperScan: "scan_upper",
    LowerScan: "scan_lower",
    BiteScan: "scan_bite",
    Other: "extra_files",
    General: "extra_files",
  };
  return bySlotKey[key] ?? null;
}
