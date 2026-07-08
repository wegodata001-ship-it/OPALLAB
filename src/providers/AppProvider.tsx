"use client";

import {
  createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode,
} from "react";
import { createInitialStore, defaultLabSettings, type DataStore } from "@/lib/mock-data";
import { loadStore, saveStore, resetStore as clearStore } from "@/lib/store-persistence";
import type {
  User, UserRole, Doctor, Order, OrderWithRelations, OrderStatus,
  CreateOrderInput, UpdateOrderInput, UpdateOrderStatusInput, CompleteStageInput, UndoStageInput,
  InventoryItem, InventoryType, InventoryMovement, InventoryCategory,
  AttendanceRecord, OrderFile, FileType, Shipment, Payment, PaymentStatus, Courier, LabSettings,
  AttendanceMethod,
} from "@/lib/types";
import { generateSerialNumber, generateDeliveryNote } from "@/lib/utils";
import { canCompleteStage, canUndoStage } from "@/lib/workflow-permissions";

const STAGE_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  DESIGN: "PRINTING_3D", PRINTING_3D: "MILLING", MILLING: "PROCESSING",
  PROCESSING: "FINISH", FINISH: "PACKAGING", PACKAGING: "SHIPPED",
};

interface AppContextValue {
  isAuthenticated: boolean;
  currentUser: User | null;
  login: (username: string, password: string) => User | null;
  logout: () => void;
  users: User[];
  doctors: Doctor[];
  couriers: Courier[];
  payments: Payment[];
  orders: OrderWithRelations[];
  inventory: InventoryItem[];
  inventoryCategories: InventoryCategory[];
  movements: InventoryMovement[];
  shipments: Shipment[];
  attendance: AttendanceRecord[];
  getOrderById: (id: string) => OrderWithRelations | undefined;
  getOrdersByStatus: (status: OrderStatus) => OrderWithRelations[];
  getOrdersByDoctor: (doctorId: string) => OrderWithRelations[];
  getDoctorForUser: (userId: string) => Doctor | undefined;
  getMovementsByItem: (itemId: string) => InventoryMovement[];
  getCategoryLabel: (id: string) => string;
  createOrder: (input: CreateOrderInput) => Order;
  updateOrder: (input: UpdateOrderInput) => void;
  updateOrderStatus: (input: UpdateOrderStatusInput) => void;
  completeStage: (input: CompleteStageInput) => void;
  undoStage: (input: UndoStageInput) => void;
  addOrderFile: (orderId: string, file: { fileName: string; fileType: FileType; fileSize?: number; notes?: string; dataUrl?: string | null; mimeType?: string | null }) => void;
  previewDeliveryNote: (orderId: string) => string;
  createShipment: (orderId: string, deliveryNote: string, courier?: { name: string; phone: string }) => Shipment;
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => void;
  addInventoryItem: (item: Omit<InventoryItem, "id" | "createdAt" | "updatedAt">, initialCost?: number) => InventoryItem;
  addInventoryMovement: (mov: Omit<InventoryMovement, "id" | "createdAt">) => void;
  addInventoryCategory: (name: string, color: string) => InventoryCategory;
  checkIn: (userId: string, method?: AttendanceMethod, meta?: { wifiSsid?: string; latitude?: number; longitude?: number }) => void;
  checkOut: (userId: string, method?: AttendanceMethod) => void;
  updateAttendance: (id: string, updates: Partial<Pick<AttendanceRecord, "checkIn" | "checkOut" | "notes">>) => void;
  addPayment: (payment: Omit<Payment, "id" | "createdAt">) => void;
  updateDoctorBalance: (doctorId: string, amount: number, status?: PaymentStatus) => void;
  addUser: (user: Omit<User, "id" | "createdAt" | "updatedAt">) => User;
  updateUser: (id: string, updates: Partial<User>) => void;
  addDoctor: (doctor: Omit<Doctor, "id" | "createdAt" | "updatedAt" | "balance" | "paymentStatus">) => Doctor;
  updateDoctor: (id: string, updates: Partial<Doctor>) => void;
  addCourier: (courier: Omit<Courier, "id">) => Courier;
  labSettings: LabSettings;
  updateLabSettings: (updates: Partial<LabSettings>) => void;
  getShipmentByDeliveryNote: (note: string) => Shipment | undefined;
  getUsersByRole: (role: UserRole) => User[];
  getLowStockItems: () => InventoryItem[];
  getInventoryByType: (type: InventoryType) => InventoryItem[];
  getActiveAttendance: () => AttendanceRecord[];
  resetStore: () => void;
  getDashboardStats: () => {
    activeOrders: number; pendingPackaging: number; todayCheckIns: number;
    lowStockCount: number; overduePayments: number; monthlyRevenue: number;
    ordersByStage: Record<string, number>;
  };
}

const AppContext = createContext<AppContextValue | null>(null);
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function enrichOrders(store: DataStore): OrderWithRelations[] {
  const result: OrderWithRelations[] = [];
  for (const order of store.orders) {
    const doctor = store.doctors.find((d) => d.id === order.doctorId);
    const patient = store.patients.find((p) => p.id === order.patientId);
    if (!doctor || !patient) continue;
    result.push({
      ...order,
      doctor,
      patient,
      assignedDesigner: store.users.find((u) => u.id === order.assignedDesignerId) ?? null,
      processingEmployee: store.users.find((u) => u.id === order.processingEmployeeId) ?? null,
      finishEmployee: store.users.find((u) => u.id === order.finishEmployeeId) ?? null,
      files: store.orderFiles.filter((f) => f.orderId === order.id),
      statusHistory: store.statusHistory.filter((h) => h.orderId === order.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      shipment: store.shipments.find((s) => s.orderId === order.id) ?? null,
    });
  }
  return result;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<DataStore>(createInitialStore);
  const [hydrated, setHydrated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const orders = useMemo(() => enrichOrders(store), [store]);

  useEffect(() => {
    setStore(loadStore());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveStore(store);
  }, [store, hydrated]);

  const login = useCallback((username: string, password: string): User | null => {
    const user = store.users.find((u) => u.username === username && u.password === password && u.isActive);
    if (user) { setCurrentUser(user); return user; }
    return null;
  }, [store.users]);

  const logout = useCallback(() => setCurrentUser(null), []);
  const getOrderById = useCallback((id: string) => orders.find((o) => o.id === id), [orders]);
  const getOrdersByStatus = useCallback((status: OrderStatus) => orders.filter((o) => o.status === status), [orders]);
  const getOrdersByDoctor = useCallback((doctorId: string) => orders.filter((o) => o.doctorId === doctorId), [orders]);
  const getDoctorForUser = useCallback((userId: string) => store.doctors.find((d) => d.userId === userId), [store.doctors]);
  const getMovementsByItem = useCallback((itemId: string) =>
    store.movements.filter((m) => m.itemId === itemId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  [store.movements]);
  const getCategoryLabel = useCallback((id: string) =>
    store.inventoryCategories.find((c) => c.id === id)?.name ?? id,
  [store.inventoryCategories]);

  const createOrder = useCallback((input: CreateOrderInput): Order => {
    if (!currentUser) throw new Error("Not authenticated");
    const now = new Date();
    const patientId = generateId();
    const orderId = generateId();
    const patientName = input.patientName?.trim() || "לא צוין";
    const doctorName = input.doctorName?.trim() || "לא צוין";

    let doctorId = input.doctorId;
    let newDoctor: Doctor | null = null;
    if (doctorId && !store.doctors.some((d) => d.id === doctorId)) doctorId = undefined;
    if (!doctorId) {
      const existing = store.doctors.find((d) => d.name.trim() === doctorName);
      if (existing) doctorId = existing.id;
      else {
        newDoctor = {
          id: generateId(), userId: null, name: doctorName, clinic: null, phone: null, email: null,
          address: null, balance: 0, paymentStatus: "PENDING", isActive: true, createdAt: now, updatedAt: now,
        };
        doctorId = newDoctor.id;
      }
    }

    const patient = {
      id: patientId, name: patientName, age: input.patientAge ?? null,
      gender: input.patientGender ?? null, createdAt: now, updatedAt: now,
    };
    const order: Order = {
      id: orderId, serialNumber: generateSerialNumber(), doctorId: doctorId!, patientId,
      entryDate: now, completionDate: input.completionDate ?? null, shade: input.shade ?? null,
      materials: input.materials ?? [], workTypes: input.workTypes ?? [], selectedTeeth: input.selectedTeeth ?? [],
      description: input.description ?? null, status: "RECEIVED",
      assignedDesignerId: null, processingEmployeeId: null, finishEmployeeId: null,
      totalPrice: input.totalPrice ?? null, notes: null, completedStages: {},
      createdAt: now, updatedAt: now,
    };
    setStore((prev) => ({
      ...prev,
      doctors: newDoctor ? [...prev.doctors, newDoctor] : prev.doctors,
      patients: [...prev.patients, patient],
      orders: [order, ...prev.orders],
      statusHistory: [{ id: generateId(), orderId, status: "RECEIVED", changedBy: currentUser.id, notes: "הזמנה חדשה", createdAt: now }, ...prev.statusHistory],
      payments: input.totalPrice ? [{
        id: generateId(), doctorId: doctorId!, employeeId: null, orderId, serialNumber: order.serialNumber,
        patientName, amount: input.totalPrice, type: "CHARGE", status: "PENDING",
        description: `חיוב עבודה ${order.serialNumber}`, paidAt: null, createdAt: now,
      }, ...prev.payments] : prev.payments,
    }));
    return order;
  }, [currentUser, store.doctors]);

  const updateOrder = useCallback((input: UpdateOrderInput) => {
    if (!currentUser) return;
    const now = new Date();
    const order = store.orders.find((o) => o.id === input.orderId);
    if (!order) return;

    let doctorId = input.doctorId ?? order.doctorId;
    let newDoctor: Doctor | null = null;
    if (input.doctorName !== undefined || input.doctorId !== undefined) {
      const doctorName = input.doctorName?.trim() || store.doctors.find((d) => d.id === doctorId)?.name || "לא צוין";
      if (!input.doctorId) {
        const existing = store.doctors.find((d) => d.name.trim() === doctorName);
        if (existing) doctorId = existing.id;
        else {
          newDoctor = {
            id: generateId(), userId: null, name: doctorName, clinic: null, phone: null, email: null,
            address: null, balance: 0, paymentStatus: "PENDING", isActive: true, createdAt: now, updatedAt: now,
          };
          doctorId = newDoctor.id;
        }
      }
    }

    const patientName = input.patientName?.trim() ?? store.patients.find((p) => p.id === order.patientId)?.name;

    setStore((prev) => ({
      ...prev,
      doctors: newDoctor ? [...prev.doctors, newDoctor] : prev.doctors,
      patients: prev.patients.map((p) => p.id === order.patientId ? {
        ...p,
        name: patientName ?? p.name,
        age: input.patientAge !== undefined ? input.patientAge : p.age,
        gender: input.patientGender !== undefined ? input.patientGender : p.gender,
        updatedAt: now,
      } : p),
      orders: prev.orders.map((o) => o.id === input.orderId ? {
        ...o,
        doctorId: doctorId!,
        shade: input.shade !== undefined ? input.shade : o.shade,
        materials: input.materials ?? o.materials,
        workTypes: input.workTypes ?? o.workTypes,
        selectedTeeth: input.selectedTeeth ?? o.selectedTeeth,
        description: input.description !== undefined ? input.description : o.description,
        completionDate: input.completionDate !== undefined ? input.completionDate : o.completionDate,
        totalPrice: input.totalPrice !== undefined ? input.totalPrice : o.totalPrice,
        notes: input.notes !== undefined ? input.notes : o.notes,
        updatedAt: now,
      } : o),
      payments: prev.payments.map((p) => p.orderId === input.orderId && patientName
        ? { ...p, patientName }
        : p),
    }));
  }, [currentUser, store.orders, store.doctors, store.patients]);

  const updateOrderStatus = useCallback((input: UpdateOrderStatusInput) => {
    const now = new Date();
    setStore((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => o.id === input.orderId ? { ...o, status: input.status, updatedAt: now } : o),
      statusHistory: [{ id: generateId(), orderId: input.orderId, status: input.status, changedBy: input.changedBy, notes: input.notes ?? null, createdAt: now }, ...prev.statusHistory],
    }));
  }, []);

  const completeStage = useCallback((input: CompleteStageInput) => {
    if (!currentUser) return;
    const order = store.orders.find((o) => o.id === input.orderId);
    if (!order) return;
    if (!canCompleteStage(currentUser, input.stage, order.status, order.completedStages)) return;
    const now = new Date();
    const nextStatus = STAGE_NEXT[input.stage];
    setStore((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => {
        if (o.id !== input.orderId) return o;
        const completedStages = { ...o.completedStages, [input.stage]: { completedBy: input.completedBy, completedAt: now } };
        return { ...o, completedStages, status: nextStatus ?? o.status, updatedAt: now };
      }),
      statusHistory: nextStatus ? [{ id: generateId(), orderId: input.orderId, status: nextStatus, changedBy: input.completedBy, notes: `שלב הושלם ✓`, createdAt: now }, ...prev.statusHistory] : prev.statusHistory,
    }));
  }, [currentUser, store.orders]);

  const undoStage = useCallback((input: UndoStageInput) => {
    if (!currentUser) return;
    const order = store.orders.find((o) => o.id === input.orderId);
    if (!order) return;
    if (!canUndoStage(currentUser, input.stage, order.completedStages)) return;
    const now = new Date();
    setStore((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => {
        if (o.id !== input.orderId) return o;
        const { [input.stage]: _, ...rest } = o.completedStages;
        return { ...o, completedStages: rest, status: input.stage, updatedAt: now };
      }),
      statusHistory: [{ id: generateId(), orderId: input.orderId, status: input.stage, changedBy: input.undoneBy, notes: `ביטול סימון שלב`, createdAt: now }, ...prev.statusHistory],
    }));
  }, [currentUser, store.orders]);

  const addOrderFile = useCallback((orderId: string, file: { fileName: string; fileType: FileType; fileSize?: number; notes?: string; dataUrl?: string | null; mimeType?: string | null }) => {
    if (!currentUser) return;
    const now = new Date();
    const newFile: OrderFile = {
      id: generateId(), orderId, fileName: file.fileName, fileType: file.fileType,
      fileSize: file.fileSize ?? null, uploadedBy: currentUser.id, uploadedAt: now,
      notes: file.notes ?? null, dataUrl: file.dataUrl ?? null, mimeType: file.mimeType ?? null,
    };
    setStore((prev) => {
      const order = prev.orders.find((o) => o.id === orderId);
      const shouldUpdate = order?.status === "RECEIVED";
      return {
        ...prev, orderFiles: [...prev.orderFiles, newFile],
        orders: shouldUpdate ? prev.orders.map((o) => o.id === orderId ? { ...o, status: "FILES_ATTACHED" as const, updatedAt: now } : o) : prev.orders,
        statusHistory: shouldUpdate ? [{ id: generateId(), orderId, status: "FILES_ATTACHED" as const, changedBy: currentUser.id, notes: `צורף: ${file.fileName}`, createdAt: now }, ...prev.statusHistory] : prev.statusHistory,
      };
    });
  }, [currentUser]);

  const previewDeliveryNote = useCallback(() => generateDeliveryNote(), []);

  const createShipment = useCallback((orderId: string, deliveryNote: string, courier?: { name: string; phone: string }): Shipment => {
    if (!currentUser) throw new Error("Not authenticated");
    const now = new Date();
    const shipment: Shipment = { id: generateId(), orderId, deliveryNote, packagedBy: currentUser.id, packagedAt: now, shippedAt: now, deliveredAt: null, courierName: courier?.name ?? null, courierPhone: courier?.phone ?? null, notes: null, createdAt: now };
    setStore((prev) => ({
      ...prev, shipments: [...prev.shipments, shipment],
      orders: prev.orders.map((o) => o.id === orderId ? { ...o, status: "SHIPPED" as const, updatedAt: now } : o),
      payments: prev.payments.map((p) => p.orderId === orderId ? { ...p, deliveryNote } : p),
      statusHistory: [{ id: generateId(), orderId, status: "SHIPPED" as const, changedBy: currentUser.id, notes: `משלוח: ${deliveryNote}`, createdAt: now }, ...prev.statusHistory],
    }));
    return shipment;
  }, [currentUser]);

  const addInventoryMovement = useCallback((mov: Omit<InventoryMovement, "id" | "createdAt">) => {
    const now = new Date();
    const movement: InventoryMovement = { ...mov, id: generateId(), createdAt: now };
    setStore((prev) => ({
      ...prev,
      movements: [movement, ...prev.movements],
      inventory: prev.inventory.map((item) => {
        if (item.id !== mov.itemId) return item;
        const newQty = Math.max(0, item.quantity + mov.quantity);
        const newCost = mov.type === "IN" && mov.quantity > 0 ? mov.unitCost : item.purchaseCost;
        return { ...item, quantity: newQty, purchaseCost: newCost, updatedAt: now };
      }),
    }));
  }, []);

  const addInventoryItem = useCallback((item: Omit<InventoryItem, "id" | "createdAt" | "updatedAt">, initialCost?: number) => {
    const now = new Date();
    const newItem: InventoryItem = { ...item, id: generateId(), createdAt: now, updatedAt: now };
    setStore((prev) => {
      const movements = item.quantity > 0 ? [{
        id: generateId(), itemId: newItem.id, quantity: item.quantity, type: "IN" as const,
        unitCost: initialCost ?? item.purchaseCost, notes: "מלאי ראשוני", performedBy: currentUser?.id ?? "system", createdAt: now,
      }, ...prev.movements] : prev.movements;
      return { ...prev, inventory: [...prev.inventory, newItem], movements };
    });
    return newItem;
  }, [currentUser]);

  const updateInventoryItem = useCallback((id: string, updates: Partial<InventoryItem>) => {
    setStore((prev) => ({ ...prev, inventory: prev.inventory.map((item) => item.id === id ? { ...item, ...updates, updatedAt: new Date() } : item) }));
  }, []);

  const addInventoryCategory = useCallback((name: string, color: string): InventoryCategory => {
    const id = name.toUpperCase().replace(/\s+/g, "_").slice(0, 20) + "_" + Date.now().toString(36);
    const cat: InventoryCategory = { id, name, color, isSystem: false };
    setStore((prev) => ({ ...prev, inventoryCategories: [...prev.inventoryCategories, cat] }));
    return cat;
  }, []);

  const addPayment = useCallback((payment: Omit<Payment, "id" | "createdAt">) => {
    const now = new Date();
    const newPayment: Payment = { ...payment, id: generateId(), createdAt: now };
    setStore((prev) => {
      let doctors = prev.doctors;
      if (payment.doctorId) {
        const delta = payment.type === "PAYMENT" ? payment.amount : payment.type === "CHARGE" ? -payment.amount : 0;
        doctors = doctors.map((d) => d.id === payment.doctorId ? { ...d, balance: d.balance + delta, paymentStatus: payment.status, updatedAt: now } : d);
      }
      return { ...prev, payments: [newPayment, ...prev.payments], doctors };
    });
  }, []);

  const updateDoctorBalance = useCallback((doctorId: string, amount: number, status?: PaymentStatus) => {
    setStore((prev) => ({ ...prev, doctors: prev.doctors.map((d) => d.id === doctorId ? { ...d, balance: amount, paymentStatus: status ?? d.paymentStatus, updatedAt: new Date() } : d) }));
  }, []);

  const addUser = useCallback((user: Omit<User, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date();
    const newUser: User = { ...user, id: generateId(), createdAt: now, updatedAt: now };
    setStore((prev) => ({ ...prev, users: [...prev.users, newUser] }));
    return newUser;
  }, []);

  const updateUser = useCallback((id: string, updates: Partial<User>) => {
    setStore((prev) => ({ ...prev, users: prev.users.map((u) => u.id === id ? { ...u, ...updates, updatedAt: new Date() } : u) }));
  }, []);

  const addDoctor = useCallback((doctor: Omit<Doctor, "id" | "createdAt" | "updatedAt" | "balance" | "paymentStatus">) => {
    const now = new Date();
    const newDoc: Doctor = { ...doctor, id: generateId(), balance: 0, paymentStatus: "PENDING", createdAt: now, updatedAt: now };
    setStore((prev) => ({ ...prev, doctors: [...prev.doctors, newDoc] }));
    return newDoc;
  }, []);

  const updateDoctor = useCallback((id: string, updates: Partial<Doctor>) => {
    setStore((prev) => ({ ...prev, doctors: prev.doctors.map((d) => d.id === id ? { ...d, ...updates, updatedAt: new Date() } : d) }));
  }, []);

  const addCourier = useCallback((courier: Omit<Courier, "id">) => {
    const newCourier: Courier = { ...courier, id: generateId() };
    setStore((prev) => ({ ...prev, couriers: [...prev.couriers, newCourier] }));
    return newCourier;
  }, []);

  const checkIn = useCallback((userId: string, method: AttendanceMethod = "NFC", meta?: { wifiSsid?: string; latitude?: number; longitude?: number }) => {
    const user = store.users.find((u) => u.id === userId);
    const now = new Date();
    const notes = meta?.wifiSsid ? `WiFi: ${meta.wifiSsid}` : null;
    setStore((prev) => ({
      ...prev,
      attendance: [{
        id: generateId(), userId, checkIn: now, checkOut: null, method,
        nfcTagId: user?.nfcTagId ?? null,
        latitude: meta?.latitude ?? 32.8644,
        longitude: meta?.longitude ?? 35.2978,
        notes, createdAt: now,
      }, ...prev.attendance],
    }));
  }, [store.users]);

  const checkOut = useCallback((userId: string, method: AttendanceMethod = "NFC") => {
    const now = new Date();
    setStore((prev) => ({ ...prev, attendance: prev.attendance.map((a) => a.userId === userId && !a.checkOut ? { ...a, checkOut: now, method } : a) }));
  }, []);

  const updateAttendance = useCallback((id: string, updates: Partial<Pick<AttendanceRecord, "checkIn" | "checkOut" | "notes">>) => {
    setStore((prev) => ({ ...prev, attendance: prev.attendance.map((a) => a.id === id ? { ...a, ...updates } : a) }));
  }, []);

  const updateLabSettings = useCallback((updates: Partial<LabSettings>) => {
    setStore((prev) => ({ ...prev, labSettings: { ...prev.labSettings, ...updates } }));
  }, []);

  const getShipmentByDeliveryNote = useCallback((note: string) =>
    store.shipments.find((s) => s.deliveryNote === note),
  [store.shipments]);

  const getUsersByRole = useCallback((role: UserRole) => store.users.filter((u) => u.role === role && u.isActive), [store.users]);
  const getLowStockItems = useCallback(() => store.inventory.filter((i) => i.quantity <= i.minQuantity && i.isActive), [store.inventory]);
  const getInventoryByType = useCallback((type: InventoryType) => store.inventory.filter((i) => i.inventoryType === type && i.isActive), [store.inventory]);
  const getActiveAttendance = useCallback(() => store.attendance.filter((a) => !a.checkOut), [store.attendance]);

  const resetStore = useCallback(() => {
    setStore(clearStore());
    setCurrentUser(null);
  }, []);

  const getDashboardStats = useCallback(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const stages = ["RECEIVED", "FILES_ATTACHED", "DESIGN", "PRINTING_3D", "MILLING", "PROCESSING", "FINISH", "PACKAGING"] as const;
    const ordersByStage: Record<string, number> = {};
    stages.forEach((s) => { ordersByStage[s] = store.orders.filter((o) => o.status === s).length; });
    return {
      activeOrders: store.orders.filter((o) => !["DELIVERED", "CANCELLED", "SHIPPED"].includes(o.status)).length,
      pendingPackaging: store.orders.filter((o) => o.status === "PACKAGING").length,
      todayCheckIns: store.attendance.filter((a) => a.checkIn >= today).length,
      lowStockCount: store.inventory.filter((i) => i.quantity <= i.minQuantity).length,
      overduePayments: store.doctors.filter((d) => d.paymentStatus === "OVERDUE").length,
      monthlyRevenue: store.payments.filter((p) => p.type === "PAYMENT" && p.paidAt && p.paidAt >= monthStart).reduce((s, p) => s + p.amount, 0),
      ordersByStage,
    };
  }, [store]);

  const value: AppContextValue = {
    isAuthenticated: !!currentUser, currentUser, login, logout,
    users: store.users, doctors: store.doctors, couriers: store.couriers,
    payments: store.payments, orders, inventory: store.inventory,
    inventoryCategories: store.inventoryCategories, movements: store.movements,
    shipments: store.shipments, attendance: store.attendance,
    getOrderById, getOrdersByStatus, getOrdersByDoctor, getDoctorForUser,
    getMovementsByItem, getCategoryLabel, createOrder, updateOrder, updateOrderStatus,
    completeStage, undoStage, addOrderFile, previewDeliveryNote, createShipment,
    updateInventoryItem, addInventoryItem, addInventoryMovement, addInventoryCategory,
    checkIn, checkOut, updateAttendance, addPayment, updateDoctorBalance,
    addUser, updateUser, addDoctor, updateDoctor, addCourier,
    labSettings: store.labSettings ?? defaultLabSettings, updateLabSettings, getShipmentByDeliveryNote,
    getUsersByRole, getLowStockItems, getInventoryByType, getActiveAttendance, resetStore, getDashboardStats,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
