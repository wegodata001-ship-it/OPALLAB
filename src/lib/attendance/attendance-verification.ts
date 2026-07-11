import { isSystemAdminUser } from "@/lib/user-roles";
import type { User } from "@/lib/types";

export function canViewAttendanceVerification(
  currentUser: Pick<User, "id" | "role" | "roles"> | null | undefined,
  _recordUserId: string,
): boolean {
  if (!currentUser) return false;
  return isSystemAdminUser(currentUser);
}
