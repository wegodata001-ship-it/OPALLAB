import type {
  User,
  Doctor,
  Patient,
  Order,
  OrderFile,
  OrderStatusHistory,
  InventoryItem,
  InventoryMovement,
  InventoryCategory,
  Shipment,
  Payment,
  AttendanceRecord,
  Courier,
  LabSettings,
} from "@/lib/types";

const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

export const defaultLabSettings: LabSettings = {
  allowedWifiSsids: ["OPAL-LAB", "OPAL_WIFI"],
  wifiAttendanceEnabled: true,
  requireGeofence: true,
  attendanceCode: "opal1234",
};

export const mockUsers: User[] = [
  { id: "u1", username: "amir", password: "1234", email: "amir@opallab.co.il", name: "אמיר אל חלאילה", phone: "0546246608", role: "OWNER", nfcTagId: "NFC-001", address: "סחנין", salary: null, salaryType: "MONTHLY", hourlyRate: null, color: "#c9a227", isActive: true, createdAt: daysAgo(365), updatedAt: now },
  { id: "u2", username: "sara", password: "1234", email: "secretary@opallab.co.il", name: "סארה חאג'", phone: "0501234567", role: "SECRETARY", nfcTagId: "NFC-002", address: "סחנין", salary: 6500, salaryType: "MONTHLY", hourlyRate: null, color: "#3b82f6", isActive: true, createdAt: daysAgo(200), updatedAt: now },
  { id: "u3", username: "mohamed", password: "1234", email: "designer@opallab.co.il", name: "מוחמד נסאר", phone: "0502345678", role: "DESIGNER", nfcTagId: "NFC-003", address: "סחנין", salary: 8500, salaryType: "MONTHLY", hourlyRate: null, color: "#8b5cf6", isActive: true, createdAt: daysAgo(180), updatedAt: now },
  { id: "u4", username: "ahmad", password: "1234", email: "printer@opallab.co.il", name: "אחמד יוסף", phone: "0503456789", role: "PRINTER", nfcTagId: "NFC-004", address: "סחנין", salary: null, salaryType: "HOURLY", hourlyRate: 45, color: "#06b6d4", isActive: true, createdAt: daysAgo(150), updatedAt: now },
  { id: "u5", username: "yousef", password: "1234", email: "milling@opallab.co.il", name: "יוסף כנעאן", phone: "0504567890", role: "MILLING", nfcTagId: "NFC-005", address: "סחנין", salary: 7800, salaryType: "MONTHLY", hourlyRate: null, color: "#6366f1", isActive: true, createdAt: daysAgo(120), updatedAt: now },
  { id: "u6", username: "omar", password: "1234", email: "processing@opallab.co.il", name: "עומר שמא", phone: "0505678901", role: "PROCESSING", nfcTagId: "NFC-006", address: "סחנין", salary: null, salaryType: "HOURLY", hourlyRate: 42, color: "#f59e0b", isActive: true, createdAt: daysAgo(100), updatedAt: now },
  { id: "u7", username: "riad", password: "1234", email: "finish@opallab.co.il", name: "ריאד חלבי", phone: "0506789012", role: "FINISH", nfcTagId: "NFC-007", address: "סחנין", salary: 7000, salaryType: "MONTHLY", hourlyRate: null, color: "#f97316", isActive: true, createdAt: daysAgo(90), updatedAt: now },
  { id: "u8", username: "admin", password: "1234", email: "admin@opallab.co.il", name: "מנהל מערכת", phone: "0507890123", role: "ADMIN", nfcTagId: "NFC-008", address: "סחנין", salary: null, salaryType: "MONTHLY", hourlyRate: null, color: "#64748b", isActive: true, createdAt: daysAgo(365), updatedAt: now },
  { id: "u9", username: "drmansour", password: "1234", email: "dr.mansour@clinic.co.il", name: 'ד"ר אחמד מנסור', phone: "04-1234567", role: "DOCTOR", nfcTagId: null, address: "סחנין", salary: null, salaryType: null, hourlyRate: null, color: "#10b981", isActive: true, createdAt: daysAgo(300), updatedAt: now },
  { id: "u10", username: "drkhatib", password: "1234", email: "dr.khatib@clinic.co.il", name: 'ד"ר סאמיה חטיב', phone: "04-2345678", role: "DOCTOR", nfcTagId: null, address: "עכו", salary: null, salaryType: null, hourlyRate: null, color: "#14b8a6", isActive: true, createdAt: daysAgo(250), updatedAt: now },
];

export const mockDoctors: Doctor[] = [
  { id: "d1", userId: "u9", name: 'ד"ר אחמד מנסור', clinic: "מרפאת שיניים מנסור", phone: "04-1234567", email: "dr.mansour@clinic.co.il", address: "סחנין", balance: -2500, paymentStatus: "PARTIAL", isActive: true, createdAt: daysAgo(300), updatedAt: now },
  { id: "d2", userId: "u10", name: 'ד"ר סאמיה חטיב', clinic: "מרפאת חטיב", phone: "04-2345678", email: "dr.khatib@clinic.co.il", address: "עכו", balance: 0, paymentStatus: "PAID", isActive: true, createdAt: daysAgo(250), updatedAt: now },
  { id: "d3", userId: null, name: 'ד"ר יוסף אבו ראס', clinic: "מרפאת אבו ראס", phone: "04-3456789", email: "dr.aburas@clinic.co.il", address: "נצרת", balance: -4800, paymentStatus: "OVERDUE", isActive: true, createdAt: daysAgo(200), updatedAt: now },
  { id: "d4", userId: null, name: 'ד"ר לינה ח\'ורי', clinic: "מרפאת ח\'ורי", phone: "04-4567890", email: "dr.khoury@clinic.co.il", address: "טבריה", balance: -1200, paymentStatus: "PENDING", isActive: true, createdAt: daysAgo(150), updatedAt: now },
  { id: "d5", userId: null, name: 'ד"ר מוחמד זועבי', clinic: "מרפאת זועבי", phone: "04-5678901", email: "dr.zoabi@clinic.co.il", address: "שפרעם", balance: 0, paymentStatus: "PAID", isActive: true, createdAt: daysAgo(100), updatedAt: now },
];

export const mockPatients: Patient[] = [
  { id: "p1", name: "פאטמה אבו סאלח", age: 45, gender: "FEMALE", createdAt: daysAgo(10), updatedAt: now },
  { id: "p2", name: "חליל מנסור", age: 62, gender: "MALE", createdAt: daysAgo(8), updatedAt: now },
  { id: "p3", name: "נור חטיב", age: 38, gender: "FEMALE", createdAt: daysAgo(5), updatedAt: now },
  { id: "p4", name: "סאלח אבו ראס", age: 55, gender: "MALE", createdAt: daysAgo(3), updatedAt: now },
  { id: "p5", name: "מירא ח\'ורי", age: 28, gender: "FEMALE", createdAt: daysAgo(2), updatedAt: now },
  { id: "p6", name: "עאדל זועבי", age: 41, gender: "MALE", createdAt: daysAgo(1), updatedAt: now },
  { id: "p7", name: "רים נסאר", age: 33, gender: "FEMALE", createdAt: daysAgo(1), updatedAt: now },
  { id: "p8", name: "כמאל שמא", age: 50, gender: "MALE", createdAt: now, updatedAt: now },
];

const stage = (userId: string, days: number) => ({ completedBy: userId, completedAt: daysAgo(days) });

export const mockOrders: Order[] = [
  { id: "o1", serialNumber: "OP26-1042", doctorId: "d1", patientId: "p1", entryDate: daysAgo(7), completionDate: daysAgo(-2), shade: "A2", materials: ["ZIRCONIA"], workTypes: ["SCREWED"], selectedTeeth: [11, 12, 13], description: "כתרים זירקוניה על שתלים", status: "FINISH", assignedDesignerId: "u3", processingEmployeeId: "u6", finishEmployeeId: "u7", totalPrice: 4500, notes: null, completedStages: { RECEIVED: stage("u2", 7), FILES_ATTACHED: stage("u2", 7), DESIGN: stage("u3", 6), PRINTING_3D: stage("u4", 5), MILLING: stage("u5", 4), PROCESSING: stage("u6", 3) }, createdAt: daysAgo(7), updatedAt: hoursAgo(2) },
  { id: "o2", serialNumber: "OP26-1043", doctorId: "d2", patientId: "p2", entryDate: daysAgo(5), completionDate: daysAgo(-1), shade: "B1", materials: ["PFM"], workTypes: ["ABUTMENTS"], selectedTeeth: [36, 37], description: "מבנים PFM", status: "PROCESSING", assignedDesignerId: "u3", processingEmployeeId: "u6", finishEmployeeId: null, totalPrice: 2800, notes: null, completedStages: { RECEIVED: stage("u2", 5), FILES_ATTACHED: stage("u2", 5), DESIGN: stage("u3", 4), PRINTING_3D: stage("u4", 3), MILLING: stage("u5", 2) }, createdAt: daysAgo(5), updatedAt: hoursAgo(4) },
  { id: "o3", serialNumber: "OP26-1044", doctorId: "d3", patientId: "p3", entryDate: daysAgo(4), completionDate: daysAgo(3), shade: "A3", materials: ["ZIRCONIA", "TITANIUM"], workTypes: ["SCREWED", "MOCKUP"], selectedTeeth: [21, 22, 23, 24], description: "גשר זירקוניה + mockup", status: "MILLING", assignedDesignerId: "u3", processingEmployeeId: null, finishEmployeeId: null, totalPrice: 7200, notes: null, completedStages: { RECEIVED: stage("u2", 4), FILES_ATTACHED: stage("u2", 4), DESIGN: stage("u3", 3), PRINTING_3D: stage("u4", 2) }, createdAt: daysAgo(4), updatedAt: hoursAgo(1) },
  { id: "o4", serialNumber: "OP26-1045", doctorId: "d1", patientId: "p4", entryDate: daysAgo(3), completionDate: daysAgo(5), shade: "C1", materials: ["DENTURE"], workTypes: ["BAR"], selectedTeeth: [34, 35, 36, 37, 38, 44, 45, 46, 47, 48], description: "תותבת על באר", status: "PRINTING_3D", assignedDesignerId: "u3", processingEmployeeId: null, finishEmployeeId: null, totalPrice: 9500, notes: null, completedStages: { RECEIVED: stage("u2", 3), FILES_ATTACHED: stage("u2", 3), DESIGN: stage("u3", 2) }, createdAt: daysAgo(3), updatedAt: hoursAgo(6) },
  { id: "o5", serialNumber: "OP26-1046", doctorId: "d4", patientId: "p5", entryDate: daysAgo(2), completionDate: daysAgo(4), shade: "A1", materials: ["ZIRCONIA"], workTypes: ["SCREWED"], selectedTeeth: [16], description: "כתר זירקוניה בודד", status: "DESIGN", assignedDesignerId: "u3", processingEmployeeId: null, finishEmployeeId: null, totalPrice: 1800, notes: null, completedStages: { RECEIVED: stage("u2", 2), FILES_ATTACHED: stage("u2", 2) }, createdAt: daysAgo(2), updatedAt: hoursAgo(3) },
  { id: "o6", serialNumber: "OP26-1047", doctorId: "d5", patientId: "p6", entryDate: daysAgo(1), completionDate: daysAgo(6), shade: "B2", materials: ["TEMPORARY"], workTypes: ["NIGHT_GUARD_WHITENING_MILLED"], selectedTeeth: [31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48], description: "סד לילה", status: "FILES_ATTACHED", assignedDesignerId: null, processingEmployeeId: null, finishEmployeeId: null, totalPrice: 800, notes: null, completedStages: { RECEIVED: stage("u2", 1) }, createdAt: daysAgo(1), updatedAt: hoursAgo(8) },
  { id: "o7", serialNumber: "OP26-1048", doctorId: "d2", patientId: "p7", entryDate: now, completionDate: daysAgo(7), shade: "A2", materials: ["ZIRCONIA"], workTypes: ["SCREWED", "ABUTMENTS"], selectedTeeth: [14, 15], description: "כתרים + מבנים", status: "RECEIVED", assignedDesignerId: null, processingEmployeeId: null, finishEmployeeId: null, totalPrice: 3600, notes: null, completedStages: {}, createdAt: now, updatedAt: now },
  { id: "o8", serialNumber: "OP26-1035", doctorId: "d3", patientId: "p8", entryDate: daysAgo(14), completionDate: daysAgo(7), shade: "B1", materials: ["PFM"], workTypes: ["SCREWED"], selectedTeeth: [26], description: "כתר PFM", status: "PACKAGING", assignedDesignerId: "u3", processingEmployeeId: "u6", finishEmployeeId: "u7", totalPrice: 1500, notes: null, completedStages: { RECEIVED: stage("u2", 14), FILES_ATTACHED: stage("u2", 14), DESIGN: stage("u3", 13), PRINTING_3D: stage("u4", 12), MILLING: stage("u5", 11), PROCESSING: stage("u6", 10), FINISH: stage("u7", 9) }, createdAt: daysAgo(14), updatedAt: hoursAgo(1) },
  { id: "o9", serialNumber: "OP26-1020", doctorId: "d1", patientId: "p1", entryDate: daysAgo(21), completionDate: daysAgo(14), shade: "A3", materials: ["ZIRCONIA"], workTypes: ["SCREWED"], selectedTeeth: [46], description: "כתר זירקוניה", status: "SHIPPED", assignedDesignerId: "u3", processingEmployeeId: "u6", finishEmployeeId: "u7", totalPrice: 1800, notes: null, completedStages: { RECEIVED: stage("u2", 21), FILES_ATTACHED: stage("u2", 21), DESIGN: stage("u3", 20), PRINTING_3D: stage("u4", 19), MILLING: stage("u5", 18), PROCESSING: stage("u6", 17), FINISH: stage("u7", 16), PACKAGING: stage("u2", 15) }, createdAt: daysAgo(21), updatedAt: daysAgo(1) },
  { id: "o10", serialNumber: "OP26-1010", doctorId: "d4", patientId: "p3", entryDate: daysAgo(30), completionDate: daysAgo(23), shade: "C2", materials: ["MODEL"], workTypes: ["MOCKUP"], selectedTeeth: [11, 12, 13, 14, 15, 16, 17, 18], description: "מודל ו-mockup", status: "DELIVERED", assignedDesignerId: "u3", processingEmployeeId: "u6", finishEmployeeId: "u7", totalPrice: 2200, notes: null, completedStages: { RECEIVED: stage("u2", 30), FILES_ATTACHED: stage("u2", 30), DESIGN: stage("u3", 29), PRINTING_3D: stage("u4", 28), MILLING: stage("u5", 27), PROCESSING: stage("u6", 26), FINISH: stage("u7", 25), PACKAGING: stage("u2", 24), SHIPPED: stage("u2", 23) }, createdAt: daysAgo(30), updatedAt: daysAgo(20) },
];

export const mockOrderFiles: OrderFile[] = [
  { id: "f1", orderId: "o1", fileName: "scan_upper_jaw.plx", fileType: "PLX", fileSize: 2450000, uploadedBy: "u2", uploadedAt: daysAgo(7), notes: "סריקה עליונה" },
  { id: "f2", orderId: "o1", fileName: "scan_lower_jaw.plx", fileType: "PLX", fileSize: 2100000, uploadedBy: "u2", uploadedAt: daysAgo(7), notes: "סריקה תחתונה" },
  { id: "f3", orderId: "o3", fileName: "patient_scan.stl", fileType: "STL", fileSize: 5200000, uploadedBy: "u2", uploadedAt: daysAgo(4) },
  { id: "f4", orderId: "o6", fileName: "night_guard_scan.plx", fileType: "PLX", fileSize: 1800000, uploadedBy: "u2", uploadedAt: daysAgo(1) },
];

export const mockStatusHistory: OrderStatusHistory[] = [
  { id: "sh1", orderId: "o1", status: "RECEIVED", changedBy: "u2", createdAt: daysAgo(7) },
  { id: "sh2", orderId: "o1", status: "FILES_ATTACHED", changedBy: "u2", createdAt: daysAgo(7) },
  { id: "sh3", orderId: "o1", status: "DESIGN", changedBy: "u3", notes: "שויך למעצב מוחמד", createdAt: daysAgo(6) },
  { id: "sh4", orderId: "o1", status: "PRINTING_3D", changedBy: "u4", createdAt: daysAgo(5) },
  { id: "sh5", orderId: "o1", status: "MILLING", changedBy: "u5", createdAt: daysAgo(4) },
  { id: "sh6", orderId: "o1", status: "PROCESSING", changedBy: "u6", createdAt: daysAgo(3) },
  { id: "sh7", orderId: "o1", status: "FINISH", changedBy: "u7", createdAt: hoursAgo(2) },
];

export const mockInventory: InventoryItem[] = [
  { id: "i1", inventoryType: "RAW_MATERIALS", name: "בלוק זירקוניה A2", barcode: "ZM-A2-001", description: "בלוק זירקוניה גודל 98x16", purchaseCost: 180, quantity: 45, minQuantity: 10, unit: "יחידה", location: "מדף A1", isActive: true, createdAt: daysAgo(90), updatedAt: now },
  { id: "i2", inventoryType: "RAW_MATERIALS", name: "בלוק זירקוניה B1", barcode: "ZM-B1-001", description: "בלוק זירקוניה גודל 98x16", purchaseCost: 180, quantity: 32, minQuantity: 10, unit: "יחידה", location: "מדף A1", isActive: true, createdAt: daysAgo(90), updatedAt: now },
  { id: "i3", inventoryType: "RAW_MATERIALS", name: "שרף הדפסה Formlabs", barcode: "RS-FL-001", description: "שרף לבן להדפסה תלת-ממדית", purchaseCost: 320, quantity: 8, minQuantity: 3, unit: "בקבוק", location: "מדף B2", isActive: true, createdAt: daysAgo(60), updatedAt: now },
  { id: "i4", inventoryType: "RAW_MATERIALS", name: "גילס גימור", barcode: "GL-001", description: "גילסים לגימור זירקוניה", purchaseCost: 45, quantity: 120, minQuantity: 30, unit: "יחידה", location: "מגירה C1", isActive: true, createdAt: daysAgo(120), updatedAt: now },
  { id: "i5", inventoryType: "RAW_MATERIALS", name: "צבע A2", barcode: "CL-A2-001", description: "צבע לסריקה A2", purchaseCost: 95, quantity: 5, minQuantity: 2, unit: "בקבוק", location: "מדף D1", isActive: true, createdAt: daysAgo(45), updatedAt: now },
  { id: "i6", inventoryType: "PARTS_COMPONENTS", name: "ברגי שתל 3.5mm", barcode: "SC-35-001", description: "ברגים לכתרים מוברגים", purchaseCost: 25, quantity: 200, minQuantity: 50, unit: "יחידה", location: "מגירה P1", isActive: true, createdAt: daysAgo(180), updatedAt: now },
  { id: "i7", inventoryType: "PARTS_COMPONENTS", name: "אבאטמנט טיטניום", barcode: "AB-TI-001", description: "אבאטמנט טיטניום סטנדרטי", purchaseCost: 120, quantity: 35, minQuantity: 10, unit: "יחידה", location: "מגירה P2", isActive: true, createdAt: daysAgo(150), updatedAt: now },
  { id: "i8", inventoryType: "PARTS_COMPONENTS", name: "פרז מילינג 2mm", barcode: "FR-2MM-001", description: "פרז לחריטה 2mm", purchaseCost: 350, quantity: 3, minQuantity: 2, unit: "יחידה", location: "מכונה 1", isActive: true, createdAt: daysAgo(30), updatedAt: now },
  { id: "i9", inventoryType: "OWNER_ASSETS", name: "מכונת חריטה Roland", barcode: "AS-ROL-001", description: "מכונת חריטה Roland DWX-52D", purchaseCost: 180000, quantity: 1, minQuantity: 1, unit: "יחידה", location: "חדר חריטה", isActive: true, createdAt: daysAgo(730), updatedAt: now },
  { id: "i10", inventoryType: "OWNER_ASSETS", name: "מדפסת Formlabs 3+", barcode: "AS-FL3-001", description: "מדפסת תלת-ממד Formlabs Form 3+", purchaseCost: 45000, quantity: 1, minQuantity: 1, unit: "יחידה", location: "חדר הדפסה", isActive: true, createdAt: daysAgo(500), updatedAt: now },
  { id: "i11", inventoryType: "OWNER_ASSETS", name: "סורק תלת-ממדי", barcode: "AS-SC3D-001", description: "סורק Medit i700", purchaseCost: 35000, quantity: 1, minQuantity: 1, unit: "יחידה", location: "חדר סריקה", isActive: true, createdAt: daysAgo(400), updatedAt: now },
];

export const mockInventoryCategories: InventoryCategory[] = [
  { id: "RAW_MATERIALS", name: "חומרי גלם ושוטף", color: "#3b82f6", isSystem: true },
  { id: "PARTS_COMPONENTS", name: "חלקים ורכיבים", color: "#8b5cf6", isSystem: true },
  { id: "OWNER_ASSETS", name: "מלאי בעלים", color: "#c9a227", isSystem: true },
  { id: "CONSUMABLES", name: "צריכה שוטפת", color: "#10b981", isSystem: false },
];

export const mockCouriers: Courier[] = [
  { id: "cr1", name: "שליח מהיר", phone: "0501111111", address: "סחנין", isActive: true },
  { id: "cr2", name: "דואר שיניים", phone: "0502222222", address: "עכו", isActive: true },
  { id: "cr3", name: "אחמד שליח", phone: "0503333333", address: "נצרת", isActive: true },
];

export const mockMovements: InventoryMovement[] = [
  { id: "m1", itemId: "i1", quantity: 20, type: "IN", unitCost: 175, notes: "הזמנת מלאי — ספק אלפא", performedBy: "u2", createdAt: daysAgo(30) },
  { id: "m2", itemId: "i1", quantity: 15, type: "IN", unitCost: 180, notes: "הזמנת מלאי — ספק בטא", performedBy: "u2", createdAt: daysAgo(10) },
  { id: "m3", itemId: "i1", quantity: -3, type: "OUT", unitCost: 180, notes: "שימוש בהזמנה", orderRef: "OP26-1042", performedBy: "u6", createdAt: daysAgo(3) },
  { id: "m4", itemId: "i3", quantity: 2, type: "IN", unitCost: 310, notes: "רכישה מבצע", performedBy: "u1", createdAt: daysAgo(20) },
  { id: "m5", itemId: "i3", quantity: 2, type: "IN", unitCost: 320, notes: "רכישה רגילה", performedBy: "u1", createdAt: daysAgo(5) },
  { id: "m6", itemId: "i6", quantity: 100, type: "IN", unitCost: 22, notes: "ייבוא ברגים", performedBy: "u2", createdAt: daysAgo(45) },
  { id: "m7", itemId: "i6", quantity: -5, type: "OUT", unitCost: 25, notes: "שימוש", orderRef: "OP26-1043", performedBy: "u6", createdAt: daysAgo(2) },
];

export const mockShipments: Shipment[] = [
  { id: "s1", orderId: "o9", deliveryNote: "DN-482901", packagedBy: "u2", packagedAt: daysAgo(14), shippedAt: daysAgo(14), courierName: "שליח מהיר", courierPhone: "0501111111", createdAt: daysAgo(14) },
  { id: "s2", orderId: "o10", deliveryNote: "DN-391204", packagedBy: "u2", packagedAt: daysAgo(20), shippedAt: daysAgo(20), deliveredAt: daysAgo(18), courierName: "דואר שיניים", courierPhone: "0502222222", createdAt: daysAgo(20) },
];

export const mockPayments: Payment[] = [
  { id: "pay1", doctorId: "d1", employeeId: null, orderId: null, serialNumber: null, patientName: null, amount: 5000, type: "PAYMENT", status: "PAID", description: "תשלום חודש ינואר", paidAt: daysAgo(30), createdAt: daysAgo(30) },
  { id: "pay2", doctorId: "d3", employeeId: null, orderId: null, serialNumber: null, patientName: null, amount: 3000, type: "PAYMENT", status: "PARTIAL", description: "תשלום חלקי", paidAt: daysAgo(15), createdAt: daysAgo(15) },
  { id: "pay3", doctorId: "d2", employeeId: null, orderId: null, serialNumber: null, patientName: null, amount: 8000, type: "PAYMENT", status: "PAID", description: "תשלום מלא", paidAt: daysAgo(7), createdAt: daysAgo(7) },
  { id: "pay4", doctorId: "d1", employeeId: null, orderId: "o1", serialNumber: "OP26-1042", patientName: "פאטמה אבו סאלח", amount: 4500, type: "CHARGE", status: "PENDING", description: "חיוב עבודה", paidAt: null, createdAt: daysAgo(7) },
  { id: "pay5", doctorId: null, employeeId: "u3", orderId: null, serialNumber: null, patientName: null, amount: 8500, type: "SALARY", status: "PAID", description: "משכורת מרץ", paidAt: daysAgo(5), createdAt: daysAgo(5) },
  { id: "pay6", doctorId: null, employeeId: "u6", orderId: null, serialNumber: null, patientName: null, amount: 7200, type: "SALARY", status: "PAID", description: "משכורת מרץ", paidAt: daysAgo(5), createdAt: daysAgo(5) },
  { id: "pay7", doctorId: "d1", employeeId: null, orderId: "o1", serialNumber: "OP26-1042", patientName: "פאטמה אבו סאלח", amount: 2000, type: "PAYMENT", status: "PAID", description: "תשלום חלקי על עבודה", paymentMethod: "TRANSFER", referenceNumber: "TRX-88421", deliveryNote: null, paidAt: daysAgo(3), createdAt: daysAgo(3) },
  { id: "pay8", doctorId: "d2", employeeId: null, orderId: "o2", serialNumber: "OP26-1043", patientName: "חליל מנסור", amount: 2800, type: "CHARGE", status: "PAID", description: "חיוב עבודה", paymentMethod: null, referenceNumber: null, deliveryNote: "DN-2401", paidAt: daysAgo(4), createdAt: daysAgo(5) },
];

export const mockAttendance: AttendanceRecord[] = [
  { id: "a1", userId: "u3", checkIn: hoursAgo(8), checkOut: null, method: "NFC", nfcTagId: "NFC-003", latitude: 32.8644, longitude: 35.2978, createdAt: hoursAgo(8) },
  { id: "a2", userId: "u6", checkIn: hoursAgo(7.5), checkOut: null, method: "NFC", nfcTagId: "NFC-006", latitude: 32.8644, longitude: 35.2978, createdAt: hoursAgo(7.5) },
  { id: "a3", userId: "u7", checkIn: hoursAgo(7), checkOut: null, method: "NFC", nfcTagId: "NFC-007", createdAt: hoursAgo(7) },
  { id: "a4", userId: "u2", checkIn: hoursAgo(8), checkOut: null, method: "NFC", nfcTagId: "NFC-002", createdAt: hoursAgo(8) },
  { id: "a5", userId: "u3", checkIn: daysAgo(1), checkOut: new Date(daysAgo(1).getTime() + 9 * 60 * 60 * 1000), method: "NFC", nfcTagId: "NFC-003", createdAt: daysAgo(1) },
  { id: "a6", userId: "u6", checkIn: daysAgo(1), checkOut: new Date(daysAgo(1).getTime() + 8.5 * 60 * 60 * 1000), method: "NFC", nfcTagId: "NFC-006", createdAt: daysAgo(1) },
];

export function createInitialStore() {
  return {
    users: [...mockUsers],
    doctors: [...mockDoctors],
    patients: [...mockPatients],
    orders: [...mockOrders],
    orderFiles: [...mockOrderFiles],
    statusHistory: [...mockStatusHistory],
    inventory: [...mockInventory],
    inventoryCategories: [...mockInventoryCategories],
    movements: [...mockMovements],
    shipments: [...mockShipments],
    payments: [...mockPayments],
    attendance: [...mockAttendance],
    couriers: [...mockCouriers],
    labSettings: { ...defaultLabSettings },
  };
}

export type DataStore = ReturnType<typeof createInitialStore>;
