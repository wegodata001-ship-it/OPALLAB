import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors/app-error";

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return new AppError("VALIDATION_ERROR", "הרשומה כבר קיימת במערכת", 409, error.meta);
    }
    if (error.code === "P2025") {
      return new AppError("NOT_FOUND", "הרשומה לא נמצאה", 404, error.meta);
    }
    return new AppError("DATABASE_ERROR", "שגיאת מסד נתונים", 500, {
      code: error.code,
      meta: error.meta,
    });
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return new AppError("VALIDATION_ERROR", "נתונים לא תקינים", 400, error.message);
  }

  if (error instanceof Error) {
    if (error.message.toLowerCase().includes("storage")) {
      return new AppError("STORAGE_ERROR", "שגיאה באחסון הקבצים", 500, error.message);
    }
    if (error.message.toLowerCase().includes("upload")) {
      return new AppError("UPLOAD_ERROR", "שגיאה בהעלאת הקובץ", 400, error.message);
    }
    return new AppError("INTERNAL_ERROR", error.message, 500);
  }

  return new AppError("INTERNAL_ERROR", "שגיאה לא צפויה", 500);
}

export function logServerError(context: string, error: unknown): void {
  const appError = toAppError(error);
  console.error(`[${context}]`, {
    code: appError.code,
    message: appError.message,
    status: appError.status,
    details: appError.details,
    stack: error instanceof Error ? error.stack : undefined,
  });
}
