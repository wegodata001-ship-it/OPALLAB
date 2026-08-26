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
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/client";
import { shippingLog, shippingTimed } from "@/lib/shipping/action-log";
import { uploadOrderFileWithProgress } from "@/lib/orders/upload-with-progress";
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
  SplintType,
  OrderCatalogOption,
} from "@/lib/types";
import { getUserRoles } from "@/lib/user-roles";
import { useLoading } from "@/providers/LoadingProvider";

const STAGE_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  DESIGN: "PRINTING_3D",
  PRINTING_3D: "MILLING",
  MILLING: "PROCESSING",
  PROCESSING: "FINISH",
  FINISH: "PACKAGING",
  // PACKAGING stays until createShipment — avoids vanishing from shipping desk
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
  splintTypes: SplintType[];
  orderCatalog: OrderCatalogOption[];
  getOrderById: (id: string) => OrderWithRelations | undefined;
  getOrdersByStatus: (status: OrderStatus) => OrderWithRelations[];
  getOrdersByDoctor: (doctorId: string) => OrderWithRelations[];
  getDoctorForUser: (userId: string) => Doctor | undefined;
  getMovementsByItem: (itemId: string) => InventoryMovement[];
  getCategoryLabel: (id: string) => string;
  createOrder: (
    input: CreateOrderInput,
    options?: { skipRefresh?: boolean },
  ) => Promise<Order>;
  refresh: () => Promise<void>;
  /** Snapshot refresh without fullscreen overlay (packing/shipping). */
  refreshQuiet: () => Promise<void>;
  updateOrder: (input: UpdateOrderInput) => Promise<void>;
  updateOrderStatus: (input: UpdateOrderStatusInput) => Promise<void>;
  completeStage: (input: CompleteStageInput) => Promise<void>;
  undoStage: (input: UndoStageInput) => Promise<void>;
  addOrderFile: (
    orderId: string,
    file: File,
    notes?: string,
    folderId?: string,
    meta?: {
      category?: string;
      slotKey?: string;
      versionMode?: "new_version" | "replace";
      uploadSlotId?: string;
    },
    onProgress?: (pct: number, meta?: { loaded: number; total: number; fileName: string }) => void,
  ) => Promise<void>;
  previewDeliveryNote: () => Promise<string>;
  createShipment: (
    orderId: string,
    deliveryNote: string,
    courier?: { name: string; phone: string },
    signature?: { dataUrl: string; signerName?: string | null; deviceId?: string | null } | null,
  ) => Promise<Shipment>;
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
  createSplintType: (input: { name: string; code?: string }) => Promise<SplintType>;
  updateSplintType: (input: {
    id: string;
    name?: string;
    isActive?: boolean;
    sortOrder?: number;
  }) => Promise<void>;
  reorderSplintTypes: (orderedIds: string[]) => Promise<void>;
  deleteSplintType: (id: string) => Promise<void>;
  checkIn: (userId: string, method?: AttendanceMethod, meta?: AttendanceCheckInMeta) => Promise<void>;
  checkOut: (userId: string, method?: AttendanceMethod, meta?: AttendanceLocationMeta) => Promise<void>;
  updateAttendance: (id: string, updates: Partial<Pick<AttendanceRecord, "checkIn" | "checkOut" | "notes">>) => Promise<void>;
  addPayment: (payment: Omit<Payment, "id" | "createdAt">) => Promise<void>;
  updateDoctorBalance: (doctorId: string, amount: number, status?: PaymentStatus) => Promise<void>;
  addUser: (user: Omit<User, "id" | "createdAt" | "updatedAt">) => Promise<User>;
  updateUser: (id: string, updates: Partial<User> & { password?: string }) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  addDoctor: (input: CreateDoctorInput) => Promise<Doctor>;
  updateDoctor: (id: string, updates: UpdateDoctorInput) => Promise<Doctor>;
  deleteDoctor: (id: string) => Promise<void>;
  updateCourier: (id: string, updates: Partial<Courier>) => Promise<void>;
  deleteCourier: (id: string) => Promise<void>;
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
  splintTypes: [],
  orderCatalog: [],
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

  /** Full snapshot without blocking fullscreen overlay (shipping/packing path). */
  const quietRefresh = useCallback(async () => {
    await refreshInternal();
  }, [refreshInternal]);

  const refresh = useCallback(
    () => withLoading(refreshInternal, "טוען נתונים..."),
    [withLoading, refreshInternal],
  );

  const patchOrderStatus = useCallback((orderId: string, status: OrderStatus) => {
    setStore((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.id === orderId ? { ...o, status, updatedAt: new Date() } : o,
      ),
    }));
  }, []);

  const upsertShipment = useCallback((shipment: Shipment) => {
    setStore((prev) => {
      const exists = prev.shipments.some((s) => s.id === shipment.id);
      const shipments = exists
        ? prev.shipments.map((s) => (s.id === shipment.id ? { ...s, ...shipment } : s))
        : [shipment, ...prev.shipments];
      const orders = prev.orders.map((o) =>
        o.id === shipment.orderId
          ? { ...o, status: "SHIPPED" as OrderStatus, updatedAt: new Date() }
          : o,
      );
      return { ...prev, shipments, orders };
    });
  }, []);

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

  const createOrder = useCallback(async (
    input: CreateOrderInput,
    options?: { skipRefresh?: boolean },
  ): Promise<Order> => {
    if (!currentUser) throw new Error("Not authenticated");
    return withLoading(async () => {
      const result = await apiPost<{ order: Order }>("/api/orders", input);
      // Skip refresh when caller still needs local upload state (file tiles) intact.
      if (!options?.skipRefresh) await refreshInternal();
      return result.order;
    }, "שומר הזמנה...");
  }, [currentUser, withLoading, refreshInternal]);

  const updateOrder = useCallback(async (input: UpdateOrderInput) => {
    if (!currentUser) return;
    await withLoading(async () => {
      await apiPatch("/api/orders/update", input);
      await refreshInternal();
    }, "שומר...");
  }, [currentUser, withLoading, refreshInternal]);

  const updateOrderStatus = useCallback(async (input: UpdateOrderStatusInput) => {
    // No global overlay — packing/shipping buttons stay responsive; optimistic patch + quiet refresh.
    const timer = shippingTimed("updateOrderStatus");
    shippingLog("api:start", "updateOrderStatus", { orderId: input.orderId, status: input.status });
    patchOrderStatus(input.orderId, input.status);
    try {
      await apiPost("/api/orders/status", input);
      timer.end("api:end", { ok: true });
      void quietRefresh().then(() => shippingLog("ui:updated", "updateOrderStatus"));
    } catch (error) {
      await quietRefresh().catch(() => undefined);
      timer.end("error", { message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }, [patchOrderStatus, quietRefresh]);

  const completeStage = useCallback(async (input: CompleteStageInput) => {
    if (!currentUser) return;
    const timer = shippingTimed("completeStage");
    shippingLog("api:start", "completeStage", { orderId: input.orderId, stage: input.stage });
    try {
      await apiPost("/api/orders/stages", { action: "complete", input });
      // Optimistic advance when STAGE_NEXT is defined (PACKAGING no longer jumps to SHIPPED)
      const next = STAGE_NEXT[input.stage];
      if (next) patchOrderStatus(input.orderId, next);
      timer.end("api:end", { ok: true });
      await quietRefresh();
      shippingLog("ui:updated", "completeStage");
    } catch (error) {
      timer.end("error", { message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }, [currentUser, patchOrderStatus, quietRefresh]);

  const undoStage = useCallback(async (input: UndoStageInput) => {
    if (!currentUser) return;
    const timer = shippingTimed("undoStage");
    shippingLog("api:start", "undoStage", { orderId: input.orderId, stage: input.stage });
    try {
      await apiPost("/api/orders/stages", { action: "undo", input });
      timer.end("api:end", { ok: true });
      await quietRefresh();
      shippingLog("ui:updated", "undoStage");
    } catch (error) {
      timer.end("error", { message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }, [currentUser, quietRefresh]);

  const addOrderFile = useCallback(async (
    orderId: string,
    file: File,
    notes?: string,
    folderId?: string,
    meta?: {
      category?: string;
      slotKey?: string;
      versionMode?: "new_version" | "replace";
      uploadSlotId?: string;
    },
    onProgress?: (pct: number, meta?: { loaded: number; total: number; fileName: string }) => void,
  ) => {
    if (!currentUser) throw new Error("Not authenticated");
    // Skip global loading overlay when caller tracks progress (avoids blocking UI).
    const run = async () => {
      console.info("[addOrderFile] direct storage upload", {
        orderId,
        fileName: file.name,
        size: file.size,
      });
      await uploadOrderFileWithProgress({
        orderId,
        file,
        notes,
        folderId,
        category: meta?.category,
        slotKey: meta?.slotKey,
        versionMode: meta?.versionMode,
        uploadSlotId: meta?.uploadSlotId,
        onProgress,
      });
      await refreshInternal();
    };
    if (onProgress) {
      await run();
      return;
    }
    await withLoading(run, "מעלה קבצים...");
  }, [currentUser, withLoading, refreshInternal]);

  const previewDeliveryNote = useCallback(async () => {
    const timer = shippingTimed("previewDeliveryNote");
    shippingLog("api:start", "previewDeliveryNote");
    const result = await apiGet<{ deliveryNote: string }>("/api/shipments");
    timer.end("api:end", { note: result.deliveryNote });
    return result.deliveryNote;
  }, []);

  const createShipment = useCallback(async (
    orderId: string,
    deliveryNote: string,
    courier?: { name: string; phone: string },
    signature?: { dataUrl: string; signerName?: string | null; deviceId?: string | null } | null,
  ) => {
    if (!currentUser) throw new Error("נדרשת התחברות");
    const timer = shippingTimed("createShipment");
    shippingLog("api:start", "createShipment", {
      orderId,
      deliveryNote,
      courier: courier?.name,
      hasSignature: Boolean(signature?.dataUrl),
    });
    // Scoped UI loading lives on the shipping page — never block the whole app.
    const result = await apiPost<{ shipment: Shipment }>("/api/shipments", {
      orderId,
      deliveryNote,
      courier,
      signature: signature ?? null,
    });
    upsertShipment(result.shipment);
    timer.end("api:end", { shipmentId: result.shipment?.id });
    shippingLog("ui:updated", "createShipment", { shipmentId: result.shipment.id });
    void quietRefresh().catch((refreshError) => {
      console.error("[shipment:ui] quietRefresh:failed", refreshError);
    });
    return result.shipment;
  }, [currentUser, upsertShipment, quietRefresh]);

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

  const createSplintType = useCallback(
    async (input: { name: string; code?: string }) => {
      return withLoading(async () => {
        const result = await apiPost<{ splintType: SplintType }>("/api/splint-types", input);
        await refreshInternal();
        return result.splintType;
      }, "שומר...");
    },
    [withLoading, refreshInternal],
  );

  const updateSplintType = useCallback(
    async (input: { id: string; name?: string; isActive?: boolean; sortOrder?: number }) => {
      await withLoading(async () => {
        await apiPatch("/api/splint-types", input);
        await refreshInternal();
      }, "שומר...");
    },
    [withLoading, refreshInternal],
  );

  const reorderSplintTypes = useCallback(
    async (orderedIds: string[]) => {
      await withLoading(async () => {
        await apiPatch("/api/splint-types", { orderedIds });
        await refreshInternal();
      }, "שומר...");
    },
    [withLoading, refreshInternal],
  );

  const deleteSplintType = useCallback(
    async (id: string) => {
      await withLoading(async () => {
        await apiDelete(`/api/splint-types?id=${encodeURIComponent(id)}`);
        await refreshInternal();
      }, "מוחק...");
    },
    [withLoading, refreshInternal],
  );

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

  const deleteUser = useCallback(async (id: string) => {
    await withLoading(async () => {
      await apiPost("/api/people", { entity: "user", action: "delete", id });
      await refreshInternal();
    }, "מוחק...");
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

  const deleteDoctor = useCallback(async (id: string) => {
    await withLoading(async () => {
      await apiPost("/api/people", { entity: "doctor", action: "delete", id });
      await refreshInternal();
    }, "מוחק...");
  }, [withLoading, refreshInternal]);

  const updateCourier = useCallback(async (id: string, updates: Partial<Courier>) => {
    await withLoading(async () => {
      await apiPost("/api/people", { entity: "courier", action: "update", id, updates });
      await refreshInternal();
    }, "שומר...");
  }, [withLoading, refreshInternal]);

  const deleteCourier = useCallback(async (id: string) => {
    await withLoading(async () => {
      await apiPost("/api/people", { entity: "courier", action: "delete", id });
      await refreshInternal();
    }, "מוחק...");
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
    splintTypes: store.splintTypes ?? [],
    orderCatalog: store.orderCatalog ?? [],
    getOrderById,
    getOrdersByStatus,
    getOrdersByDoctor,
    getDoctorForUser,
    getMovementsByItem,
    getCategoryLabel,
    createOrder,
    refresh,
    refreshQuiet: quietRefresh,
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
    createSplintType,
    updateSplintType,
    reorderSplintTypes,
    deleteSplintType,
    checkIn,
    checkOut,
    updateAttendance,
    addPayment,
    updateDoctorBalance,
    addUser,
    updateUser,
    deleteUser,
    addDoctor,
    updateDoctor,
    deleteDoctor,
    updateCourier,
    deleteCourier,
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
