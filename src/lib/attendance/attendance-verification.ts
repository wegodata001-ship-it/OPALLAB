import { isSystemAdmin } from "@/lib/permissions";
import type { User } from "@/lib/types";

export function canViewAttendanceVerification(currentUser: Pick<User, "id" | "role" | "roles"> | null | undefined, recordUserId: string): boolean {
  if (!currentUser) return false;
  if (currentUser.id === recordUserId) return true;
  return isSystemAdmin(currentUser.role) || currentUser.role === "SECRETARY";
}
