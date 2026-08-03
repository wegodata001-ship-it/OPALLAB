import { Prisma, $Enums } from "@prisma/client";
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
  CreateDoctorInput,
  CreateOrderInput,
  InventoryCategory,
  InventoryItem,
  InventoryMovement,
  LabSettings,
  Order,
  OrderFile,
  OrderStatus,
  OrderWithRelations,
  Payment,
  PaymentStatus,
  Shipment,
  UndoStageInput,
  UpdateDoctorInput,
  UpdateOrderInput,
  UpdateOrderStatusInput,
  User,
  UserRole,
} from "@/lib/types";
import { generateDeliveryNote, generateSerialNumber } from "@/lib/utils";
import {
  canCompleteStage,
  canUndoStage,
  isStageCompletionAdmin,
  PRODUCTION_STAGES,
  STAGE_COMPLETION_FORBIDDEN_MESSAGE,
} from "@/lib/workflow-permissions";
import {
  buildInventoryImagePath,
  buildStructuredOrderFilePath,
  deleteFile,
  STORAGE_BUCKETS,
  uploadFile,
} from "@/lib/supabase/storage";
import {
  routingFromUploadSlot,
  type OrderFileCategory,
  type OrderFileSlotKey,
} from "@/lib/orders/order-file-taxonomy";
import { parseSlotFromNotes } from "@/lib/orders/upload-slots";
import { defaultLabSettings } from "@/lib/constants/lab-settings";
import { filterSnapshotForUser, buildOrderWhereForUser } from "@/lib/access-control";
import { writeAuditLog } from "@/lib/audit-log";
import { createAuthUser, deleteAuthUser, updateAuthUser } from "@/lib/supabase/auth-admin";
import { normalizeUserRoles, primaryRole, isSystemAdminUser, isDoctorUser } from "@/lib/user-roles";
import { assertUserCanBeDeleted } from "@/lib/people/protected-users";
import { uploadAudit } from "@/lib/orders/upload-audit";
import type { AuditLogEntry, Warehouse } from "@/lib/types";

function toPrismaAttendanceMethod(method: AttendanceMethod): $Enums.AttendanceMethod {
  const map = $Enums.AttendanceMethod;
  if (method in map) {
    return map[method as keyof typeof map];
  }
  return map.NFC;
}

const STAGE_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  DESIGN: "PRINTING_3D",
  PRINTING_3D: "MILLING",
  MILLING: "PROCESSING",
  PROCESSING: "FINISH",
  FINISH: "PACKAGING",
  // PACKAGING → SHIPPED only via createShipment (shipping desk), never workflow "סיימתי"
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
  shipments: Awaited<ReturnType<typeof mapShipment>>[];
  attendance: ReturnType<typeof mapAttendance>[];
  labSettings: LabSettings;
  warehouses: Warehouse[];
  auditLogs: AuditLogEntry[];
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

  async getSnapshot(orderWhere?: Prisma.OrderWhereInput): Promise<AppDataSnapshot> {
    const where: Prisma.OrderWhereInput = orderWhere
      ? { AND: [{ status: { not: "DRAFT" } }, orderWhere] }
      : { status: { not: "DRAFT" } };
    const ordersQuery = prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

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
      warehouses,
    ] = await Promise.all([
      prisma.user.findMany({ orderBy: { name: "asc" } }),
      prisma.doctor.findMany({ orderBy: { name: "asc" } }),
      prisma.courier.findMany({ orderBy: { name: "asc" } }),
      prisma.payment.findMany({ orderBy: { createdAt: "desc" } }),
      ordersQuery,
      prisma.inventoryItem.findMany({ orderBy: { name: "asc" } }),
      prisma.inventoryCategory.findMany({ orderBy: { name: "asc" } }),
      prisma.inventoryMovement.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.shipment.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.attendanceRecord.findMany({ orderBy: { checkIn: "desc" } }),
      prisma.labSettings.findMany(),
      prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
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
      shipments: await Promise.all(shipments.map(mapShipment)),
      attendance: attendance.map(mapAttendance),
      labSettings: mapLabSettings(labSettingsRows),
      warehouses,
      auditLogs: [],
    };
  }

  async getSnapshotForUser(userId: string): Promise<AppDataSnapshot> {
    const user = await this.getUserById(userId);
    if (!user) throw new AppError("UNAUTHORIZED", "משתמש לא נמצא", 401);

    const doctors = await prisma.doctor.findMany({ orderBy: { name: "asc" } });
    const orderWhere = buildOrderWhereForUser(user, doctors.map(mapDoctor));
    const snapshot = await this.getSnapshot(orderWhere ?? undefined);
    return filterSnapshotForUser(snapshot, user);
  }

  async createOrder(input: CreateOrderInput, userId: string): Promise<Order> {
    const now = new Date();
    const patientName = input.patientName?.trim() || "לא צוין";
    const doctorName = input.doctorName?.trim() || "לא צוין";
    const actor = await this.getUserById(userId);

    return prisma.$transaction(async (tx) => {
      let doctorId = input.doctorId;

      // Doctors may only create orders for their own clinic profile
      if (actor && isDoctorUser(actor) && !isSystemAdminUser(actor)) {
        const linked = await tx.doctor.findFirst({ where: { userId } });
        if (!linked) throw new AppError("FORBIDDEN", "לא נמצא פרופיל רופא מקושר", 403);
        doctorId = linked.id;
      }

      if (doctorId) {
        const exists = await tx.doctor.findUnique({ where: { id: doctorId } });
        if (!exists) doctorId = undefined;
      }
      if (!doctorId) {
        if (input.doctorName?.trim()) {
          const existing = await tx.doctor.findFirst({ where: { name: doctorName } });
          if (existing) {
            doctorId = existing.id;
          } else {
            throw new AppError(
              "VALIDATION_ERROR",
              "יש לבחור רופא מהרשימה או ליצור רופא חדש עם פרטי התחברות",
              400,
            );
          }
        } else {
          throw new AppError("VALIDATION_ERROR", "יש לבחור רופא", 400);
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

  /**
   * Invisible temporary order used so files can upload before the user clicks save.
   * Excluded from order lists until finalizeDraftOrder.
   */
  async createDraftOrder(userId: string, input?: { doctorId?: string }): Promise<Order> {
    const actor = await this.getUserById(userId);
    let doctorId = input?.doctorId;

    if (actor && isDoctorUser(actor) && !isSystemAdminUser(actor)) {
      const linked = await prisma.doctor.findFirst({ where: { userId } });
      if (!linked) throw new AppError("FORBIDDEN", "לא נמצא פרופיל רופא מקושר", 403);
      doctorId = linked.id;
    } else if (doctorId) {
      const exists = await prisma.doctor.findUnique({ where: { id: doctorId } });
      if (!exists) doctorId = undefined;
    }

    const patient = await prisma.patient.create({
      data: { name: "טיוטה" },
    });

    const order = await prisma.order.create({
      data: {
        serialNumber: generateSerialNumber(),
        doctorId: doctorId ?? null,
        patientId: patient.id,
        status: "DRAFT",
        materials: [],
        workTypes: [],
        selectedTeeth: [],
      },
    });

    uploadAudit({
      step: "CREATE_DRAFT",
      orderId: order.id,
      draft: true,
      success: true,
      extra: { serialNumber: order.serialNumber, doctorId: order.doctorId },
    });
    uploadAudit({
      step: "GENERATE_ORDER_ID",
      orderId: order.id,
      draft: true,
      success: true,
      extra: { serialNumber: order.serialNumber },
    });

    return mapOrder(order);
  }

  async getDraftOrder(orderId: string, userId: string): Promise<OrderWithRelations | null> {
    const actor = await this.getUserById(userId);
    if (!actor) throw new AppError("UNAUTHORIZED", "משתמש לא נמצא", 401);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order || order.status !== "DRAFT") return null;

    if (isDoctorUser(actor) && !isSystemAdminUser(actor)) {
      const linked = await prisma.doctor.findFirst({ where: { userId } });
      if (!linked || order.doctorId !== linked.id) {
        throw new AppError("FORBIDDEN", "אין גישה לטיוטה זו", 403);
      }
    }

    return mapOrderWithRelations(order);
  }

  /** Persist form fields on a draft without finalizing. */
  async updateDraftOrder(input: UpdateOrderInput, userId: string): Promise<Order> {
    const order = await prisma.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw new AppError("NOT_FOUND", "הזמנה לא נמצאה", 404);
    if (order.status !== "DRAFT") {
      throw new AppError("VALIDATION_ERROR", "ניתן לעדכן טיוטה בלבד", 400);
    }
    await this.updateOrder(input, userId);
    const updated = await prisma.order.findUniqueOrThrow({ where: { id: input.orderId } });
    return mapOrder(updated);
  }

  /**
   * Convert a draft into a real order. Existing uploaded files stay attached.
   */
  async finalizeDraftOrder(input: CreateOrderInput & { orderId: string }, userId: string): Promise<Order> {
    const now = new Date();
    const actor = await this.getUserById(userId);

    const fileCountBefore = await prisma.orderFile.count({
      where: { orderId: input.orderId, isCurrent: true },
    });
    uploadAudit({
      step: "FINALIZE_DRAFT",
      orderId: input.orderId,
      draft: true,
      count: fileCountBefore,
      extra: { phase: "before" },
    });

    return prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({
        where: { id: input.orderId },
        include: { files: { select: { id: true } } },
      });
      if (!existing) throw new AppError("NOT_FOUND", "הזמנה לא נמצאה", 404);
      if (existing.status !== "DRAFT") {
        throw new AppError("VALIDATION_ERROR", "ההזמנה כבר נשמרה", 400);
      }

      let doctorId = input.doctorId ?? existing.doctorId ?? undefined;

      if (actor && isDoctorUser(actor) && !isSystemAdminUser(actor)) {
        const linked = await tx.doctor.findFirst({ where: { userId } });
        if (!linked) throw new AppError("FORBIDDEN", "לא נמצא פרופיל רופא מקושר", 403);
        doctorId = linked.id;
      }

      if (doctorId) {
        const exists = await tx.doctor.findUnique({ where: { id: doctorId } });
        if (!exists) doctorId = undefined;
      }
      if (!doctorId) {
        if (input.doctorName?.trim()) {
          const doctorName = input.doctorName.trim();
          const found = await tx.doctor.findFirst({ where: { name: doctorName } });
          if (found) doctorId = found.id;
          else {
            throw new AppError(
              "VALIDATION_ERROR",
              "יש לבחור רופא מהרשימה או ליצור רופא חדש עם פרטי התחברות",
              400,
            );
          }
        } else {
          throw new AppError("VALIDATION_ERROR", "יש לבחור רופא", 400);
        }
      }

      const patientName = input.patientName?.trim() || "לא צוין";
      await tx.patient.update({
        where: { id: existing.patientId },
        data: {
          name: patientName,
          age: input.patientAge ?? null,
          gender: input.patientGender ?? null,
          updatedAt: now,
        },
      });

      const hasFiles = existing.files.length > 0;
      const finalStatus = hasFiles ? "DESIGN" : "RECEIVED";

      const order = await tx.order.update({
        where: { id: existing.id },
        data: {
          doctorId: doctorId!,
          completionDate: input.completionDate ?? null,
          shade: input.shade ?? null,
          materials: input.materials ?? [],
          workTypes: input.workTypes ?? [],
          selectedTeeth: input.selectedTeeth ?? [],
          description: input.description ?? null,
          totalPrice: input.totalPrice ?? null,
          status: finalStatus,
          entryDate: now,
          updatedAt: now,
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

      if (hasFiles) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: "FILES_ATTACHED",
            changedBy: userId,
            notes: "קבצים צורפו בזמן יצירת ההזמנה",
          },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: "DESIGN",
            changedBy: userId,
            notes: "התחלת ייצור — עיצוב",
          },
        });
      }

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
    }).then((order) => {
      uploadAudit({
        step: "FINALIZE_DRAFT",
        orderId: order.id,
        draft: false,
        success: true,
        count: fileCountBefore,
        extra: {
          phase: "after",
          serialNumber: order.serialNumber,
          status: order.status,
          filesPreserved: fileCountBefore,
        },
      });
      if (fileCountBefore === 0) {
        console.warn("[upload-audit] FINALIZE with ZERO files on order", order.id);
      }
      return order;
    });
  }

  /** Delete a draft and all of its uploaded files (DB + storage). */
  async discardDraftOrder(orderId: string, userId: string): Promise<void> {
    const actor = await this.getUserById(userId);
    if (!actor) throw new AppError("UNAUTHORIZED", "משתמש לא נמצא", 401);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { files: true },
    });
    if (!order) return;
    if (order.status !== "DRAFT") {
      throw new AppError("VALIDATION_ERROR", "ניתן למחוק טיוטה בלבד", 400);
    }

    if (isDoctorUser(actor) && !isSystemAdminUser(actor)) {
      const linked = await prisma.doctor.findFirst({ where: { userId } });
      if (!linked || order.doctorId !== linked.id) {
        throw new AppError("FORBIDDEN", "אין גישה לטיוטה זו", 403);
      }
    }

    for (const file of order.files) {
      if (file.storagePath) {
        try {
          await deleteFile(STORAGE_BUCKETS.ORDER_FILES, file.storagePath);
        } catch (err) {
          console.warn("[draft] storage delete failed", file.id, err);
        }
      }
      if (file.thumbnailPath) {
        try {
          await deleteFile(STORAGE_BUCKETS.ORDER_FILES, file.thumbnailPath);
        } catch {
          /* ignore */
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.orderFile.deleteMany({ where: { orderId } });
      await tx.orderStatusHistory.deleteMany({ where: { orderId } });
      await tx.payment.deleteMany({ where: { orderId } });
      await tx.order.delete({ where: { id: orderId } });
      const otherOrders = await tx.order.count({ where: { patientId: order.patientId } });
      if (otherOrders === 0) {
        await tx.patient.delete({ where: { id: order.patientId } }).catch(() => undefined);
      }
    });
  }

  async updateOrder(input: UpdateOrderInput, userId: string): Promise<void> {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new AppError("NOT_FOUND", "הזמנה לא נמצאה", 404);

      let doctorId: string | null | undefined = input.doctorId ?? order.doctorId;
      if (input.doctorName !== undefined || input.doctorId !== undefined) {
        if (input.doctorId) {
          doctorId = input.doctorId;
        } else {
          const doctorName =
            input.doctorName?.trim() ??
            (doctorId
              ? (await tx.doctor.findUnique({ where: { id: doctorId } }))?.name
              : null) ??
            "לא צוין";
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
      throw new AppError("FORBIDDEN", STAGE_COMPLETION_FORBIDDEN_MESSAGE, 403);
    }

    const now = new Date();
    const nextStatus = STAGE_NEXT[input.stage];
    const updatedStages = { ...serializeCompletedStages(completedStages) };
    const isAdmin = isStageCompletionAdmin(currentUser);

    if (isAdmin) {
      // Override: mark all stages up to and including the selected one
      const targetIdx = PRODUCTION_STAGES.findIndex((s) => s.status === input.stage);
      for (let i = 0; i <= targetIdx; i++) {
        const s = PRODUCTION_STAGES[i].status;
        if (!updatedStages[s]) {
          updatedStages[s] = { completedBy: currentUser.id, completedAt: now.toISOString() };
        }
      }
    } else {
      updatedStages[input.stage] = { completedBy: currentUser.id, completedAt: now.toISOString() };
    }

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
            changedBy: currentUser.id,
            notes: isAdmin ? `Override: שלב ${input.stage} הושלם ע״י ניהול` : "שלב הושלם ✓",
          },
        });
      }
    });
  }

  async undoStage(input: UndoStageInput, currentUser: User): Promise<void> {
    const order = await prisma.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw new AppError("NOT_FOUND", "הזמנה לא נמצאה", 404);

    const completedStages = mapOrder(order).completedStages;
    if (!canUndoStage(currentUser, input.stage, completedStages, order.status)) {
      throw new AppError("FORBIDDEN", "אין הרשאה לבטל שלב זה", 403);
    }

    const now = new Date();
    const rest = { ...serializeCompletedStages(completedStages) };
    const isAdmin = isStageCompletionAdmin(currentUser);
    const targetIdx = PRODUCTION_STAGES.findIndex((s) => s.status === input.stage);

    if (isAdmin && targetIdx >= 0) {
      // Reopen: clear this stage and all subsequent completions
      for (let i = targetIdx; i < PRODUCTION_STAGES.length; i++) {
        delete rest[PRODUCTION_STAGES[i].status];
      }
    } else {
      delete rest[input.stage];
    }

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
          changedBy: currentUser.id,
          notes: isAdmin ? `Override: פתיחה מחדש של שלב ${input.stage}` : "ביטול סימון שלב",
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
    options?: {
      folderId?: string;
      uploadSlotId?: string | null;
      category?: OrderFileCategory;
      slotKey?: OrderFileSlotKey | string;
      versionKey?: string;
      /** When a current file exists for versionKey — required to proceed. */
      versionMode?: "new_version" | "replace";
    },
  ): Promise<OrderFile> {
    const now = new Date();
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError("NOT_FOUND", "הזמנה לא נמצאה", 404);

    const slotFromNotes = parseSlotFromNotes(file.notes);
    const routing = routingFromUploadSlot(
      options?.uploadSlotId ?? slotFromNotes,
      file.fileName,
    );
    const category = (options?.category ?? routing.category) as OrderFileCategory;
    const slotKey = String(options?.slotKey ?? (options?.category ? "General" : routing.slotKey));
    const versionKey =
      options?.versionKey ??
      (options?.category && !options?.uploadSlotId
        ? `${category}:${slotKey}:${file.fileName}`
        : routing.versionKey);

    const current = versionKey
      ? await prisma.orderFile.findFirst({
          where: { orderId, versionKey, isCurrent: true },
          orderBy: { version: "desc" },
        })
      : null;

    // Same logical file (versionKey) already current → ask replace vs new version
    if (current && !options?.versionMode) {
      throw new AppError("CONFLICT", "כבר קיים קובץ עם אותו שם", 409, {
        code: "FILE_VERSION_CONFLICT",
        existing: {
          id: current.id,
          fileName: current.fileName,
          version: current.version,
          category: current.category,
          slotKey: current.slotKey,
          uploadedAt: current.uploadedAt,
        },
      });
    }

    const nextVersion = current ? current.version + 1 : 1;
    const recordId = crypto.randomUUID();
    const storagePath = buildStructuredOrderFilePath({
      serialNumber: order.serialNumber,
      category,
      slotKey: slotKey as OrderFileSlotKey,
      version: nextVersion,
      fileName: file.fileName,
    });

    if (!file.buffer?.length) {
      throw new AppError("UPLOAD_ERROR", "תוכן הקובץ ריק — ההעלאה ל־Storage נכשלה", 400);
    }

    console.info("[addOrderFile] uploading to storage", {
      orderId,
      storagePath,
      category,
      slotKey,
      versionKey,
      bytes: file.buffer.length,
    });

    await uploadFile(STORAGE_BUCKETS.ORDER_FILES, storagePath, file.buffer, file.mimeType);

    return prisma.$transaction(async (tx) => {
      if (current) {
        await tx.orderFile.update({
          where: { id: current.id },
          data: { isCurrent: false },
        });
      }

      const created = await tx.orderFile.create({
        data: {
          id: recordId,
          orderId,
          fileName: file.fileName,
          fileType: file.fileType,
          fileSize: file.fileSize ?? file.buffer.length,
          storagePath,
          bucket: STORAGE_BUCKETS.ORDER_FILES,
          mimeType: file.mimeType,
          uploadedBy: userId,
          notes: file.notes ?? null,
          category,
          slotKey,
          versionKey,
          version: nextVersion,
          isCurrent: true,
          replacesId: current?.id ?? null,
        },
      });

      // Keep DRAFT orders in draft until finalize; only advance real orders.
      if (order.status === "RECEIVED" || order.status === "FILES_ATTACHED") {
        if (order.status === "RECEIVED") {
          await tx.orderStatusHistory.create({
            data: {
              orderId,
              status: "FILES_ATTACHED",
              changedBy: userId,
              notes: `צורף: ${file.fileName} → ${category}/${slotKey}`,
            },
          });
        }

        await tx.order.update({
          where: { id: orderId },
          data: { status: "DESIGN", updatedAt: now },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            status: "DESIGN",
            changedBy: userId,
            notes: "התחלת ייצור — עיצוב",
          },
        });
      }

      const uploader = await tx.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      return mapOrderFile(created, uploader?.name);
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
    signature?: {
      dataUrl: string;
      signerName?: string | null;
      deviceId?: string | null;
      ip?: string | null;
    },
  ): Promise<Shipment> {
    const note = deliveryNote.trim();
    if (!orderId) throw new AppError("VALIDATION_ERROR", "חסר מזהה הזמנה", 400);
    if (!note) throw new AppError("VALIDATION_ERROR", "חסר מספר תעודת משלוח", 400);
    if (!courier?.name?.trim()) {
      throw new AppError("VALIDATION_ERROR", "יש לבחור שליח לפני אישור המשלוח", 400);
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, serialNumber: true, shipment: { select: { id: true } } },
    });
    if (!order) throw new AppError("NOT_FOUND", "ההזמנה לא נמצאה", 404);
    if (order.shipment) {
      throw new AppError("VALIDATION_ERROR", "להזמנה זו כבר קיים משלוח", 409);
    }
    if (order.status === "CANCELLED") {
      throw new AppError("VALIDATION_ERROR", "לא ניתן לשלוח הזמנה מבוטלת", 400);
    }

    console.info("[shipment] create:start", {
      orderId,
      deliveryNote: note,
      userId,
      courier: courier.name,
      hasSignature: Boolean(signature?.dataUrl),
    });

    const now = new Date();
    let created;
    try {
      created = await prisma.$transaction(async (tx) => {
        const shipment = await tx.shipment.create({
          data: {
            orderId,
            deliveryNote: note,
            packagedBy: userId,
            packagedAt: now,
            shippedAt: now,
            courierName: courier.name.trim(),
            courierPhone: courier.phone?.trim() || null,
          },
        });

        await tx.order.update({
          where: { id: orderId },
          data: { status: "SHIPPED", updatedAt: now },
        });
        await tx.payment.updateMany({
          where: { orderId },
          data: { deliveryNote: note },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            status: "SHIPPED",
            changedBy: userId,
            notes: `משלוח: ${note}`,
          },
        });

        return shipment;
      });
    } catch (error) {
      console.error("[shipment] create:db-failed", { orderId, deliveryNote: note, error });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = Array.isArray(error.meta?.target)
          ? error.meta.target.join(",")
          : String(error.meta?.target ?? "");
        if (target.includes("orderId")) {
          throw new AppError("VALIDATION_ERROR", "להזמנה זו כבר קיים משלוח", 409, error.meta);
        }
        if (target.includes("deliveryNote")) {
          throw new AppError(
            "VALIDATION_ERROR",
            "מספר תעודת המשלוח כבר בשימוש — הפקו תעודה מחדש",
            409,
            error.meta,
          );
        }
        throw new AppError("VALIDATION_ERROR", "הרשומה כבר קיימת במערכת", 409, error.meta);
      }
      throw error;
    }

    console.info("[shipment] create:db-ok", { shipmentId: created.id, orderId, status: "SHIPPED" });

    await writeAuditLog({
      userId,
      action: "SHIPMENT_CREATE",
      entityType: "Shipment",
      entityId: created.id,
      details: {
        orderId,
        serialNumber: order.serialNumber,
        deliveryNote: note,
        courierName: courier.name,
        hasSignature: Boolean(signature?.dataUrl),
      },
    });
    console.info("[shipment] create:audit-ok", { shipmentId: created.id });

    if (signature?.dataUrl) {
      try {
        console.info("[shipment] create:signature-start", { shipmentId: created.id });
        const withSig = await this.setShipmentSignature(created.id, userId, signature, "add");
        console.info("[shipment] create:signature-ok", { shipmentId: created.id });
        return withSig;
      } catch (sigError) {
        // Signature is optional — never block a successful shipment confirmation.
        console.error("[shipment] create:signature-failed", {
          shipmentId: created.id,
          error: sigError instanceof Error ? sigError.message : sigError,
        });
        return await mapShipment(created);
      }
    }

    const mapped = await mapShipment(created);
    console.info("[shipment] create:done", { shipmentId: mapped.id });
    return mapped;
  }

  async setShipmentSignature(
    shipmentId: string,
    userId: string,
    signature: {
      dataUrl: string;
      signerName?: string | null;
      deviceId?: string | null;
      ip?: string | null;
    },
    mode: "add" | "replace" = "add",
  ): Promise<Shipment> {
    const existing = await prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!existing) throw new AppError("NOT_FOUND", "משלוח לא נמצא", 404);
    if (existing.lockedAt) {
      throw new AppError("FORBIDDEN", "המשלוח נעול — לא ניתן לשנות חתימה", 403);
    }

    const { storeShipmentSignaturePng, removeShipmentSignaturePng } = await import(
      "@/lib/shipping/signature-storage"
    );
    const { writeAuditLog } = await import("@/lib/audit-log");

    if (existing.recipientSignaturePath) {
      await removeShipmentSignaturePng(existing.recipientSignaturePath);
    }

    const path = await storeShipmentSignaturePng(shipmentId, signature.dataUrl);
    const signer = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const now = new Date();
    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        recipientSignaturePath: path,
        recipientSignedAt: now,
        recipientSignerName: signature.signerName?.trim() || signer?.name || null,
        recipientSignerUserId: userId,
        recipientSignatureIp: signature.ip ?? null,
        recipientSignatureDeviceId: signature.deviceId ?? null,
      },
    });

    await writeAuditLog({
      userId,
      action: mode === "replace" || existing.recipientSignaturePath
        ? "SHIPMENT_SIGNATURE_REPLACE"
        : "SHIPMENT_SIGNATURE_ADD",
      entityType: "Shipment",
      entityId: shipmentId,
      details: {
        deliveryNote: updated.deliveryNote,
        signerName: updated.recipientSignerName,
        ip: signature.ip,
        deviceId: signature.deviceId,
      },
    });

    return await mapShipment(updated);
  }

  async deleteShipmentSignature(shipmentId: string, userId: string): Promise<Shipment> {
    const existing = await prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!existing) throw new AppError("NOT_FOUND", "משלוח לא נמצא", 404);
    if (existing.lockedAt) {
      throw new AppError("FORBIDDEN", "המשלוח נעול — לא ניתן למחוק חתימה", 403);
    }

    const { removeShipmentSignaturePng } = await import("@/lib/shipping/signature-storage");
    const { writeAuditLog } = await import("@/lib/audit-log");

    await removeShipmentSignaturePng(existing.recipientSignaturePath);
    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        recipientSignaturePath: null,
        recipientSignedAt: null,
        recipientSignerName: null,
        recipientSignerUserId: null,
        recipientSignatureIp: null,
        recipientSignatureDeviceId: null,
      },
    });

    await writeAuditLog({
      userId,
      action: "SHIPMENT_SIGNATURE_DELETE",
      entityType: "Shipment",
      entityId: shipmentId,
      details: { deliveryNote: updated.deliveryNote },
    });

    return await mapShipment(updated);
  }

  async lockShipment(shipmentId: string, userId: string): Promise<Shipment> {
    const existing = await prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!existing) throw new AppError("NOT_FOUND", "משלוח לא נמצא", 404);
    if (existing.lockedAt) return await mapShipment(existing);

    const { writeAuditLog } = await import("@/lib/audit-log");
    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data: { lockedAt: new Date() },
    });
    await writeAuditLog({
      userId,
      action: "SHIPMENT_LOCK",
      entityType: "Shipment",
      entityId: shipmentId,
      details: { deliveryNote: updated.deliveryNote },
    });
    return await mapShipment(updated);
  }

  async logShipmentSignatureView(shipmentId: string, userId: string): Promise<void> {
    const { writeAuditLog } = await import("@/lib/audit-log");
    await writeAuditLog({
      userId,
      action: "SHIPMENT_SIGNATURE_VIEW",
      entityType: "Shipment",
      entityId: shipmentId,
    });
  }

  async addInventoryMovement(mov: Omit<InventoryMovement, "id" | "createdAt">): Promise<void> {
    const now = new Date();
    const affectsQuantity = mov.type === "IN" || mov.type === "OUT" || mov.type === "ADJUSTMENT";
    await prisma.$transaction(async (tx) => {
      await tx.inventoryMovement.create({ data: { ...mov, createdAt: now } });
      if (!affectsQuantity) return;
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

  async updateInventoryItem(id: string, updates: Partial<InventoryItem>, performedBy?: string): Promise<void> {
    await prisma.inventoryItem.update({
      where: { id },
      data: { ...updates, updatedAt: new Date() },
    });
    if (performedBy) {
      await prisma.inventoryMovement.create({
        data: {
          itemId: id,
          quantity: 0,
          type: "EDIT",
          unitCost: 0,
          notes: "עריכת פרטי פריט",
          performedBy,
        },
      });
      await writeAuditLog({
        userId: performedBy,
        action: "INVENTORY_EDIT",
        entityType: "InventoryItem",
        entityId: id,
        details: updates as Record<string, unknown>,
      });
    }
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

  async addUser(user: Omit<User, "id" | "createdAt" | "updatedAt">, actorId?: string): Promise<User> {
    const roles = normalizeUserRoles(user.roles?.length ? user.roles : [user.role]);
    const role = primaryRole(roles);
    const hashed = await hashPassword(user.password);
    let authUserId: string | null = null;
    try {
      authUserId = await createAuthUser(user.email, user.password);
    } catch (error) {
      if (!(error instanceof AppError && error.status === 409)) throw error;
    }

    const created = await prisma.user.create({
      data: {
        username: user.username,
        password: hashed,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role,
        roles,
        authUserId,
        nfcTagId: user.nfcTagId,
        address: user.address,
        salary: user.salary,
        salaryType: user.salaryType,
        hourlyRate: user.hourlyRate,
        color: user.color,
        isActive: user.isActive,
      },
    });

    if (actorId) {
      await writeAuditLog({
        userId: actorId,
        action: "USER_CREATE",
        entityType: "User",
        entityId: created.id,
        details: { username: created.username, roles },
      });
    }

    return mapUser(created);
  }

  async updateUser(id: string, updates: Partial<User> & { password?: string }, actorId?: string): Promise<void> {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new AppError("NOT_FOUND", "משתמש לא נמצא", 404);

    const data: Record<string, unknown> = { updatedAt: new Date() };
    const auditDetails: Record<string, unknown> = {};

    if (updates.name !== undefined) data.name = updates.name;
    if (updates.username !== undefined) data.username = updates.username;
    if (updates.phone !== undefined) data.phone = updates.phone;
    if (updates.address !== undefined) data.address = updates.address;
    if (updates.color !== undefined) data.color = updates.color;
    if (updates.salary !== undefined) data.salary = updates.salary;
    if (updates.salaryType !== undefined) data.salaryType = updates.salaryType;
    if (updates.hourlyRate !== undefined) data.hourlyRate = updates.hourlyRate;
    if (updates.isActive !== undefined) data.isActive = updates.isActive;
    if (updates.nfcTagId !== undefined) data.nfcTagId = updates.nfcTagId;

    if (updates.roles?.length) {
      const roles = normalizeUserRoles(updates.roles);
      data.roles = roles;
      data.role = primaryRole(roles);
      auditDetails.roles = roles;
    }

    if (updates.email && updates.email !== existing.email) {
      data.email = updates.email;
      auditDetails.email = { from: existing.email, to: updates.email };
      if (existing.authUserId) {
        await updateAuthUser(existing.authUserId, { email: updates.email });
      }
      if (actorId) {
        await writeAuditLog({
          userId: actorId,
          action: "EMAIL_CHANGE",
          entityType: "User",
          entityId: id,
          details: auditDetails.email as Record<string, unknown>,
        });
      }
    }

    if (updates.password?.trim()) {
      data.password = await hashPassword(updates.password);
      if (existing.authUserId) {
        await updateAuthUser(existing.authUserId, { password: updates.password });
      } else {
        const authUserId = await createAuthUser(updates.email ?? existing.email, updates.password);
        data.authUserId = authUserId;
      }
      if (actorId) {
        await writeAuditLog({
          userId: actorId,
          action: "PASSWORD_CHANGE",
          entityType: "User",
          entityId: id,
        });
      }
    }

    await prisma.user.update({ where: { id }, data });

    if (actorId) {
      await writeAuditLog({
        userId: actorId,
        action: "USER_UPDATE",
        entityType: "User",
        entityId: id,
        details: auditDetails,
      });
    }
  }

  async addDoctor(input: CreateDoctorInput, actorId?: string): Promise<ReturnType<typeof mapDoctor>> {
    const name = input.name.trim();
    const username = input.username.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password;

    if (!name) throw new AppError("VALIDATION_ERROR", "שם חובה", 400);
    if (!username) throw new AppError("VALIDATION_ERROR", "שם משתמש חובה", 400);
    if (!email) throw new AppError("VALIDATION_ERROR", "אימייל חובה", 400);
    if (!password?.trim()) throw new AppError("VALIDATION_ERROR", "סיסמה חובה", 400);
    if (input.confirmPassword !== undefined && password !== input.confirmPassword) {
      throw new AppError("VALIDATION_ERROR", "אימות הסיסמה אינו תואם", 400);
    }

    const [byUsername, byEmail] = await Promise.all([
      prisma.user.findFirst({
        where: { username: { equals: username, mode: "insensitive" } },
        select: { username: true },
      }),
      prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { email: true },
      }),
    ]);
    if (byUsername && byEmail) {
      throw new AppError(
        "VALIDATION_ERROR",
        `שם המשתמש "${username}" והאימייל כבר קיימים במערכת — יש לבחור ערכים אחרים`,
        409,
      );
    }
    if (byUsername) {
      throw new AppError(
        "VALIDATION_ERROR",
        `שם המשתמש "${username}" כבר תפוס — יש לבחור שם משתמש אחר`,
        409,
      );
    }
    if (byEmail) {
      throw new AppError(
        "VALIDATION_ERROR",
        `האימייל "${email}" כבר קיים במערכת — יש לבחור אימייל אחר`,
        409,
      );
    }

    let authUserId: string | null = null;
    try {
      authUserId = await createAuthUser(email, password);
    } catch (error) {
      if (error instanceof AppError && error.status === 409) {
        // Auth user already exists — continue and link if possible below isn't implemented;
        // surface a clear email conflict instead of a generic 500.
        throw new AppError(
          "VALIDATION_ERROR",
          `האימייל "${email}" כבר רשום במערכת ההתחברות — יש לבחור אימייל אחר`,
          409,
        );
      }
      const message = error instanceof Error ? error.message : "";
      if (/already|registered|exists|duplicate/i.test(message)) {
        throw new AppError(
          "VALIDATION_ERROR",
          `האימייל "${email}" כבר רשום במערכת ההתחברות — יש לבחור אימייל אחר`,
          409,
        );
      }
      throw error;
    }

    const hashed = await hashPassword(password);

    const doctor = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          password: hashed,
          email,
          name,
          phone: input.phone ?? null,
          role: "DOCTOR",
          roles: ["DOCTOR"],
          authUserId,
          address: input.address ?? null,
          isActive: true,
        },
      });

      return tx.doctor.create({
        data: {
          userId: user.id,
          name,
          clinic: input.clinic ?? null,
          phone: input.phone ?? null,
          email,
          address: input.address ?? null,
          balance: 0,
          paymentStatus: "PENDING",
          isActive: true,
        },
      });
    });

    if (actorId) {
      await writeAuditLog({
        userId: actorId,
        action: "DOCTOR_CREATE",
        entityType: "Doctor",
        entityId: doctor.id,
        details: { name, username, email, notes: input.notes ?? null },
      });
    }

    return mapDoctor(doctor);
  }

  async updateDoctor(id: string, input: UpdateDoctorInput, actorId?: string): Promise<ReturnType<typeof mapDoctor>> {
    const existing = await prisma.doctor.findUnique({ where: { id } });
    if (!existing) throw new AppError("NOT_FOUND", "רופא לא נמצא", 404);

    const doctorData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) doctorData.name = input.name;
    if (input.clinic !== undefined) doctorData.clinic = input.clinic;
    if (input.phone !== undefined) doctorData.phone = input.phone;
    if (input.email !== undefined) doctorData.email = input.email;
    if (input.address !== undefined) doctorData.address = input.address;
    if (input.isActive !== undefined) doctorData.isActive = input.isActive;

    let userId = existing.userId;

    if (!userId && input.username?.trim() && input.email?.trim() && input.password?.trim()) {
      const username = input.username.trim();
      const email = input.email.trim();
      const password = input.password;

      const duplicate = await prisma.user.findFirst({
        where: { OR: [{ username }, { email }] },
      });
      if (duplicate) {
        throw new AppError("VALIDATION_ERROR", "שם משתמש או אימייל כבר קיים במערכת", 409);
      }

      let authUserId: string | null = null;
      try {
        authUserId = await createAuthUser(email, password);
      } catch (error) {
        if (!(error instanceof AppError && error.status === 409)) throw error;
      }

      const hashed = await hashPassword(password);
      const updated = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            username,
            password: hashed,
            email,
            name: (input.name ?? existing.name).trim(),
            phone: input.phone ?? existing.phone,
            role: "DOCTOR",
            roles: ["DOCTOR"],
            authUserId,
            address: input.address ?? existing.address,
            isActive: input.userIsActive ?? input.isActive ?? true,
          },
        });
        return tx.doctor.update({
          where: { id },
          data: { ...doctorData, userId: user.id },
        });
      });

      if (actorId) {
        await writeAuditLog({
          userId: actorId,
          action: "DOCTOR_UPDATE",
          entityType: "Doctor",
          entityId: id,
          details: { ...input, linkedUser: true },
        });
      }

      return mapDoctor(updated);
    }

    if (userId) {
      const userUpdates: Partial<User> & { password?: string } = {};
      if (input.username !== undefined) userUpdates.username = input.username;
      if (input.email !== undefined && input.email !== null) userUpdates.email = input.email;
      if (input.password?.trim()) userUpdates.password = input.password;
      if (input.userIsActive !== undefined) userUpdates.isActive = input.userIsActive;
      if (input.name !== undefined) userUpdates.name = input.name;
      if (input.phone !== undefined) userUpdates.phone = input.phone;
      if (input.address !== undefined) userUpdates.address = input.address;
      if (input.isActive !== undefined) userUpdates.isActive = input.isActive;

      if (Object.keys(userUpdates).length > 0) {
        await this.updateUser(userId, userUpdates, actorId);
      }
    }

    const updated = await prisma.doctor.update({ where: { id }, data: doctorData });

    if (actorId) {
      await writeAuditLog({
        userId: actorId,
        action: "DOCTOR_UPDATE",
        entityType: "Doctor",
        entityId: id,
        details: input as Record<string, unknown>,
      });
    }

    return mapDoctor(updated);
  }

  async addCourier(courier: Omit<import("@/lib/types").Courier, "id">): Promise<ReturnType<typeof mapCourier>> {
    return mapCourier(await prisma.courier.create({ data: courier }));
  }

  async updateCourier(id: string, updates: Partial<import("@/lib/types").Courier>, actorId?: string): Promise<void> {
    await prisma.courier.update({ where: { id }, data: updates });
    if (actorId) {
      await writeAuditLog({
        userId: actorId,
        action: "COURIER_UPDATE",
        entityType: "Courier",
        entityId: id,
        details: updates as Record<string, unknown>,
      });
    }
  }

  async deleteUser(id: string, actorId: string): Promise<void> {
    const actor = await prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || !isSystemAdminUser(mapUser(actor))) {
      throw new AppError("FORBIDDEN", "אין הרשאה למחוק משתמשים", 403);
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new AppError("NOT_FOUND", "משתמש לא נמצא", 404);

    try {
      assertUserCanBeDeleted(mapUser(existing), actorId);
    } catch (error) {
      throw new AppError("FORBIDDEN", error instanceof Error ? error.message : "מחיקה אסורה", 403);
    }

    await prisma.$transaction(async (tx) => {
      await tx.attendanceRecord.deleteMany({ where: { userId: id } });
      await tx.auditLog.deleteMany({ where: { userId: id } });
      await tx.payment.deleteMany({ where: { employeeId: id } });
      await tx.orderStatusHistory.updateMany({ where: { changedBy: id }, data: { changedBy: actorId } });
      await tx.inventoryMovement.updateMany({ where: { performedBy: id }, data: { performedBy: actorId } });
      await tx.order.updateMany({
        where: {
          OR: [
            { assignedDesignerId: id },
            { processingEmployeeId: id },
            { finishEmployeeId: id },
          ],
        },
        data: {
          assignedDesignerId: null,
          processingEmployeeId: null,
          finishEmployeeId: null,
        },
      });
      await tx.doctor.updateMany({ where: { userId: id }, data: { userId: null } });
      await tx.user.delete({ where: { id } });
    });

    if (existing.authUserId) {
      try {
        await deleteAuthUser(existing.authUserId);
      } catch (error) {
        console.warn("[deleteUser] auth delete failed:", error);
      }
    }

    await writeAuditLog({
      userId: actorId,
      action: "USER_DELETE",
      entityType: "User",
      entityId: id,
      details: { username: existing.username, name: existing.name },
    });
  }

  async deleteDoctor(id: string, actorId: string): Promise<void> {
    const actor = await prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || !isSystemAdminUser(mapUser(actor))) {
      throw new AppError("FORBIDDEN", "אין הרשאה למחוק רופאים", 403);
    }

    const doctor = await prisma.doctor.findUnique({ where: { id } });
    if (!doctor) throw new AppError("NOT_FOUND", "רופא לא נמצא", 404);

    const orderCount = await prisma.order.count({ where: { doctorId: id } });
    if (orderCount > 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        `לא ניתן למחוק רופא עם ${orderCount} הזמנות קיימות`,
        409,
      );
    }

    const linkedUserId = doctor.userId;

    await prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { doctorId: id } });
      await tx.doctor.delete({ where: { id } });
    });

    if (linkedUserId) {
      const linked = await prisma.user.findUnique({ where: { id: linkedUserId } });
      if (linked) {
        try {
          assertUserCanBeDeleted(mapUser(linked), actorId);
          await this.deleteUser(linkedUserId, actorId);
        } catch {
          await prisma.user.delete({ where: { id: linkedUserId } }).catch(() => undefined);
          if (linked.authUserId) {
            try {
              await deleteAuthUser(linked.authUserId);
            } catch {
              /* ignore */
            }
          }
        }
      }
    }

    await writeAuditLog({
      userId: actorId,
      action: "DOCTOR_DELETE",
      entityType: "Doctor",
      entityId: id,
      details: { name: doctor.name },
    });
  }

  async deleteCourier(id: string, actorId: string): Promise<void> {
    const actor = await prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || !isSystemAdminUser(mapUser(actor))) {
      throw new AppError("FORBIDDEN", "אין הרשאה למחוק שליחים", 403);
    }

    const courier = await prisma.courier.findUnique({ where: { id } });
    if (!courier) throw new AppError("NOT_FOUND", "שליח לא נמצא", 404);

    await prisma.courier.delete({ where: { id } });

    await writeAuditLog({
      userId: actorId,
      action: "COURIER_DELETE",
      entityType: "Courier",
      entityId: id,
      details: { name: courier.name },
    });
  }

  async deleteInventoryItem(itemId: string, performedBy: string): Promise<void> {
    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) throw new AppError("NOT_FOUND", "פריט לא נמצא", 404);
    await prisma.$transaction(async (tx) => {
      await tx.inventoryMovement.create({
        data: {
          itemId,
          quantity: -item.quantity,
          type: "DELETE",
          unitCost: item.purchaseCost,
          notes: "מחיקת פריט",
          performedBy,
        },
      });
      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { isActive: false, quantity: 0, updatedAt: new Date() },
      });
    });
    await writeAuditLog({
      userId: performedBy,
      action: "INVENTORY_DELETE",
      entityType: "InventoryItem",
      entityId: itemId,
      details: { name: item.name },
    });
  }

  async transferInventoryCategory(
    itemId: string,
    toCategory: string,
    performedBy: string,
    notes?: string,
  ): Promise<void> {
    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) throw new AppError("NOT_FOUND", "פריט לא נמצא", 404);
    await prisma.$transaction([
      prisma.inventoryItem.update({
        where: { id: itemId },
        data: { inventoryType: toCategory, updatedAt: new Date() },
      }),
      prisma.inventoryMovement.create({
        data: {
          itemId,
          quantity: 0,
          type: "CATEGORY_CHANGE",
          unitCost: item.purchaseCost,
          fromCategory: item.inventoryType,
          toCategory,
          notes: notes ?? `העברה לקטגוריה ${toCategory}`,
          performedBy,
        },
      }),
    ]);
    await writeAuditLog({
      userId: performedBy,
      action: "INVENTORY_TRANSFER_CATEGORY",
      entityType: "InventoryItem",
      entityId: itemId,
      details: { from: item.inventoryType, to: toCategory },
    });
  }

  async transferInventoryWarehouse(
    itemId: string,
    toLocation: string,
    performedBy: string,
    notes?: string,
  ): Promise<void> {
    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) throw new AppError("NOT_FOUND", "פריט לא נמצא", 404);
    await prisma.$transaction([
      prisma.inventoryItem.update({
        where: { id: itemId },
        data: { location: toLocation, updatedAt: new Date() },
      }),
      prisma.inventoryMovement.create({
        data: {
          itemId,
          quantity: 0,
          type: "TRANSFER",
          unitCost: item.purchaseCost,
          fromLocation: item.location,
          toLocation,
          notes: notes ?? `העברה ל${toLocation}`,
          performedBy,
        },
      }),
    ]);
    await writeAuditLog({
      userId: performedBy,
      action: "INVENTORY_TRANSFER_WAREHOUSE",
      entityType: "InventoryItem",
      entityId: itemId,
      details: { from: item.location, to: toLocation },
    });
  }

  async stockOutInventory(input: {
    itemId: string;
    quantity: number;
    reason: string;
    performedBy: string;
    notes?: string;
  }): Promise<void> {
    await this.addInventoryMovement({
      itemId: input.itemId,
      quantity: -Math.abs(input.quantity),
      type: "OUT",
      unitCost: 0,
      reason: input.reason,
      notes: input.notes ?? input.reason,
      performedBy: input.performedBy,
    });
    await writeAuditLog({
      userId: input.performedBy,
      action: "INVENTORY_STOCK_OUT",
      entityType: "InventoryItem",
      entityId: input.itemId,
      details: { quantity: input.quantity, reason: input.reason },
    });
  }

  async stockInInventory(input: {
    itemId: string;
    quantity: number;
    unitCost: number;
    supplier?: string;
    performedBy: string;
    notes?: string;
  }): Promise<void> {
    await this.addInventoryMovement({
      itemId: input.itemId,
      quantity: Math.abs(input.quantity),
      type: "IN",
      unitCost: input.unitCost,
      supplier: input.supplier ?? null,
      notes: input.notes ?? "קליטת מלאי",
      performedBy: input.performedBy,
    });
    await writeAuditLog({
      userId: input.performedBy,
      action: "INVENTORY_STOCK_IN",
      entityType: "InventoryItem",
      entityId: input.itemId,
      details: { quantity: input.quantity, supplier: input.supplier },
    });
  }

  async getItemAuditHistory(itemId: string): Promise<AuditLogEntry[]> {
    const [movements, audits] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where: { itemId },
        orderBy: { createdAt: "desc" },
        include: { performer: { select: { name: true } } },
      }),
      prisma.auditLog.findMany({
        where: { entityType: "InventoryItem", entityId: itemId },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } } },
      }),
    ]);

    const movementEntries: AuditLogEntry[] = movements.map((m) => ({
      id: m.id,
      userId: m.performedBy,
      action: m.type,
      entityType: "InventoryItem",
      entityId: itemId,
      details: {
        quantity: m.quantity,
        notes: m.notes,
        fromCategory: m.fromCategory,
        toCategory: m.toCategory,
        fromLocation: m.fromLocation,
        toLocation: m.toLocation,
        supplier: m.supplier,
        reason: m.reason,
      },
      createdAt: m.createdAt,
      userName: m.performer.name,
    }));

    const auditEntries: AuditLogEntry[] = audits.map((a) => ({
      id: a.id,
      userId: a.userId,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      details: (a.details as Record<string, unknown> | null) ?? null,
      createdAt: a.createdAt,
      userName: a.user.name,
    }));

    return [...movementEntries, ...auditEntries].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async getOpenAttendanceRecord(userId: string) {
    return prisma.attendanceRecord.findFirst({
      where: { userId, checkOut: null },
      orderBy: { checkIn: "desc" },
    });
  }

  /**
   * Atomic check-in / check-out toggle for one employee.
   * Locks the User row and mutates attendance in the same transaction so parallel
   * QR punches cannot create two open check-ins or flip out→in on a double submit.
   */
  async toggleAttendanceForUser(
    userId: string,
    method: AttendanceMethod,
    meta?: import("@/lib/types").AttendanceCheckInMeta,
    opts?: {
      duplicateWindowMs?: number;
      /** When set, do not auto-toggle — enforce the employee-selected action. */
      intendedAction?: "check-in" | "check-out";
    },
  ): Promise<{
    action: "check-in" | "check-out";
    userId: string;
    recordId: string;
    checkIn: Date;
    checkOut: Date | null;
    durationHours: number | null;
    duplicate: boolean;
  }> {
    // Only collapses near-simultaneous duplicate requests (remount / retry),
    // not a normal second QR scan a few seconds later.
    const duplicateWindowMs = opts?.duplicateWindowMs ?? 3_500;
    const intendedAction = opts?.intendedAction;
    const { reverseGeocodeDetailed } = await import("@/lib/geocode");
    const prismaMethod = toPrismaAttendanceMethod(method);
    const device = meta?.device;
    const now = new Date();

    let geo = {
      formatted: null as string | null,
      country: null as string | null,
      city: null as string | null,
      street: null as string | null,
      houseNumber: null as string | null,
    };
    if (meta?.latitude != null && meta?.longitude != null) {
      geo = await reverseGeocodeDetailed(meta.latitude, meta.longitude);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      const openRecords = await tx.attendanceRecord.findMany({
        where: { userId, checkOut: null },
        orderBy: { checkIn: "desc" },
      });

      const latest = await tx.attendanceRecord.findFirst({
        where: { userId },
        orderBy: { checkIn: "desc" },
        select: { id: true, checkIn: true, checkOut: true },
      });

      if (intendedAction === "check-in" && openRecords.length > 0) {
        const active = openRecords[0]!;
        if (now.getTime() - active.checkIn.getTime() < duplicateWindowMs) {
          return {
            action: "check-in" as const,
            userId,
            recordId: active.id,
            checkIn: active.checkIn,
            checkOut: null,
            durationHours: null,
            duplicate: true,
          };
        }
        throw new AppError(
          "VALIDATION_ERROR",
          "כבר קיימת כניסה פתוחה — יש לבצע יציאה מהעבודה",
          409,
          { code: "ALREADY_CHECKED_IN" },
        );
      }

      if (intendedAction === "check-out" && openRecords.length === 0) {
        if (
          latest?.checkOut &&
          now.getTime() - latest.checkOut.getTime() < duplicateWindowMs
        ) {
          const durationHours =
            (latest.checkOut.getTime() - latest.checkIn.getTime()) / 3_600_000;
          return {
            action: "check-out" as const,
            userId,
            recordId: latest.id,
            checkIn: latest.checkIn,
            checkOut: latest.checkOut,
            durationHours,
            duplicate: true,
          };
        }
        throw new AppError(
          "VALIDATION_ERROR",
          "אין כניסה פתוחה — יש לבצע כניסה לעבודה תחילה",
          409,
          { code: "NO_OPEN_CHECK_IN" },
        );
      }

      // Legacy auto-toggle: duplicate punch right after check-out → return check-out.
      if (
        !intendedAction &&
        openRecords.length === 0 &&
        latest?.checkOut &&
        now.getTime() - latest.checkOut.getTime() < duplicateWindowMs
      ) {
        const durationHours =
          (latest.checkOut.getTime() - latest.checkIn.getTime()) / 3_600_000;
        return {
          action: "check-out" as const,
          userId,
          recordId: latest.id,
          checkIn: latest.checkIn,
          checkOut: latest.checkOut,
          durationHours,
          duplicate: true,
        };
      }

      if (openRecords.length > 0) {
        const [active, ...legacyOpenRecords] = openRecords;
        const exitIpNote = meta?.ipAddress ? `IP יציאה: ${meta.ipAddress}` : null;
        const notes = [active.notes, exitIpNote].filter(Boolean).join(" · ") || null;

        await tx.attendanceRecord.update({
          where: { id: active.id },
          data: {
            checkOut: now,
            method: prismaMethod,
            checkOutLatitude: meta?.latitude ?? null,
            checkOutLongitude: meta?.longitude ?? null,
            checkOutAccuracy: meta?.accuracy ?? null,
            checkOutAddress: geo.formatted,
            checkOutAddressCountry: geo.country,
            checkOutAddressCity: geo.city,
            checkOutAddressStreet: geo.street,
            checkOutAddressHouseNumber: geo.houseNumber,
            checkOutDeviceBrowser: device?.browser ?? null,
            checkOutDeviceOs: device?.os ?? null,
            checkOutDeviceType: device?.deviceType ?? null,
            checkOutUserAgent: device?.userAgent ?? null,
            checkOutScreenSize: device?.screenSize ?? null,
            checkOutTimezone: device?.timezone ?? null,
            deviceInfo: device
              ? `${device.browser} · ${device.os} · ${device.deviceType}`
              : active.deviceInfo,
            notes,
          },
        });

        if (legacyOpenRecords.length > 0) {
          await tx.attendanceRecord.updateMany({
            where: { id: { in: legacyOpenRecords.map((r) => r.id) } },
            data: { checkOut: now },
          });
        }

        const durationHours =
          (now.getTime() - active.checkIn.getTime()) / 3_600_000;
        return {
          action: "check-out" as const,
          userId,
          recordId: active.id,
          checkIn: active.checkIn,
          checkOut: now,
          durationHours,
          duplicate: false,
        };
      }

      const created = await tx.attendanceRecord.create({
        data: {
          userId,
          checkIn: now,
          method: prismaMethod,
          trustedDeviceId: meta?.trustedDeviceId ?? null,
          ipAddress: meta?.ipAddress ?? null,
          nfcTagId: user?.nfcTagId ?? null,
          latitude: meta?.latitude ?? null,
          longitude: meta?.longitude ?? null,
          checkInLatitude: meta?.latitude ?? null,
          checkInLongitude: meta?.longitude ?? null,
          checkInAccuracy: meta?.accuracy ?? null,
          checkInAddress: geo.formatted,
          checkInAddressCountry: geo.country,
          checkInAddressCity: geo.city,
          checkInAddressStreet: geo.street,
          checkInAddressHouseNumber: geo.houseNumber,
          checkInDeviceBrowser: device?.browser ?? null,
          checkInDeviceOs: device?.os ?? null,
          checkInDeviceType: device?.deviceType ?? null,
          checkInUserAgent: device?.userAgent ?? null,
          checkInScreenSize: device?.screenSize ?? null,
          checkInTimezone: device?.timezone ?? null,
          deviceInfo: device
            ? `${device.browser} · ${device.os} · ${device.deviceType}`
            : meta?.deviceInfo ?? null,
          notes: null,
        },
      });

      return {
        action: "check-in" as const,
        userId,
        recordId: created.id,
        checkIn: created.checkIn,
        checkOut: null,
        durationHours: null,
        duplicate: false,
      };
    });
  }

  async getUserByNfcTag(nfcTagId: string) {
    const tag = nfcTagId.trim();
    if (!tag) return null;
    const user = await prisma.user.findFirst({
      where: { nfcTagId: tag, isActive: true },
    });
    return user ? mapUser(user) : null;
  }

  async toggleAttendanceByNfc(
    nfcTagId: string,
    meta?: import("@/lib/types").AttendanceCheckInMeta,
  ): Promise<{
    action: "check-in" | "check-out";
    userId: string;
    userName: string;
    durationHours?: number | null;
  }> {
    const user = await this.getUserByNfcTag(nfcTagId);
    if (!user) throw new AppError("NOT_FOUND", "כרטיס NFC לא משויך לעובד פעיל", 404);

    const result = await this.toggleAttendanceForUser(user.id, "NFC", meta);
    return {
      action: result.action,
      userId: user.id,
      userName: user.name,
      durationHours: result.durationHours,
    };
  }

  async checkIn(
    userId: string,
    method: AttendanceMethod = "NFC",
    meta?: import("@/lib/types").AttendanceCheckInMeta,
  ): Promise<void> {
    const openRecord = await this.getOpenAttendanceRecord(userId);
    if (openRecord) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Employee already has an active attendance record.",
        409,
      );
    }

    const { reverseGeocodeDetailed } = await import("@/lib/geocode");
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const now = new Date();

    let geo = {
      formatted: null as string | null,
      country: null as string | null,
      city: null as string | null,
      street: null as string | null,
      houseNumber: null as string | null,
    };

    if (meta?.latitude != null && meta?.longitude != null) {
      geo = await reverseGeocodeDetailed(meta.latitude, meta.longitude);
    }

    const device = meta?.device;

    await prisma.attendanceRecord.create({
      data: {
        userId,
        checkIn: now,
        method: toPrismaAttendanceMethod(method),
        trustedDeviceId: meta?.trustedDeviceId ?? null,
        ipAddress: meta?.ipAddress ?? null,
        nfcTagId: user?.nfcTagId ?? null,
        latitude: meta?.latitude ?? null,
        longitude: meta?.longitude ?? null,
        checkInLatitude: meta?.latitude ?? null,
        checkInLongitude: meta?.longitude ?? null,
        checkInAccuracy: meta?.accuracy ?? null,
        checkInAddress: geo.formatted,
        checkInAddressCountry: geo.country,
        checkInAddressCity: geo.city,
        checkInAddressStreet: geo.street,
        checkInAddressHouseNumber: geo.houseNumber,
        checkInDeviceBrowser: device?.browser ?? null,
        checkInDeviceOs: device?.os ?? null,
        checkInDeviceType: device?.deviceType ?? null,
        checkInUserAgent: device?.userAgent ?? null,
        checkInScreenSize: device?.screenSize ?? null,
        checkInTimezone: device?.timezone ?? null,
        deviceInfo: device
          ? `${device.browser} · ${device.os} · ${device.deviceType}`
          : meta?.deviceInfo ?? null,
        notes: null,
      },
    });
  }

  async checkOut(
    userId: string,
    method: AttendanceMethod = "NFC",
    meta?: import("@/lib/types").AttendanceLocationMeta,
  ): Promise<void> {
    const { reverseGeocodeDetailed } = await import("@/lib/geocode");
    const now = new Date();
    const openRecords = await prisma.attendanceRecord.findMany({
      where: { userId, checkOut: null },
      orderBy: { checkIn: "desc" },
    });
    if (!openRecords.length) {
      throw new AppError("NOT_FOUND", "אין רישום כניסה פתוח.", 404);
    }

    const [active, ...legacyOpenRecords] = openRecords;

    let geo = {
      formatted: null as string | null,
      country: null as string | null,
      city: null as string | null,
      street: null as string | null,
      houseNumber: null as string | null,
    };

    if (meta?.latitude != null && meta?.longitude != null) {
      geo = await reverseGeocodeDetailed(meta.latitude, meta.longitude);
    }

    const device = meta?.device;

    await prisma.attendanceRecord.update({
      where: { id: active.id },
      data: {
        checkOut: now,
        method: toPrismaAttendanceMethod(method),
        checkOutLatitude: meta?.latitude ?? null,
        checkOutLongitude: meta?.longitude ?? null,
        checkOutAccuracy: meta?.accuracy ?? null,
        checkOutAddress: geo.formatted,
        checkOutAddressCountry: geo.country,
        checkOutAddressCity: geo.city,
        checkOutAddressStreet: geo.street,
        checkOutAddressHouseNumber: geo.houseNumber,
        checkOutDeviceBrowser: device?.browser ?? null,
        checkOutDeviceOs: device?.os ?? null,
        checkOutDeviceType: device?.deviceType ?? null,
        checkOutUserAgent: device?.userAgent ?? null,
        checkOutScreenSize: device?.screenSize ?? null,
        checkOutTimezone: device?.timezone ?? null,
        deviceInfo: device
          ? `${device.browser} · ${device.os} · ${device.deviceType}`
          : active.deviceInfo,
        notes: [active.notes, meta?.ipAddress ? `IP יציאה: ${meta.ipAddress}` : null]
          .filter(Boolean)
          .join(" · ") || null,
      },
    });

    if (legacyOpenRecords.length > 0) {
      await prisma.attendanceRecord.updateMany({
        where: { id: { in: legacyOpenRecords.map((r) => r.id) } },
        data: { checkOut: now },
      });
    }
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
      where: {
        isActive: true,
        OR: [{ role }, { roles: { has: role } }],
      },
      orderBy: { name: "asc" },
    });
    return users.map(mapUser);
  }
}

export const appDataService = new AppDataService();
