import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors/app-error";
import { logServerError, toAppError } from "@/lib/errors/handle-error";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function jsonError(error: unknown) {
  const appError = toAppError(error);
  logServerError("api", error);
  return NextResponse.json(
    {
      success: false,
      error: {
        code: appError.code,
        message: appError.message,
        details: appError.details ?? undefined,
      },
    },
    { status: appError.status },
  );
}

export async function parseJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new AppError("VALIDATION_ERROR", "גוף הבקשה אינו תקין", 400);
  }
}
