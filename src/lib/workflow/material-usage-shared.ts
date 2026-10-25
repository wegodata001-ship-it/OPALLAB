import type { User } from "@/lib/types";
import { canDeleteOrders, isSystemAdminUser } from "@/lib/user-roles";
import { hasStageCompletionRole } from "@/lib/workflow-permissions";

export const MATERIAL_STAGES = ["DESIGN", "PRINTING_3D"] as const;
export type MaterialStage = (typeof MATERIAL_STAGES)[number];

export const MATERIAL_STAGE_LABELS: Record<MaterialStage, string> = {
  DESIGN: "עיצוב",
  PRINTING_3D: "הדפסה 3D",
};

export const USAGE_NOTE = "מספר השימושים המתועדים אינו מספר יחידות שנצרכו ואינו הפחתת מלאי.";

export function isMaterialStage(value: string): value is MaterialStage {
  return (MATERIAL_STAGES as readonly string[]).includes(value);
}

export function canRecordProductionMaterial(user: Pick<User, "role" | "roles">, stage: MaterialStage) {
  return hasStageCompletionRole(user, stage);
}

export function canCorrectAnyProductionMaterial(user: Pick<User, "role" | "roles">) {
  return canDeleteOrders(user);
}

export function canEditProductionMaterial(
  user: Pick<User, "id" | "role" | "roles">,
  record: { recordedById: string; stage: MaterialStage },
) {
  if (canCorrectAnyProductionMaterial(user)) return true;
  return record.recordedById === user.id && canRecordProductionMaterial(user, record.stage);
}

export function canViewMaterialUsageReport(user: Pick<User, "role" | "roles">) {
  return isSystemAdminUser(user);
}

export type MaterialOption = {
  heightId: string;
  modelKey: string;
  modelName: string;
  colorId: string;
  colorName: string;
  heightLabel: string;
  imageUrl: string | null;
  imagePath: string;
  barcode: string;
};

export type MaterialUseView = {
  id: string;
  orderId: string;
  orderSerial: string;
  stage: MaterialStage;
  stageLabel: string;
  heightId: string;
  modelName: string;
  colorName: string;
  heightLabel: string;
  imagePath: string;
  imageUrl: string | null;
  barcode: string;
  notes: string;
  recordedById: string;
  recordedByName: string;
  recordedAt: string;
  canEdit: boolean;
};

export type MaterialRevisionView = {
  id: string;
  action: string;
  actionLabel: string;
  modelName: string;
  colorName: string;
  heightLabel: string;
  notes: string;
  userName: string;
  createdAt: string;
};
