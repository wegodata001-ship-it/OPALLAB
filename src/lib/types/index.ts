export type UserRole =
  | "ADMIN"
  | "SECRETARY"
  | "DESIGNER"
  | "PRINTER"
  | "MILLING"
  | "PROCESSING"
  | "FINISH"
  | "PACKAGING"
  | "DOCTOR"
  | "OWNER";

export type Gender = "MALE" | "FEMALE";

export type MaterialType =
  | "TEMPORARY"
  | "DENTURE"
  | "PFM"
  | "ZIRCONIA"
  | "TITANIUM"
  | "MODEL";

export type WorkType =
  | "SCREWED"
  | "ABUTMENTS"
  | "MOCKUP"
  | "BAR"
  | "NIGHT_GUARD_WHITENING_MILLED";

export type OrderStatus =
  | "RECEIVED"
  | "FILES_ATTACHED"
  | "DESIGN"
  | "PRINTING_3D"
  | "MILLING"
  | "PROCESSING"
  | "FINISH"
  | "PACKAGING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

export type InventoryType = string;

export interface InventoryCategory {
  id: string;
  name: string;
  color: string;
  isSystem: boolean;
}

export type FileType =
  | "PLX"
  | "STL"
  | "OBJ"
  | "PLY"
  | "OTHER_3D"
  | "IMAGE"
  | "DOCUMENT";

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

export type AttendanceMethod =
  | "NFC"
  | "MANUAL"
  | "GEOFENCE_AUTO"
  | "WIFI"
  | "GPS"
  | "TRUSTED_DEVICE";

export type TrustedDeviceStatus = "ACTIVE" | "BLOCKED" | "REVOKED";

export type PaymentStatus = "PENDING" | "PARTIAL" | "PAID" | "OVERDUE";

export type SalaryType = "MONTHLY" | "HOURLY";

export type PaymentMethod = "CASH" | "CHECK" | "TRANSFER" | "CREDIT_CARD";

/** Lab settings — gate geofence for QR/NFC trusted-device attendance */
export interface LabSettings {
  labLatitude?: number | null;
  labLongitude?: number | null;
  geofenceRadiusMeters?: number | null;
  gateToken?: string | null;
}

export interface StageCompletion {
  completedBy: string;
  completedAt: Date;
}

export interface User {
  id: string;
  username: string;
  password: string;
  email: string;
  name: string;
  phone?: string | null;
  role: UserRole;
  roles: UserRole[];
  authUserId?: string | null;
  nfcTagId?: string | null;
  address?: string | null;
  salary?: number | null;
  salaryType?: SalaryType | null;
  hourlyRate?: number | null;
  color?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Doctor {
  id: string;
  userId?: string | null;
  name: string;
  clinic?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  balance: number;
  paymentStatus: PaymentStatus;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDoctorInput {
  name: string;
  clinic?: string | null;
  phone?: string | null;
  email: string;
  address?: string | null;
  notes?: string | null;
  username: string;
  password: string;
  confirmPassword?: string;
}

export interface UpdateDoctorInput {
  name?: string;
  clinic?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive?: boolean;
  username?: string;
  password?: string;
  userIsActive?: boolean;
}

export interface Courier {
  id: string;
  name: string;
  phone: string;
  address?: string | null;
  isActive: boolean;
}

export interface Patient {
  id: string;
  name: string;
  age?: number | null;
  gender?: Gender | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  serialNumber: string;
  doctorId: string;
  patientId: string;
  entryDate: Date;
  completionDate?: Date | null;
  shade?: string | null;
  materials: MaterialType[];
  workTypes: WorkType[];
  selectedTeeth: number[];
  description?: string | null;
  status: OrderStatus;
  assignedDesignerId?: string | null;
  processingEmployeeId?: string | null;
  finishEmployeeId?: string | null;
  totalPrice?: number | null;
  notes?: string | null;
  completedStages: Partial<Record<OrderStatus, StageCompletion>>;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderFile {
  id: string;
  orderId: string;
  fileName: string;
  fileType: FileType;
  fileSize?: number | null;
  uploadedBy: string;
  uploadedAt: Date;
  notes?: string | null;
  dataUrl?: string | null;
  mimeType?: string | null;
  storagePath?: string | null;
  category?: OrderFileCategory;
  slotKey?: string | null;
  versionKey?: string | null;
  version?: number;
  isCurrent?: boolean;
  replacesId?: string | null;
  uploadedByName?: string | null;
}

export interface OrderStatusHistory {
  id: string;
  orderId: string;
  status: OrderStatus;
  changedBy: string;
  notes?: string | null;
  createdAt: Date;
}

export interface InventoryItem {
  id: string;
  inventoryType: InventoryType;
  name: string;
  barcode: string;
  description?: string | null;
  imageUrl?: string | null;
  purchaseCost: number;
  quantity: number;
  minQuantity: number;
  unit: string;
  location?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  quantity: number;
  type: "IN" | "OUT" | "ADJUSTMENT" | "TRANSFER" | "CATEGORY_CHANGE" | "EDIT" | "DELETE";
  unitCost: number;
  notes?: string | null;
  orderRef?: string | null;
  reason?: string | null;
  supplier?: string | null;
  fromCategory?: string | null;
  toCategory?: string | null;
  fromLocation?: string | null;
  toLocation?: string | null;
  performedBy: string;
  createdAt: Date;
}

export interface Warehouse {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown> | null;
  createdAt: Date;
  userName?: string;
}

export interface Shipment {
  id: string;
  orderId: string;
  deliveryNote: string;
  packagedBy?: string | null;
  packagedAt?: Date | null;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
  courierName?: string | null;
  courierPhone?: string | null;
  notes?: string | null;
  createdAt: Date;
}

export type TransactionType = "PAYMENT" | "CHARGE" | "SALARY";

export interface Payment {
  id: string;
  doctorId?: string | null;
  employeeId?: string | null;
  orderId?: string | null;
  serialNumber?: string | null;
  patientName?: string | null;
  amount: number;
  type: TransactionType;
  status: PaymentStatus;
  description?: string | null;
  paidAt?: Date | null;
  paymentMethod?: PaymentMethod | null;
  referenceNumber?: string | null;
  deliveryNote?: string | null;
  createdAt: Date;
}

export interface AttendanceDeviceMeta {
  browser: string;
  os: string;
  deviceType: string;
  userAgent: string;
  screenSize: string;
  timezone: string;
}

export interface AttendanceLocationMeta {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  deviceInfo?: string;
  address?: string;
  photoUrl?: string | null;
  photoPath?: string | null;
  fileName?: string | null;
  device?: AttendanceDeviceMeta;
  trustedDeviceId?: string | null;
  ipAddress?: string | null;
}

export type AttendanceCheckInMeta = AttendanceLocationMeta;

export interface AttendanceRecord {
  id: string;
  userId: string;
  checkIn: Date;
  checkOut?: Date | null;
  method: AttendanceMethod;
  trustedDeviceId?: string | null;
  ipAddress?: string | null;
  nfcTagId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  checkInLatitude?: number | null;
  checkInLongitude?: number | null;
  checkInAccuracy?: number | null;
  checkInAddress?: string | null;
  checkOutLatitude?: number | null;
  checkOutLongitude?: number | null;
  checkOutAccuracy?: number | null;
  checkOutAddress?: string | null;
  checkInPhotoUrl?: string | null;
  checkOutPhotoUrl?: string | null;
  checkInPhotoPath?: string | null;
  checkOutPhotoPath?: string | null;
  checkInAddressCountry?: string | null;
  checkInAddressCity?: string | null;
  checkInAddressStreet?: string | null;
  checkInAddressHouseNumber?: string | null;
  checkOutAddressCountry?: string | null;
  checkOutAddressCity?: string | null;
  checkOutAddressStreet?: string | null;
  checkOutAddressHouseNumber?: string | null;
  checkInDeviceBrowser?: string | null;
  checkInDeviceOs?: string | null;
  checkInDeviceType?: string | null;
  checkInUserAgent?: string | null;
  checkInScreenSize?: string | null;
  checkInTimezone?: string | null;
  checkOutDeviceBrowser?: string | null;
  checkOutDeviceOs?: string | null;
  checkOutDeviceType?: string | null;
  checkOutUserAgent?: string | null;
  checkOutScreenSize?: string | null;
  checkOutTimezone?: string | null;
  deviceInfo?: string | null;
  notes?: string | null;
  createdAt: Date;
}

export interface OrderWithRelations extends Order {
  doctor: Doctor;
  patient: Patient;
  assignedDesigner?: User | null;
  processingEmployee?: User | null;
  finishEmployee?: User | null;
  files: OrderFile[];
  statusHistory: OrderStatusHistory[];
  shipment?: Shipment | null;
}

export interface CreateOrderInput {
  doctorId?: string;
  doctorName?: string;
  patientName?: string;
  patientAge?: number;
  patientGender?: Gender;
  shade?: string;
  materials?: MaterialType[];
  workTypes?: WorkType[];
  selectedTeeth?: number[];
  description?: string;
  completionDate?: Date;
  totalPrice?: number;
}

export interface UpdateOrderInput {
  orderId: string;
  doctorId?: string;
  doctorName?: string;
  patientName?: string;
  patientAge?: number | null;
  patientGender?: Gender | null;
  shade?: string | null;
  materials?: MaterialType[];
  workTypes?: WorkType[];
  selectedTeeth?: number[];
  description?: string | null;
  completionDate?: Date | null;
  totalPrice?: number | null;
  notes?: string | null;
}

export interface UpdateOrderStatusInput {
  orderId: string;
  status: OrderStatus;
  changedBy: string;
  notes?: string;
  assignedDesignerId?: string;
  processingEmployeeId?: string;
  finishEmployeeId?: string;
}

export interface CompleteStageInput {
  orderId: string;
  stage: OrderStatus;
  completedBy: string;
}

export interface UndoStageInput {
  orderId: string;
  stage: OrderStatus;
  undoneBy: string;
}

export interface DateRange {
  from: Date | null;
  to: Date | null;
}
