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
import { canCompleteStage, canUndoStage } from "@/lib/workflow-permissions";
import {
  buildInventoryImagePath,
  buildOrderFilePath,
  STORAGE_BUCKETS,
  uploadFile,
} from "@/lib/supabase/storage";
import { defaultLabSettings } from "@/lib/constants/lab-settings";
import { filterSnapshotForUser } from "@/lib/access-control";
import { writeAuditLog } from "@/lib/audit-log";
import { createAuthUser, updateAuthUser } from "@/lib/supabase/auth-admin";
import { normalizeUserRoles, primaryRole } from "@/lib/user-roles";
import type { AuditLogEntry, Warehouse } from "@/lib/types";

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
      warehouses,
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
      shipments: shipments.map(mapShipment),
      attendance: attendance.map(mapAttendance),
      labSettings: mapLabSettings(labSettingsRows),
      warehouses,
      auditLogs: [],
    };
  }

  async getSnapshotForUser(userId: string): Promise<AppDataSnapshot> {
    const user = await this.getUserById(userId);
    if (!user) throw new AppError("UNAUTHORIZED", "משתמש לא נמצא", 401);
    const snapshot = await this.getSnapshot();
    return filterSnapshotForUser(snapshot, user);
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
    options?: { folderId?: string },
  ): Promise<OrderFile> {
    const now = new Date();
    const folderId = options?.folderId ?? crypto.randomUUID();
    const recordId = crypto.randomUUID();
    const storagePath = buildOrderFilePath(orderId, folderId, file.fileName);

    await uploadFile(STORAGE_BUCKETS.ORDER_FILES, storagePath, file.buffer, file.mimeType);

    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new AppError("NOT_FOUND", "הזמנה לא נמצאה", 404);

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
    const email = input.email.trim();
    const password = input.password;

    if (!name) throw new AppError("VALIDATION_ERROR", "שם חובה", 400);
    if (!username) throw new AppError("VALIDATION_ERROR", "שם משתמש חובה", 400);
    if (!email) throw new AppError("VALIDATION_ERROR", "אימייל חובה", 400);
    if (!password?.trim()) throw new AppError("VALIDATION_ERROR", "סיסמה חובה", 400);
    if (input.confirmPassword !== undefined && password !== input.confirmPassword) {
      throw new AppError("VALIDATION_ERROR", "אימות הסיסמה אינו תואם", 400);
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (existingUser) {
      throw new AppError("VALIDATION_ERROR", "שם משתמש או אימייל כבר קיים במערכת", 409);
    }

    let authUserId: string | null = null;
    try {
      authUserId = await createAuthUser(email, password);
    } catch (error) {
      if (!(error instanceof AppError && error.status === 409)) throw error;
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
