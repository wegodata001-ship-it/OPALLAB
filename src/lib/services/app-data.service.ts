import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import {
  hashPassword,
  labSettingsToEntries,
  mapAttendance,
  mapCourier,
  mapDoctor,
  mapInventoryCategory,
  mapInventoryItem,
  mapInventoryMovement,
  mapLabSettings,
  mapOrder,
  mapOrderFile,
  mapOrderWithRelations,
  mapPayment,
  mapShipment,
  mapUser,
  ORDER_INCLUDE,
  serializeCompletedStages,
  verifyPassword,
} from "@/lib/mappers/prisma-to-app";
import type {
  AttendanceMethod,
  CompleteStageInput,
  CreateOrderInput,
  InventoryCategory,
  InventoryItem,
  InventoryMovement,
  LabSettings,
  Order,
  OrderFile,
  OrderStatus,
  Payment,
  PaymentStatus,
  Shipment,
  UndoStageInput,
  UpdateOrderInput,
  UpdateOrderStatusInput,
  User,
  UserRole,
} from "@/lib/types";
import { generateDeliveryNote, generateSerialNumber } from "@/lib/utils";
import { canCompleteStage, canUndoStage } from "@/lib/workflow-permissions";
import {
  buildInventoryImagePath,
  buildOrderFilePath,
  STORAGE_BUCKETS,
  uploadFile,
} from "@/lib/supabase/storage";
import { defaultLabSettings } from "@/lib/constants/lab-settings";

const STAGE_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  DESIGN: "PRINTING_3D",
  PRINTING_3D: "MILLING",
  MILLING: "PROCESSING",
  PROCESSING: "FINISH",
  FINISH: "PACKAGING",
  PACKAGING: "SHIPPED",
};

export interface AppDataSnapshot {
  users: User[];
  doctors: ReturnType<typeof mapDoctor>[];
  couriers: ReturnType<typeof mapCourier>[];
  payments: Payment[];
  orders: Awaited<ReturnType<typeof mapOrderWithRelations>>[];
  inventory: InventoryItem[];
  inventoryCategories: InventoryCategory[];
  movements: InventoryMovement[];
  shipments: ReturnType<typeof mapShipment>[];
  attendance: ReturnType<typeof mapAttendance>[];
  labSettings: LabSettings;
}

export class AppDataService {
  async login(username: string, password: string): Promise<User> {
    const user = await prisma.user.findFirst({
      where: { username, isActive: true },
    });
    if (!user || !(await verifyPassword(password, user.password))) {
      throw new AppError("UNAUTHORIZED", "שם משתמש או סיסמה שגויים", 401);
    }
    return mapUser(user);
  }

  async getUserById(id: string): Promise<User | null> {
    const user = await prisma.user.findUnique({ where: { id } });
    return user ? mapUser(user) : null;
  }

  async getSnapshot(): Promise<AppDataSnapshot> {
    const [
      users,
      doctors,
      couriers,
      payments,
      orders,
      inventory,
      inventoryCategories,
      movements,
      shipments,
      attendance,
      labSettingsRows,
    ] = await Promise.all([
      prisma.user.findMany({ orderBy: { name: "asc" } }),
      prisma.doctor.findMany({ orderBy: { name: "asc" } }),
      prisma.courier.findMany({ orderBy: { name: "asc" } }),
      prisma.payment.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.order.findMany({ include: ORDER_INCLUDE, orderBy: { createdAt: "desc" } }),
      prisma.inventoryItem.findMany({ orderBy: { name: "asc" } }),
      prisma.inventoryCategory.findMany({ orderBy: { name: "asc" } }),
      prisma.inventoryMovement.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.shipment.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.attendanceRecord.findMany({ orderBy: { checkIn: "desc" } }),
      prisma.labSettings.findMany(),
    ]);

    return {
      users: users.map(mapUser),
      doctors: doctors.map(mapDoctor),
      couriers: couriers.map(mapCourier),
      payments: payments.map(mapPayment),
      orders: await Promise.all(orders.map(mapOrderWithRelations)),
      inventory: await Promise.all(inventory.map(mapInventoryItem)),
      inventoryCategories: inventoryCategories.map(mapInventoryCategory),
      movements: movements.map(mapInventoryMovement),
      shipments: shipments.map(mapShipment),
      attendance: attendance.map(mapAttendance),
      labSettings: mapLabSettings(labSettingsRows),
    };
  }

  async createOrder(input: CreateOrderInput, userId: string): Promise<Order> {
    const now = new Date();
    const patientName = input.patientName?.trim() || "לא צוין";
    const doctorName = input.doctorName?.trim() || "לא צוין";

    return prisma.$transaction(async (tx) => {
      let doctorId = input.doctorId;
      if (doctorId) {
        const exists = await tx.doctor.findUnique({ where: { id: doctorId } });
        if (!exists) doctorId = undefined;
      }
      if (!doctorId) {
        const existing = await tx.doctor.findFirst({ where: { name: doctorName } });
        if (existing) doctorId = existing.id;
        else {
          const created = await tx.doctor.create({
            data: {
              name: doctorName,
              clinic: null,
              phone: null,
              email: null,
              address: null,
            },
          });
          doctorId = created.id;
        }
      }

      const patient = await tx.patient.create({
        data: {
          name: patientName,
          age: input.patientAge ?? null,
          gender: input.patientGender ?? null,
        },
      });

      const order = await tx.order.create({
        data: {
          serialNumber: generateSerialNumber(),
          doctorId: doctorId!,
          patientId: patient.id,
          completionDate: input.completionDate ?? null,
          shade: input.shade ?? null,
          materials: input.materials ?? [],
          workTypes: input.workTypes ?? [],
          selectedTeeth: input.selectedTeeth ?? [],
          description: input.description ?? null,
          totalPrice: input.totalPrice ?? null,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: "RECEIVED",
          changedBy: userId,
          notes: "הזמנה חדשה",
        },
      });

      if (input.totalPrice) {
        await tx.payment.create({
          data: {
            doctorId: doctorId!,
            orderId: order.id,
            serialNumber: order.serialNumber,
            patientName,
            amount: input.totalPrice,
            type: "CHARGE",
            status: "PENDING",
            description: `חיוב עבודה ${order.serialNumber}`,
          },
        });
        await tx.doctor.update({
          where: { id: doctorId! },
          data: { balance: { decrement: input.totalPrice }, updatedAt: now },
        });
      }

      return mapOrder(order);
    });
  }

  async updateOrder(input: UpdateOrderInput, userId: string): Promise<void> {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new AppError("NOT_FOUND", "הזמנה לא נמצאה", 404);

      let doctorId = input.doctorId ?? order.doctorId;
      if (input.doctorName !== undefined || input.doctorId !== undefined) {
        const doctorName =
          input.doctorName?.trim() ??
          (await tx.doctor.findUnique({ where: { id: doctorId } }))?.name ??
          "לא צוין";
        if (!input.doctorId) {
          const existing = await tx.doctor.findFirst({ where: { name: doctorName } });
          if (existing) doctorId = existing.id;
          else {
            const created = await tx.doctor.create({ data: { name: doctorName } });
            doctorId = created.id;
          }
        }
      }

      const patient = await tx.patient.findUnique({ where: { id: order.patientId } });
      const patientName = input.patientName?.trim() ?? patient?.name;

      if (patient && (input.patientName !== undefined || input.patientAge !== undefined || input.patientGender !== undefined)) {
        await tx.patient.update({
          where: { id: order.patientId },
          data: {
            name: patientName ?? patient.name,
            age: input.patientAge !== undefined ? input.patientAge : patient.age,
            gender: input.patientGender !== undefined ? input.patientGender : patient.gender,
            updatedAt: now,
          },
        });
      }

      await tx.order.update({
        where: { id: input.orderId },
        data: {
          doctorId,
          shade: input.shade !== undefined ? input.shade : undefined,
          materials: input.materials,
          workTypes: input.workTypes,
          selectedTeeth: input.selectedTeeth,
          description: input.description !== undefined ? input.description : undefined,
          completionDate: input.completionDate !== undefined ? input.completionDate : undefined,
          totalPrice: input.totalPrice !== undefined ? input.totalPrice : undefined,
          notes: input.notes !== undefined ? input.notes : undefined,
          updatedAt: now,
        },
      });

      if (patientName) {
        await tx.payment.updateMany({
          where: { orderId: input.orderId },
          data: { patientName },
        });
      }

      void userId;
    });
  }

  async updateOrderStatus(input: UpdateOrderStatusInput): Promise<void> {
    const now = new Date();
    await prisma.$transaction([
      prisma.order.update({
        where: { id: input.orderId },
        data: { status: input.status, updatedAt: now },
      }),
      prisma.orderStatusHistory.create({
        data: {
          orderId: input.orderId,
          status: input.status,
          changedBy: input.changedBy,
          notes: input.notes ?? null,
        },
      }),
    ]);
  }

  async completeStage(input: CompleteStageInput, currentUser: User): Promise<void> {
    const order = await prisma.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw new AppError("NOT_FOUND", "הזמנה לא נמצאה", 404);

    const completedStages = mapOrder(order).completedStages;
    if (!canCompleteStage(currentUser, input.stage, order.status, completedStages)) {
      throw new AppError("FORBIDDEN", "אין הרשאה להשלים שלב זה", 403);
    }

    const now = new Date();
    const nextStatus = STAGE_NEXT[input.stage];
    const updatedStages = {
      ...serializeCompletedStages(completedStages),
      [input.stage]: { completedBy: input.completedBy, completedAt: now },
    };

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: input.orderId },
        data: {
          completedStages: updatedStages,
          status: nextStatus ?? order.status,
          updatedAt: now,
        },
      });
      if (nextStatus) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: input.orderId,
            status: nextStatus,
            changedBy: input.completedBy,
            notes: "שלב הושלם ✓",
          },
        });
      }
    });
  }

  async undoStage(input: UndoStageInput, currentUser: User): Promise<void> {
    const order = await prisma.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw new AppError("NOT_FOUND", "הזמנה לא נמצאה", 404);

    const completedStages = mapOrder(order).completedStages;
    if (!canUndoStage(currentUser, input.stage, completedStages)) {
      throw new AppError("FORBIDDEN", "אין הרשאה לבטל שלב זה", 403);
    }

    const now = new Date();
    const rest = { ...serializeCompletedStages(completedStages) };
    delete rest[input.stage];

    await prisma.$transaction([
      prisma.order.update({
        where: { id: input.orderId },
        data: {
          completedStages: rest,
          status: input.stage,
          updatedAt: now,
        },
      }),
      prisma.orderStatusHistory.create({
        data: {
          orderId: input.orderId,
          status: input.stage,
          changedBy: input.undoneBy,
          notes: "ביטול סימון שלב",
        },
      }),
    ]);
  }

  async addOrderFile(
    orderId: string,
    userId: string,
    file: {
      fileName: string;
      fileType: OrderFile["fileType"];
      fileSize?: number;
      notes?: string;
      mimeType: string;
      buffer: Buffer;
    },
  ): Promise<OrderFile> {
    const now = new Date();
    const fileId = crypto.randomUUID();
    const storagePath = buildOrderFilePath(orderId, fileId, file.fileName);

    await uploadFile(STORAGE_BUCKETS.ORDER_FILES, storagePath, file.buffer, file.mimeType);

    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new AppError("NOT_FOUND", "הזמנה לא נמצאה", 404);

      const created = await tx.orderFile.create({
        data: {
          id: fileId,
          orderId,
          fileName: file.fileName,
          fileType: file.fileType,
          fileSize: file.fileSize ?? file.buffer.length,
          storagePath,
          bucket: STORAGE_BUCKETS.ORDER_FILES,
          mimeType: file.mimeType,
          uploadedBy: userId,
          notes: file.notes ?? null,
        },
      });

      if (order.status === "RECEIVED") {
        await tx.order.update({
          where: { id: orderId },
          data: { status: "FILES_ATTACHED", updatedAt: now },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            status: "FILES_ATTACHED",
            changedBy: userId,
            notes: `צורף: ${file.fileName}`,
          },
        });
      }

      return mapOrderFile(created);
    });
  }

  previewDeliveryNote(): string {
    return generateDeliveryNote();
  }

  async createShipment(
    orderId: string,
    deliveryNote: string,
    userId: string,
    courier?: { name: string; phone: string },
  ): Promise<Shipment> {
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: {
          orderId,
          deliveryNote,
          packagedBy: userId,
          packagedAt: now,
          shippedAt: now,
          courierName: courier?.name ?? null,
          courierPhone: courier?.phone ?? null,
        },
      });

      await tx.order.update({
        where: { id: orderId },
        data: { status: "SHIPPED", updatedAt: now },
      });
      await tx.payment.updateMany({
        where: { orderId },
        data: { deliveryNote },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: "SHIPPED",
          changedBy: userId,
          notes: `משלוח: ${deliveryNote}`,
        },
      });

      return mapShipment(shipment);
    });
  }

  async addInventoryMovement(mov: Omit<InventoryMovement, "id" | "createdAt">): Promise<void> {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.inventoryMovement.create({ data: { ...mov, createdAt: now } });
      const item = await tx.inventoryItem.findUnique({ where: { id: mov.itemId } });
      if (!item) throw new AppError("NOT_FOUND", "פריט מלאי לא נמצא", 404);
      const newQty = Math.max(0, item.quantity + mov.quantity);
      const newCost = mov.type === "IN" && mov.quantity > 0 ? mov.unitCost : item.purchaseCost;
      await tx.inventoryItem.update({
        where: { id: mov.itemId },
        data: { quantity: newQty, purchaseCost: newCost, updatedAt: now },
      });
    });
  }

  async addInventoryItem(
    item: Omit<InventoryItem, "id" | "createdAt" | "updatedAt">,
    performedBy: string,
    initialCost?: number,
    imageFile?: { buffer: Buffer; fileName: string; mimeType: string },
  ): Promise<InventoryItem> {
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      let storagePath: string | null = null;
      let imageUrl: string | null = item.imageUrl ?? null;

      const created = await tx.inventoryItem.create({
        data: {
          inventoryType: item.inventoryType,
          name: item.name,
          barcode: item.barcode,
          description: item.description,
          imageUrl,
          purchaseCost: item.purchaseCost,
          quantity: item.quantity,
          minQuantity: item.minQuantity,
          unit: item.unit,
          location: item.location,
          isActive: item.isActive,
        },
      });

      if (imageFile) {
        storagePath = buildInventoryImagePath(created.id, imageFile.fileName);
        await uploadFile(STORAGE_BUCKETS.INVENTORY_IMAGES, storagePath, imageFile.buffer, imageFile.mimeType);
        await tx.inventoryItem.update({
          where: { id: created.id },
          data: { storagePath, imageUrl: storagePath },
        });
      }

      if (item.quantity > 0) {
        await tx.inventoryMovement.create({
          data: {
            itemId: created.id,
            quantity: item.quantity,
            type: "IN",
            unitCost: initialCost ?? item.purchaseCost,
            notes: "מלאי ראשוני",
            performedBy,
          },
        });
      }

      return mapInventoryItem(
        await tx.inventoryItem.findUniqueOrThrow({ where: { id: created.id } }),
      );
    });
  }

  async updateInventoryItem(id: string, updates: Partial<InventoryItem>): Promise<void> {
    await prisma.inventoryItem.update({
      where: { id },
      data: { ...updates, updatedAt: new Date() },
    });
  }

  async addInventoryCategory(name: string, color: string): Promise<InventoryCategory> {
    const id = `${name.toUpperCase().replace(/\s+/g, "_").slice(0, 20)}_${Date.now().toString(36)}`;
    return mapInventoryCategory(
      await prisma.inventoryCategory.create({
        data: { id, name, color, isSystem: false },
      }),
    );
  }

  async addPayment(payment: Omit<Payment, "id" | "createdAt">): Promise<void> {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.payment.create({ data: { ...payment, createdAt: now } });
      if (payment.doctorId) {
        const delta =
          payment.type === "PAYMENT" ? payment.amount : payment.type === "CHARGE" ? -payment.amount : 0;
        if (delta !== 0) {
          await tx.doctor.update({
            where: { id: payment.doctorId },
            data: {
              balance: { increment: delta },
              paymentStatus: payment.status,
              updatedAt: now,
            },
          });
        }
      }
    });
  }

  async updateDoctorBalance(doctorId: string, amount: number, status?: PaymentStatus): Promise<void> {
    await prisma.doctor.update({
      where: { id: doctorId },
      data: {
        balance: amount,
        paymentStatus: status,
        updatedAt: new Date(),
      },
    });
  }

  async addUser(user: Omit<User, "id" | "createdAt" | "updatedAt">): Promise<User> {
    const hashed = await hashPassword(user.password);
    const created = await prisma.user.create({
      data: {
        username: user.username,
        password: hashed,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        nfcTagId: user.nfcTagId,
        address: user.address,
        salary: user.salary,
        salaryType: user.salaryType,
        hourlyRate: user.hourlyRate,
        color: user.color,
        isActive: user.isActive,
      },
    });
    return mapUser(created);
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
    const data: Record<string, unknown> = { ...updates, updatedAt: new Date() };
    delete data.id;
    delete data.createdAt;
    if (updates.password) {
      data.password = await hashPassword(updates.password);
    } else {
      delete data.password;
    }
    await prisma.user.update({ where: { id }, data });
  }

  async addDoctor(
    doctor: Omit<import("@/lib/types").Doctor, "id" | "createdAt" | "updatedAt" | "balance" | "paymentStatus">,
  ): Promise<ReturnType<typeof mapDoctor>> {
    return mapDoctor(
      await prisma.doctor.create({
        data: { ...doctor, balance: 0, paymentStatus: "PENDING" },
      }),
    );
  }

  async updateDoctor(id: string, updates: Partial<import("@/lib/types").Doctor>): Promise<void> {
    const data = { ...updates, updatedAt: new Date() };
    delete (data as { id?: string }).id;
    delete (data as { createdAt?: Date }).createdAt;
    await prisma.doctor.update({ where: { id }, data });
  }

  async addCourier(courier: Omit<import("@/lib/types").Courier, "id">): Promise<ReturnType<typeof mapCourier>> {
    return mapCourier(await prisma.courier.create({ data: courier }));
  }

  async checkIn(
    userId: string,
    method: AttendanceMethod = "NFC",
    meta?: { wifiSsid?: string; latitude?: number; longitude?: number },
  ): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const now = new Date();
    await prisma.attendanceRecord.create({
      data: {
        userId,
        checkIn: now,
        method,
        nfcTagId: user?.nfcTagId ?? null,
        latitude: meta?.latitude ?? 32.8644,
        longitude: meta?.longitude ?? 35.2978,
        notes: meta?.wifiSsid ? `WiFi: ${meta.wifiSsid}` : null,
      },
    });
  }

  async checkOut(userId: string, method: AttendanceMethod = "NFC"): Promise<void> {
    const now = new Date();
    const active = await prisma.attendanceRecord.findFirst({
      where: { userId, checkOut: null },
      orderBy: { checkIn: "desc" },
    });
    if (!active) return;
    await prisma.attendanceRecord.update({
      where: { id: active.id },
      data: { checkOut: now, method },
    });
  }

  async updateAttendance(
    id: string,
    updates: Partial<Pick<import("@/lib/types").AttendanceRecord, "checkIn" | "checkOut" | "notes">>,
  ): Promise<void> {
    await prisma.attendanceRecord.update({ where: { id }, data: updates });
  }

  async updateLabSettings(updates: Partial<LabSettings>): Promise<LabSettings> {
    const current = mapLabSettings(await prisma.labSettings.findMany());
    const merged = { ...current, ...updates };
    const entries = labSettingsToEntries(merged);
    await prisma.$transaction(
      entries.map((entry) =>
        prisma.labSettings.upsert({
          where: { key: entry.key },
          create: entry,
          update: { value: entry.value },
        }),
      ),
    );
    return merged;
  }

  async getUsersByRole(role: UserRole): Promise<User[]> {
    const users = await prisma.user.findMany({
      where: { role, isActive: true },
      orderBy: { name: "asc" },
    });
    return users.map(mapUser);
  }
}

export const appDataService = new AppDataService();
