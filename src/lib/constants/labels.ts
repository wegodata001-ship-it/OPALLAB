import type {
  UserRole,
  OrderStatus,
  Gender,
  InventoryType,
  FileType,
  PaymentStatus,
  AttendanceMethod,
  PaymentMethod,
  SalaryType,
} from "@/lib/types";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "מנהל",
  SECRETARY: "מזכירות",
  DESIGNER: "מעצב",
  PRINTER: "הדפסה תלת-ממד",
  MILLING: "חריטה",
  PROCESSING: "עיבוד",
  FINISH: "גימור",
  PACKAGING: "אריזה",
  DOCTOR: "רופא",
  OWNER: "בעלים",
  ASSISTANT: "סייעת",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: "טיוטה",
  RECEIVED: "חדשה",
  FILES_ATTACHED: "קבצים צורפו",
  DESIGN: "עיצוב",
  PRINTING_3D: "הדפסה תלת-ממד",
  MILLING: "חריטה",
  PROCESSING: "עיבוד",
  FINISH: "גימור",
  PACKAGING: "אריזה",
  SHIPPED: "מוכנה למשלוח",
  DELIVERED: "נמסרה",
  CANCELLED: "בוטלה",
  DELETED: "נמחקה",
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  DRAFT: "bg-slate-50 text-slate-500",
  RECEIVED: "bg-slate-100 text-slate-700",
  FILES_ATTACHED: "bg-blue-100 text-blue-700",
  DESIGN: "bg-purple-100 text-purple-700",
  PRINTING_3D: "bg-cyan-100 text-cyan-700",
  MILLING: "bg-indigo-100 text-indigo-700",
  PROCESSING: "bg-amber-100 text-amber-700",
  FINISH: "bg-orange-100 text-orange-700",
  PACKAGING: "bg-teal-100 text-teal-700",
  SHIPPED: "bg-green-100 text-green-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
  DELETED: "bg-slate-200 text-slate-600",
};

export const MATERIAL_TYPE_LABELS: Record<string, string> = {
  TEMPORARY: "זמני",
  DENTURE: "תותבת",
  PFM: "PFM",
  ZIRCONIA: "זירקוניה",
  TITANIUM: "טיטניום",
  MODEL: "מודל",
};

export const WORK_TYPE_LABELS: Record<string, string> = {
  SCREWED: "מוברג",
  ABUTMENTS: "מבנים",
  MOCKUP: "Mockup",
  BAR: "באר",
  NIGHT_GUARD_WHITENING_MILLED: "סד לילה / הלבנה / חרוט",
};

export const GENDER_LABELS: Record<Gender, string> = {
  MALE: "ז",
  FEMALE: "נ",
};

export const INVENTORY_TYPE_LABELS: Record<string, string> = {
  RAW_MATERIALS: "חומרי גלם ושוטף",
  PARTS_COMPONENTS: "חלקים ורכיבים",
  OWNER_ASSETS: "מלאי בעלים",
  CONSUMABLES: "צריכה שוטפת",
};

export const FILE_TYPE_LABELS: Record<FileType, string> = {
  PLX: "PLX",
  STL: "STL",
  OBJ: "OBJ",
  PLY: "PLY",
  OTHER_3D: "3D אחר",
  IMAGE: "תמונה",
  DOCUMENT: "מסמך",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "ממתין",
  PARTIAL: "חלקי",
  PAID: "שולם",
  OVERDUE: "באיחור",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "מזומן",
  CHECK: "צ'ק",
  TRANSFER: "העברה בנקאית",
  CREDIT_CARD: "אשראי",
};

export const SALARY_TYPE_LABELS: Record<SalaryType, string> = {
  MONTHLY: "גלובלי (חודשי)",
  HOURLY: "שעתי",
};

export const ATTENDANCE_METHOD_LABELS: Record<AttendanceMethod, string> = {
  NFC: "עמדת NFC (ישן)",
  MANUAL: "ידני",
  GEOFENCE_AUTO: "גיאופנס אוטומטי",
  WIFI: "רשת WiFi (ישן)",
  GPS: "GPS (ישן)",
  TRUSTED_DEVICE: "שער QR · מכשיר מאושר",
};

export const WORKFLOW_STEPS: OrderStatus[] = [
  "RECEIVED",
  "FILES_ATTACHED",
  "DESIGN",
  "PRINTING_3D",
  "MILLING",
  "PROCESSING",
  "FINISH",
  "PACKAGING",
  "SHIPPED",
  "DELIVERED",
];

export const LAB_INFO = {
  name: "OPAL LAB",
  fullName: "OPAL LAB DENTAL LABORATORY",
  subtitle: "מעבדת שיניים דיגיטלית",
  manager: "אמיר אל חלאילה",
  title: "טכנאי שיניים אומן",
  businessId: "ע.מ 314861931",
  email: "opallab20@gmail.com",
  phone: "0546246608",
  location: "סחנין",
};

export const UPPER_TEETH = [
  [18, 17, 16, 15, 14, 13, 12, 11],
  [21, 22, 23, 24, 25, 26, 27, 28],
];

export const LOWER_TEETH = [
  [48, 47, 46, 45, 44, 43, 42, 41],
  [31, 32, 33, 34, 35, 36, 37, 38],
];
