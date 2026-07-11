import { AppError } from "@/lib/errors/app-error";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function createAuthUser(email: string, password: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new AppError("INTERNAL_ERROR", `יצירת משתמש Auth נכשלה: ${error?.message ?? "unknown"}`, 500);
  }

  return data.user.id;
}

export async function updateAuthUser(
  authUserId: string,
  updates: { email?: string; password?: string },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.auth.admin.updateUserById(authUserId, {
    email: updates.email,
    password: updates.password,
  });

  if (error) {
    if (error.message.toLowerCase().includes("email")) {
      throw new AppError("VALIDATION_ERROR", `עדכון אימייל נכשל: ${error.message}`, 400);
    }
    if (error.message.toLowerCase().includes("password")) {
      throw new AppError("VALIDATION_ERROR", `עדכון סיסמה נכשל: ${error.message}`, 400);
    }
    throw new AppError("INTERNAL_ERROR", `עדכון Auth נכשל: ${error.message}`, 500);
  }
}

export async function deleteAuthUser(authUserId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.auth.admin.deleteUser(authUserId);
  if (error) {
    throw new AppError("INTERNAL_ERROR", `מחיקת Auth נכשלה: ${error.message}`, 500);
  }
}

export async function ensureAuthUser(email: string, password: string): Promise<string> {
  try {
    return await createAuthUser(email, password);
  } catch (error) {
    if (error instanceof AppError && error.message.includes("already been registered")) {
      throw new AppError("VALIDATION_ERROR", "כתובת האימייל כבר קיימת ב-Supabase Auth", 409);
    }
    throw error;
  }
}
