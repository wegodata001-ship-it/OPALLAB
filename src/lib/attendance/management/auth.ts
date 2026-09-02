import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { isAttendanceManager } from "@/lib/attendance/management/access";

export { isAttendanceManager } from "@/lib/attendance/management/access";

export async function requireAttendanceManager(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new AppError("UNAUTHORIZED", "נדרשת התחברות", 401);
  }
  if (!isAttendanceManager({ role: user.role, roles: user.roles })) {
    throw new AppError("FORBIDDEN", "גישה למנהל או מזכירה בלבד", 403);
  }
  return user;
}
