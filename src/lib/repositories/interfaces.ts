/**
 * Repository interfaces for future Prisma + Supabase integration.
 * Replace MockDataProvider implementations with real database calls.
 */

import type {
  Order,
  OrderWithRelations,
  CreateOrderInput,
  UpdateOrderStatusInput,
  InventoryItem,
  AttendanceRecord,
  OrderFile,
  FileType,
  Shipment,
  InventoryType,
  User,
  UserRole,
} from "@/lib/types";

export interface IOrderRepository {
  findAll(): Promise<OrderWithRelations[]>;
  findById(id: string): Promise<OrderWithRelations | null>;
  findByStatus(status: Order["status"]): Promise<OrderWithRelations[]>;
  findByDoctor(doctorId: string): Promise<OrderWithRelations[]>;
  create(input: CreateOrderInput, userId: string): Promise<Order>;
  updateStatus(input: UpdateOrderStatusInput): Promise<void>;
  addFile(orderId: string, file: Omit<OrderFile, "id" | "orderId" | "uploadedAt">): Promise<OrderFile>;
}

export interface IInventoryRepository {
  findByType(type: InventoryType): Promise<InventoryItem[]>;
  findLowStock(): Promise<InventoryItem[]>;
  create(item: Omit<InventoryItem, "id" | "createdAt" | "updatedAt">): Promise<InventoryItem>;
  update(id: string, data: Partial<InventoryItem>): Promise<InventoryItem>;
}

export interface IAttendanceRepository {
  findActive(): Promise<AttendanceRecord[]>;
  findByUser(userId: string): Promise<AttendanceRecord[]>;
  checkIn(userId: string, method: AttendanceRecord["method"]): Promise<AttendanceRecord>;
  checkOut(userId: string, method: AttendanceRecord["method"]): Promise<void>;
}

export interface IShipmentRepository {
  create(orderId: string, data: Partial<Shipment>): Promise<Shipment>;
  findByOrder(orderId: string): Promise<Shipment | null>;
}

export interface IUserRepository {
  findByRole(role: UserRole): Promise<User[]>;
  findById(id: string): Promise<User | null>;
}

// Prisma repository implementations live in src/lib/services/app-data.service.ts
// API routes in src/app/api/* call the service layer.
