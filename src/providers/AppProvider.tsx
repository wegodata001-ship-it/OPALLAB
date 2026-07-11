"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from "react";
import { apiGet, apiPatch, apiPost } from "@/lib/api/client";
import { defaultLabSettings } from "@/lib/constants/lab-settings";
import type { AppDataSnapshot } from "@/lib/services/app-data.service";
import type {
  User,
  UserRole,
  Doctor,
  Order,
  OrderWithRelations,
  OrderStatus,
  CreateDoctorInput,
  UpdateDoctorInput,
  CreateOrderInput,
  UpdateOrderInput,
  UpdateOrderStatusInput,
  CompleteStageInput,
  UndoStageInput,
  InventoryItem,
  InventoryType,
  InventoryMovement,
  InventoryCategory,
  AttendanceRecord,
  FileType,
  Shipment,
  Payment,
  PaymentStatus,
  Courier,
  LabSettings,
  AttendanceMethod,
  AttendanceCheckInMeta,
  AttendanceLocationMeta,
  Warehouse,
  AuditLogEntry,
} from "@/lib/types";
import { getUserRoles } from "@/lib/user-roles";
import { useLoading } from "@/providers/LoadingProvider";

const STAGE_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  DESIGN: "PRINTING_3D",
  PRINTING_3D: "MILLING",
  MILLING: "PROCESSING",
  PROCESSING: "FINISH",
  FINISH: "PACKAGING",
  PACKAGING: "SHIPPED",
};

interface AppContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  currentUser: User | null;
  login: (username: string, password: string) => Promise<User | null>;
  logout: () => Promise<void>;
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
  warehouses: Warehouse[];
  getOrderById: (id: string) => OrderWithRelations | undefined;
  getOrdersByStatus: (status: OrderStatus) => OrderWithRelations[];
  getOrdersByDoctor: (doctorId: string) => OrderWithRelations[];
  getDoctorForUser: (userId: string) => Doctor | undefined;
  getMovementsByItem: (itemId: string) => InventoryMovement[];
  getCategoryLabel: (id: string) => string;
  createOrder: (input: CreateOrderInput) => Promise<Order>;
  updateOrder: (input: UpdateOrderInput) => Promise<void>;
  updateOrderStatus: (input: UpdateOrderStatusInput) => Promise<void>;
  completeStage: (input: CompleteStageInput) => Promise<void>;
  undoStage: (input: UndoStageInput) => Promise<void>;
  addOrderFile: (orderId: string, file: File, notes?: string, folderId?: string) => Promise<void>;
  previewDeliveryNote: () => Promise<string>;
  createShipment: (orderId: string, deliveryNote: string, courier?: { name: string; phone: string }) => Promise<Shipment>;
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;
  transferInventoryCategory: (itemId: string, toCategory: string, notes?: string) => Promise<void>;
  transferInventoryWarehouse: (itemId: string, toLocation: string, notes?: string) => Promise<void>;
  stockOutInventory: (input: { itemId: string; quantity: number; reason: string; notes?: string }) => Promise<void>;
  stockInInventory: (input: { itemId: string; quantity: number; unitCost: number; supplier?: string; notes?: string }) => Promise<void>;
  getItemHistory: (itemId: string) => Promise<AuditLogEntry[]>;
  addInventoryItem: (
    item: Omit<InventoryItem, "id" | "createdAt" | "updatedAt">,
    initialCost?: number,
    imageFile?: File,
  ) => Promise<InventoryItem>;
  addInventoryMovement: (mov: Omit<InventoryMovement, "id" | "createdAt">) => Promise<void>;
  addInventoryCategory: (name: string, color: string) => Promise<InventoryCategory>;
  checkIn: (userId: string, method?: AttendanceMethod, meta?: AttendanceCheckInMeta) => Promise<void>;
  checkOut: (userId: string, method?: AttendanceMethod, meta?: AttendanceLocationMeta) => Promise<void>;
  updateAttendance: (id: string, updates: Partial<Pick<AttendanceRecord, "checkIn" | "checkOut" | "notes">>) => Promise<void>;
  addPayment: (payment: Omit<Payment, "id" | "createdAt">) => Promise<void>;
  updateDoctorBalance: (doctorId: string, amount: number, status?: PaymentStatus) => Promise<void>;
  addUser: (user: Omit<User, "id" | "createdAt" | "updatedAt">) => Promise<User>;
  updateUser: (id: string, updates: Partial<User> & { password?: string }) => Promise<void>;
  addDoctor: (input: CreateDoctorInput) => Promise<Doctor>;
  updateDoctor: (id: string, updates: UpdateDoctorInput) => Promise<Doctor>;
  updateCourier: (id: string, updates: Partial<Courier>) => Promise<void>;
  addCourier: (courier: Omit<Courier, "id">) => Promise<Courier>;
  labSettings: LabSettings;
  updateLabSettings: (updates: Partial<LabSettings>) => Promise<void>;
  getShipmentByDeliveryNote: (note: string) => Shipment | undefined;
  getUsersByRole: (role: UserRole) => User[];
  getLowStockItems: () => InventoryItem[];
  getInventoryByType: (type: InventoryType) => InventoryItem[];
  getActiveAttendance: () => AttendanceRecord[];
  resetStore: () => Promise<void>;
  getDashboardStats: () => {
    activeOrders: number;
    pendingPackaging: number;
    todayCheckIns: number;
    lowStockCount: number;
    overduePayments: number;
    monthlyRevenue: number;
    ordersByStage: Record<string, number>;
  };
}

const emptySnapshot: AppDataSnapshot = {
  users: [],
  doctors: [],
  couriers: [],
  payments: [],
  orders: [],
  inventory: [],
  inventoryCategories: [],
  movements: [],
  shipments: [],
  attendance: [],
  labSettings: defaultLabSettings,
  warehouses: [],
  auditLogs: [],
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<AppDataSnapshot>(emptySnapshot);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { run: withLoading } = useLoading();

  const refreshInternal = useCallback(async () => {
    const snapshot = await apiGet<AppDataSnapshot>("/api/data");
    setStore(snapshot);
  }, []);

  const refresh = useCallback(
    () => withLoading(refreshInternal, "טוען נתונים..."),
    [withLoading, refreshInternal],
  );

  useEffect(() => {
    async function bootstrap() {
      try {
        await withLoading(async () => {
          const me = await apiGet<{ user: User | null }>("/api/auth/me");
          if (me.user) {
            setCurrentUser(me.user);
            await refreshInternal();
          }
        }, "טוען נתונים...");
      } catch (error) {
        console.error("Bootstrap failed:", error);
      } finally {
        setIsLoading(false);
      }
    }
    void bootstrap();
  }, [withLoading, refreshInternal]);

  const login = useCallback(async (username: string, password: string): Promise<User | null> => {
    return withLoading(async () => {
      const result = await apiPost<{ user: User }>("/api/auth/login", { username, password });
      setCurrentUser(result.user);
      await refreshInternal();
      return result.user;
    }, "מתחבר...");
  }, [withLoading, refreshInternal]);

  const logout = useCallback(async () => {
    await withLoading(async () => {
      await apiPost("/api/auth/logout");
      setCurrentUser(null);
      setStore(emptySnapshot);
    }, "מתנתק...");
  }, [withLoading]);

  const orders = store.orders;

  const getOrderById = useCallback((id: string) => orders.find((o) => o.id === id), [orders]);
  const getOrdersByStatus = useCallback((status: OrderStatus) => orders.filter((o) => o.status === status), [orders]);
  const getOrdersByDoctor = useCallback((doctorId: string) => orders.filter((o) => o.doctorId === doctorId), [orders]);
  const getDoctorForUser = useCallback((userId: string) => store.doctors.find((d) => d.userId === userId), [store.doctors]);
  const getMovementsByItem = useCallback(
    (itemId: string) => store.movements.filter((m) => m.itemId === itemId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [store.movements],
  );
  const getCategoryLabel = useCallback(
    (id: string) => store.inventoryCategories.find((c) => c.id === id)?.name ?? id,
    [store.inventoryCategories],
  );

  const createOrder = useCallback(async (input: CreateOrderInput): Promise<Order> => {
    if (!currentUser) throw new Error("Not authenticated");
    return withLoading(async () => {
      const result = await apiPost<{ order: Order }>("/api/orders", input);
      await refreshInternal();
      return result.order;
    }, "שומר...");
  }, [currentUser, withLoading, refreshInternal]);

  const updateOrder = useCallback(async (input: UpdateOrderInput) => {
    if (!currentUser) return;
    await withLoading(async () => {
      await apiPatch("/api/orders/update", input);
      await refreshInternal();
    }, "שומר...");
  }, [currentUser, withLoading, refreshInternal]);

  const updateOrderStatus = useCallback(async (input: UpdateOrderStatusInput) => {
    await withLoading(async () => {
      await apiPost("/api/orders/status", input);
      await refreshInternal();
    }, "מעדכן...");
  }, [withLoading, refreshInternal]);

  const completeStage = useCallback(async (input: CompleteStageInput) => {
    if (!currentUser) return;
    await withLoading(async () => {
      await apiPost("/api/orders/stages", { action: "complete", input });
      await refreshInternal();
    }, "שומר...");
  }, [currentUser, withLoading, refreshInternal]);

  const undoStage = useCallback(async (input: UndoStageInput) => {
    if (!currentUser) return;
    await withLoading(async () => {
      await apiPost("/api/orders/stages", { action: "undo", input });
      await refreshInternal();
    }, "מעדכן...");
  }, [currentUser, withLoading, refreshInternal]);

  const addOrderFile = useCallback(async (orderId: string, file: File, notes?: string, folderId?: string) => {
    if (!currentUser) return;
    await withLoading(async () => {
      const formData = new FormData();
      formData.append("orderId", orderId);
      formData.append("file", file);
      if (notes) formData.append("notes", notes);
      if (folderId) formData.append("folderId", folderId);
      await apiPost("/api/orders/files", formData);
      await refreshInternal();
    }, "מעלה קבצים...");
  }, [currentUser, withLoading, refreshInternal]);

  const previewDeliveryNote = useCallback(async () => {
    return withLoading(async () => {
      const result = await apiGet<{ deliveryNote: string }>("/api/shipments");
      return result.deliveryNote;
    }, "טוען נתונים...");
  }, [withLoading]);

  const createShipment = useCallback(async (orderId: string, deliveryNote: string, courier?: { name: string; phone: string }) => {
    if (!currentUser) throw new Error("Not authenticated");
    return withLoading(async () => {
      const result = await apiPost<{ shipment: Shipment }>("/api/shipments", { orderId, deliveryNote, courier });
      await refreshInternal();
      return result.shipment;
    }, "שומר...");
  }, [currentUser, withLoading, refreshInternal]);

  const addInventoryMovement = useCallback(async (mov: Omit<InventoryMovement, "id" | "createdAt">) => {
    await withLoading(async () => {
      await apiPost("/api/inventory", { action: "movement", movement: mov });
      await refreshInternal();
    }, "שומר...");
  }, [withLoading, refreshInternal]);

  const addInventoryItem = useCallback(async (
    item: Omit<InventoryItem, "id" | "createdAt" | "updatedAt">,
    initialCost?: number,
    imageFile?: File,
  ) => {
    return withLoading(async () => {
      const formData = new FormData();
      formData.append("payload", JSON.stringify({ ...item, initialCost }));
      if (imageFile) formData.append("image", imageFile);
      const result = await apiPost<{ item: InventoryItem }>("/api/inventory", formData);
      await refreshInternal();
      return result.item;
    }, "שומר...");
  }, [withLoading, refreshInternal]);

  const updateInventoryItem = useCallback(async (id: string, updates: Partial<InventoryItem>) => {
    await withLoading(async () => {
      await apiPost("/api/inventory", { action: "update", itemId: id, updates });
      await refreshInternal();
    }, "שומר...");
  }, [withLoading, refreshInternal]);

  const deleteInventoryItem = useCallback(async (id: string) => {
    await withLoading(async () => {
      await apiPost("/api/inventory", { action: "delete", itemId: id });
      await refreshInternal();
    }, "מוחק...");
  }, [withLoading, refreshInternal]);

  const transferInventoryCategory = useCallback(async (itemId: string, toCategory: string, notes?: string) => {
    await withLoading(async () => {
      await apiPost("/api/inventory", { action: "transfer-category", itemId, toCategory, notes });
      await refreshInternal();
    }, "מעדכן...");
  }, [withLoading, refreshInternal]);

  const transferInventoryWarehouse = useCallback(async (itemId: string, toLocation: string, notes?: string) => {
    await withLoading(async () => {
      await apiPost("/api/inventory", { action: "transfer-warehouse", itemId, toLocation, notes });
      await refreshInternal();
    }, "מעדכן...");
  }, [withLoading, refreshInternal]);

  const stockOutInventory = useCallback(async (input: { itemId: string; quantity: number; reason: string; notes?: string }) => {
    await withLoading(async () => {
      await apiPost("/api/inventory", { action: "stock-out", ...input });
      await refreshInternal();
    }, "מעדכן...");
  }, [withLoading, refreshInternal]);

  const stockInInventory = useCallback(async (input: { itemId: string; quantity: number; unitCost: number; supplier?: string; notes?: string }) => {
    await withLoading(async () => {
      await apiPost("/api/inventory", { action: "stock-in", ...input });
      await refreshInternal();
    }, "מעדכן...");
  }, [withLoading, refreshInternal]);

  const getItemHistory = useCallback(async (itemId: string) => {
    return withLoading(async () => {
      const result = await apiPost<{ history: AuditLogEntry[] }>("/api/inventory", { action: "history", itemId });
      return result.history;
    }, "טוען נתונים...");
  }, [withLoading]);

  const addInventoryCategory = useCallback(async (name: string, color: string) => {
    return withLoading(async () => {
      const result = await apiPost<{ category: InventoryCategory }>("/api/inventory", {
        action: "category",
        category: { name, color },
      });
      await refreshInternal();
      return result.category;
    }, "שומר...");
  }, [withLoading, refreshInternal]);

  const addPayment = useCallback(async (payment: Omit<Payment, "id" | "createdAt">) => {
    await withLoading(async () => {
      await apiPost("/api/payments", { action: "add", payment });
      await refreshInternal();
    }, "שומר...");
  }, [withLoading, refreshInternal]);

  const updateDoctorBalance = useCallback(async (doctorId: string, amount: number, status?: PaymentStatus) => {
    await withLoading(async () => {
      await apiPost("/api/payments", { action: "balance", doctorId, amount, status });
      await refreshInternal();
    }, "מעדכן...");
  }, [withLoading, refreshInternal]);

  const addUser = useCallback(async (user: Omit<User, "id" | "createdAt" | "updatedAt">) => {
    return withLoading(async () => {
      const result = await apiPost<{ user: User }>("/api/people", { entity: "user", action: "add", data: user });
      await refreshInternal();
      return result.user;
    }, "שומר...");
  }, [withLoading, refreshInternal]);

  const updateUser = useCallback(async (id: string, updates: Partial<User>) => {
    await withLoading(async () => {
      await apiPost("/api/people", { entity: "user", action: "update", id, updates });
      await refreshInternal();
    }, "שומר...");
  }, [withLoading, refreshInternal]);

  const addDoctor = useCallback(async (input: CreateDoctorInput) => {
    return withLoading(async () => {
      const result = await apiPost<{ doctor: Doctor }>("/api/people", { entity: "doctor", action: "add", data: input });
      await refreshInternal();
      return result.doctor;
    }, "שומר...");
  }, [withLoading, refreshInternal]);

  const updateDoctor = useCallback(async (id: string, updates: UpdateDoctorInput) => {
    return withLoading(async () => {
      const result = await apiPost<{ doctor: Doctor }>("/api/people", { entity: "doctor", action: "update", id, updates });
      await refreshInternal();
      return result.doctor;
    }, "שומר...");
  }, [withLoading, refreshInternal]);

  const updateCourier = useCallback(async (id: string, updates: Partial<Courier>) => {
    await withLoading(async () => {
      await apiPost("/api/people", { entity: "courier", action: "update", id, updates });
      await refreshInternal();
    }, "שומר...");
  }, [withLoading, refreshInternal]);

  const addCourier = useCallback(async (courier: Omit<Courier, "id">) => {
    return withLoading(async () => {
      const result = await apiPost<{ courier: Courier }>("/api/people", { entity: "courier", action: "add", data: courier });
      await refreshInternal();
      return result.courier;
    }, "שומר...");
  }, [withLoading, refreshInternal]);

  const checkIn = useCallback(async (userId: string, method: AttendanceMethod = "NFC", meta?: AttendanceCheckInMeta) => {
    await withLoading(async () => {
      await apiPost("/api/operations", { action: "check-in", userId, method, meta });
      await refreshInternal();
    }, "שומר...");
  }, [withLoading, refreshInternal]);

  const checkOut = useCallback(async (userId: string, method: AttendanceMethod = "NFC", meta?: AttendanceLocationMeta) => {
    await withLoading(async () => {
      await apiPost("/api/operations", { action: "check-out", userId, method, meta });
      await refreshInternal();
    }, "שומר...");
  }, [withLoading, refreshInternal]);

  const updateAttendance = useCallback(async (id: string, updates: Partial<Pick<AttendanceRecord, "checkIn" | "checkOut" | "notes">>) => {
    await withLoading(async () => {
      await apiPost("/api/operations", { action: "update", id, updates });
      await refreshInternal();
    }, "שומר...");
  }, [withLoading, refreshInternal]);

  const updateLabSettings = useCallback(async (updates: Partial<LabSettings>) => {
    await withLoading(async () => {
      const result = await apiPost<{ labSettings: LabSettings }>("/api/operations", { action: "lab-settings", updates });
      setStore((prev) => ({ ...prev, labSettings: result.labSettings }));
    }, "שומר...");
  }, [withLoading]);

  const getShipmentByDeliveryNote = useCallback((note: string) => store.shipments.find((s) => s.deliveryNote === note), [store.shipments]);
  const getUsersByRole = useCallback((role: UserRole) =>
    store.users.filter((u) => u.isActive && getUserRoles(u).includes(role)),
  [store.users]);
  const getLowStockItems = useCallback(() => store.inventory.filter((i) => i.quantity <= i.minQuantity && i.isActive), [store.inventory]);
  const getInventoryByType = useCallback((type: InventoryType) => store.inventory.filter((i) => i.inventoryType === type && i.isActive), [store.inventory]);
  const getActiveAttendance = useCallback(() => store.attendance.filter((a) => !a.checkOut), [store.attendance]);

  const resetStore = useCallback(async () => {
    await logout();
  }, [logout]);

  const getDashboardStats = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const stages = ["RECEIVED", "FILES_ATTACHED", "DESIGN", "PRINTING_3D", "MILLING", "PROCESSING", "FINISH", "PACKAGING"] as const;
    const ordersByStage: Record<string, number> = {};
    stages.forEach((s) => {
      ordersByStage[s] = store.orders.filter((o) => o.status === s).length;
    });
    return {
      activeOrders: store.orders.filter((o) => !["DELIVERED", "CANCELLED", "SHIPPED"].includes(o.status)).length,
      pendingPackaging: store.orders.filter((o) => o.status === "PACKAGING").length,
      todayCheckIns: store.attendance.filter((a) => new Date(a.checkIn) >= today).length,
      lowStockCount: store.inventory.filter((i) => i.quantity <= i.minQuantity).length,
      overduePayments: store.doctors.filter((d) => d.paymentStatus === "OVERDUE").length,
      monthlyRevenue: store.payments
        .filter((p) => p.type === "PAYMENT" && p.paidAt && new Date(p.paidAt) >= monthStart)
        .reduce((s, p) => s + p.amount, 0),
      ordersByStage,
    };
  }, [store]);

  const value: AppContextValue = {
    isAuthenticated: !!currentUser,
    isLoading,
    currentUser,
    login,
    logout,
    users: store.users,
    doctors: store.doctors,
    couriers: store.couriers,
    payments: store.payments,
    orders,
    inventory: store.inventory,
    inventoryCategories: store.inventoryCategories,
    movements: store.movements,
    shipments: store.shipments,
    attendance: store.attendance,
    warehouses: store.warehouses,
    getOrderById,
    getOrdersByStatus,
    getOrdersByDoctor,
    getDoctorForUser,
    getMovementsByItem,
    getCategoryLabel,
    createOrder,
    updateOrder,
    updateOrderStatus,
    completeStage,
    undoStage,
    addOrderFile,
    previewDeliveryNote,
    createShipment,
    updateInventoryItem,
    deleteInventoryItem,
    transferInventoryCategory,
    transferInventoryWarehouse,
    stockOutInventory,
    stockInInventory,
    getItemHistory,
    addInventoryItem,
    addInventoryMovement,
    addInventoryCategory,
    checkIn,
    checkOut,
    updateAttendance,
    addPayment,
    updateDoctorBalance,
    addUser,
    updateUser,
    addDoctor,
    updateDoctor,
    updateCourier,
    addCourier,
    labSettings: store.labSettings ?? defaultLabSettings,
    updateLabSettings,
    getShipmentByDeliveryNote,
    getUsersByRole,
    getLowStockItems,
    getInventoryByType,
    getActiveAttendance,
    resetStore,
    getDashboardStats,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

// Preserve workflow stage map for any legacy imports
export { STAGE_NEXT };
