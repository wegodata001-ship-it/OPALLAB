import type { OrderUploadSlotId } from "@/lib/orders/upload-slots";

/** Storage folder keys under Orders/{serial}/… */
export type OrderFileCategory =
  | "ClinicalPhotos"
  | "Scans"
  | "Radiographs"
  | "Prescription"
  | "Documents"
  | "CAD"
  | "Manufacturing"
  | "Delivery"
  | "Other";

export const ORDER_FILE_CATEGORIES: OrderFileCategory[] = [
  "ClinicalPhotos",
  "Scans",
  "Radiographs",
  "Prescription",
  "Documents",
  "CAD",
  "Manufacturing",
  "Delivery",
  "Other",
];

export const ORDER_FILE_CATEGORY_LABELS: Record<OrderFileCategory, string> = {
  ClinicalPhotos: "תמונות קליניות",
  Scans: "סריקות תוך־פה",
  Radiographs: "צילומי רנטגן",
  Prescription: "מרשמים / הפניות",
  Documents: "מסמכים",
  CAD: "קבצי תכנון (CAD)",
  Manufacturing: "ייצור (CAM)",
  Delivery: "משלוח ואריזה",
  Other: "קבצים נוספים",
};

/** Subfolder / slot key inside a category (English path segment). */
export type OrderFileSlotKey =
  | "FrontFace"
  | "Smile"
  | "LeftProfile"
  | "RightProfile"
  | "FrontalOcclusion"
  | "LeftBuccal"
  | "RightBuccal"
  | "UpperOcclusal"
  | "LowerOcclusal"
  | "UpperScan"
  | "LowerScan"
  | "BiteScan"
  | "Panoramic"
  | "CBCT"
  | "Cephalometric"
  | "Periapical"
  | "Bitewing"
  | "OcclusalXRay"
  | "DicomSeries"
  | "Prescription"
  | "Referral"
  | "WorkOrder"
  | "SignedOrder"
  | "General"
  | "Exocad"
  | "ThreeShape"
  | "DentalWings"
  | "Mesh"
  | "CNC"
  | "Milling"
  | "Printing"
  | "CAM"
  | "PackagingPhoto"
  | "ShippingPhoto"
  | "DeliveryConfirm"
  | "Other";

export const ORDER_FILE_SLOT_LABELS: Record<OrderFileSlotKey, string> = {
  FrontFace: "פנים ישר",
  Smile: "חיוך",
  LeftProfile: "צד שמאל",
  RightProfile: "צד ימין",
  FrontalOcclusion: "סגר קדמי",
  LeftBuccal: "סגר צד שמאל",
  RightBuccal: "סגר צד ימין",
  UpperOcclusal: "קשת עליונה",
  LowerOcclusal: "קשת תחתונה",
  UpperScan: "סריקה עליונה",
  LowerScan: "סריקה תחתונה",
  BiteScan: "Bite Scan",
  Panoramic: "פנורמי (OPG)",
  CBCT: "CBCT",
  Cephalometric: "צפלומטרי",
  Periapical: "פריאפיקלי",
  Bitewing: "Bitewing",
  OcclusalXRay: "צילום סגר",
  DicomSeries: "סדרת DICOM",
  Prescription: "מרשם",
  Referral: "הפניה",
  WorkOrder: "הזמנת עבודה",
  SignedOrder: "הזמנה חתומה",
  General: "כללי",
  Exocad: "Exocad",
  ThreeShape: "3Shape",
  DentalWings: "Dental Wings",
  Mesh: "Mesh",
  CNC: "CNC",
  Milling: "כרסום",
  Printing: "הדפסה",
  CAM: "CAM",
  PackagingPhoto: "תמונת אריזה",
  ShippingPhoto: "תמונת משלוח",
  DeliveryConfirm: "אישור מסירה",
  Other: "אחר",
};

export type SlotRouting = {
  category: OrderFileCategory;
  slotKey: OrderFileSlotKey;
  /** Unique logical key for versioning (one current file per order+slotKey when set). */
  versionKey: string;
};

/** Map create-order UI slots → storage taxonomy. */
export const UPLOAD_SLOT_ROUTING: Record<OrderUploadSlotId, SlotRouting> = {
  face_front: { category: "ClinicalPhotos", slotKey: "FrontFace", versionKey: "clinical:FrontFace" },
  smile: { category: "ClinicalPhotos", slotKey: "Smile", versionKey: "clinical:Smile" },
  side_right: { category: "ClinicalPhotos", slotKey: "RightProfile", versionKey: "clinical:RightProfile" },
  side_left: { category: "ClinicalPhotos", slotKey: "LeftProfile", versionKey: "clinical:LeftProfile" },
  occlusion_front: { category: "ClinicalPhotos", slotKey: "FrontalOcclusion", versionKey: "clinical:FrontalOcclusion" },
  occlusion_right: { category: "ClinicalPhotos", slotKey: "RightBuccal", versionKey: "clinical:RightBuccal" },
  occlusion_left: { category: "ClinicalPhotos", slotKey: "LeftBuccal", versionKey: "clinical:LeftBuccal" },
  arch_upper: { category: "ClinicalPhotos", slotKey: "UpperOcclusal", versionKey: "clinical:UpperOcclusal" },
  arch_lower: { category: "ClinicalPhotos", slotKey: "LowerOcclusal", versionKey: "clinical:LowerOcclusal" },
  scan_upper: { category: "Scans", slotKey: "UpperScan", versionKey: "scan:UpperScan" },
  scan_lower: { category: "Scans", slotKey: "LowerScan", versionKey: "scan:LowerScan" },
  scan_bite: { category: "Scans", slotKey: "BiteScan", versionKey: "scan:BiteScan" },
  extra_files: { category: "Other", slotKey: "Other", versionKey: "other:misc" },
};

export function sanitizePathSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "file";
}

/**
 * Orders/{serial}/{Category}/{SlotKey}/v{N}/{fileName}
 */
export function buildStructuredOrderFilePath(input: {
  serialNumber: string;
  category: OrderFileCategory;
  slotKey: OrderFileSlotKey;
  version: number;
  fileName: string;
}): string {
  const serial = sanitizePathSegment(input.serialNumber);
  const fileName = sanitizePathSegment(input.fileName);
  return `Orders/${serial}/${input.category}/${input.slotKey}/v${input.version}/${fileName}`;
}

export function inferCategoryFromFileName(fileName: string): SlotRouting {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const lower = fileName.toLowerCase().replace(/[\s_-]+/g, "");

  const isMesh =
    ["stl", "ply", "obj", "glb", "gltf"].includes(ext) ||
    lower.includes("scan") ||
    lower.includes("bite") ||
    lower.includes("jaw");

  if (isMesh) {
    // Auto-detect Upper / Lower / Bite from common dental filenames
    if (
      lower.includes("upper") ||
      lower.includes("maxilla") ||
      lower.includes("upperjaw") ||
      lower.includes("עליון") ||
      lower.includes("עליונה")
    ) {
      return { category: "Scans", slotKey: "UpperScan", versionKey: "scan:UpperScan" };
    }
    if (
      lower.includes("lower") ||
      lower.includes("mandible") ||
      lower.includes("lowerjaw") ||
      lower.includes("תחתון") ||
      lower.includes("תחתונה")
    ) {
      return { category: "Scans", slotKey: "LowerScan", versionKey: "scan:LowerScan" };
    }
    if (
      lower.includes("bite") ||
      lower.includes("bitescan") ||
      lower.includes("occlusion") ||
      lower.includes("סגר")
    ) {
      return { category: "Scans", slotKey: "BiteScan", versionKey: "scan:BiteScan" };
    }
    return {
      category: "Scans",
      slotKey: "UpperScan",
      versionKey: `scan:file:${sanitizePathSegment(fileName)}`,
    };
  }

  if (ext === "dcm" || ext === "dicom" || lower.includes("opg") || lower.includes("cbct") || lower.includes("ceph")) {
    if (lower.includes("cbct")) return { category: "Radiographs", slotKey: "CBCT", versionKey: "radio:CBCT" };
    if (lower.includes("ceph")) return { category: "Radiographs", slotKey: "Cephalometric", versionKey: "radio:Cephalometric" };
    if (lower.includes("opg") || lower.includes("pano")) {
      return { category: "Radiographs", slotKey: "Panoramic", versionKey: "radio:Panoramic" };
    }
    return { category: "Radiographs", slotKey: "DicomSeries", versionKey: "radio:DicomSeries" };
  }

  if (lower.includes("prescription") || lower.includes("מרשם")) {
    return { category: "Prescription", slotKey: "Prescription", versionKey: "rx:Prescription" };
  }
  if (lower.includes("referral") || lower.includes("הפניה")) {
    return { category: "Prescription", slotKey: "Referral", versionKey: "rx:Referral" };
  }

  if (["pdf", "doc", "docx", "xls", "xlsx", "txt", "csv", "rtf"].includes(ext)) {
    return { category: "Documents", slotKey: "General", versionKey: `docs:${sanitizePathSegment(fileName)}` };
  }

  if (lower.includes("exocad") || ext === "dentalproject") {
    return { category: "CAD", slotKey: "Exocad", versionKey: "cad:Exocad" };
  }
  if (lower.includes("3shape") || ext === "3ox") {
    return { category: "CAD", slotKey: "ThreeShape", versionKey: "cad:ThreeShape" };
  }

  if (["jpg", "jpeg", "png", "webp", "heic", "tiff", "tif", "bmp"].includes(ext)) {
    return { category: "ClinicalPhotos", slotKey: "Other", versionKey: `clinical:file:${sanitizePathSegment(fileName)}` };
  }

  return { category: "Other", slotKey: "Other", versionKey: `other:${sanitizePathSegment(fileName)}` };
}

export function routingFromUploadSlot(slotId?: string | null, fileName?: string): SlotRouting {
  if (slotId && slotId in UPLOAD_SLOT_ROUTING) {
    const routed = UPLOAD_SLOT_ROUTING[slotId as OrderUploadSlotId];
    // extra_files: try smart infer from filename
    if (slotId === "extra_files" && fileName) {
      return inferCategoryFromFileName(fileName);
    }
    // Multi-file slots: version by slot + file name (same name → conflict / new version)
    if (fileName) {
      return {
        ...routed,
        versionKey: `${routed.versionKey}:${sanitizePathSegment(fileName)}`,
      };
    }
    return routed;
  }
  if (fileName) return inferCategoryFromFileName(fileName);
  return { category: "Other", slotKey: "Other", versionKey: "other:unknown" };
}

/** Notes tag stored on OrderFile when uploaded from category card UI. */
export const CATEGORY_NOTES_PREFIX = "category:";

export function categoryNotes(category: OrderFileCategory): string {
  return `${CATEGORY_NOTES_PREFIX}${category}`;
}

export function parseCategoryFromNotes(notes?: string | null): OrderFileCategory | null {
  if (!notes?.startsWith(CATEGORY_NOTES_PREFIX)) return null;
  const cat = notes.slice(CATEGORY_NOTES_PREFIX.length) as OrderFileCategory;
  return ORDER_FILE_CATEGORIES.includes(cat) ? cat : null;
}

/** Default slotKey when uploading directly to a category card. */
export function categoryDefaultSlotKey(category: OrderFileCategory): OrderFileSlotKey {
  const map: Partial<Record<OrderFileCategory, OrderFileSlotKey>> = {
    ClinicalPhotos: "Other",
    Scans: "UpperScan",
    Radiographs: "Panoramic",
    Prescription: "Prescription",
    Documents: "General",
    CAD: "Exocad",
    Manufacturing: "CAM",
    Delivery: "PackagingPhoto",
    Other: "Other",
  };
  return map[category] ?? "General";
}

/** File input accept string per category card. */
export function categoryAccept(category: OrderFileCategory): string {
  switch (category) {
    case "ClinicalPhotos":
      return "image/*,.heic,.HEIC,.jpg,.jpeg,.png,.webp,.tif,.tiff,.bmp";
    case "Scans":
      return ".stl,.obj,.ply,.zip,.glb,.gltf,model/*,application/zip";
    case "Radiographs":
      return ".dcm,.dicom,image/*,.jpg,.jpeg,.png,.tif,.tiff";
    case "Prescription":
      return "image/*,.pdf,.jpg,.jpeg,.png,.heic,.HEIC";
    case "Documents":
      return ".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.rtf,application/pdf";
    case "CAD":
      return ".stl,.obj,.ply,.zip,.dentalproject,.3ox,model/*,application/zip";
    case "Manufacturing":
      return ".stl,.obj,.ply,.zip,image/*,.pdf,application/zip";
    case "Delivery":
      return "image/*,.pdf,.jpg,.jpeg,.png,.heic,.HEIC";
    case "Other":
    default:
      return ".stl,.obj,.ply,.pdf,.zip,.rar,.jpg,.jpeg,.png,.heic,.HEIC,.dcm,.mp4,.mov,image/*,video/*,application/pdf,application/zip,*/*";
  }
}

/** Categories that show a camera capture button (images). */
export function categorySupportsCamera(category: OrderFileCategory): boolean {
  return (
    category === "ClinicalPhotos" ||
    category === "Radiographs" ||
    category === "Prescription" ||
    category === "Delivery" ||
    category === "Manufacturing"
  );
}
